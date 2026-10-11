-- CRL · Remédios de hoje: horários definidos pelo ADM, foto do remédio, conferência antes de dar e doses atrasadas.
-- Tudo numa transação: se qualquer parte falhar, nada é aplicado.
begin;

alter table public.crl_medication_records
  add column if not exists times time[] not null default '{}',
  add column if not exists as_needed boolean not null default false,
  add column if not exists instructions text,
  add column if not exists box_file_id uuid references public.crl_files(id),
  add column if not exists start_date date,
  add column if not exists end_date date;
alter table public.crl_medication_administrations
  add column if not exists scheduled_for timestamptz,
  add column if not exists double_checked boolean not null default false;
create unique index if not exists crl_med_adm_dose_uq
  on public.crl_medication_administrations(medication_record_id, scheduled_for) where scheduled_for is not null;

-- Doses que existem num dia (uso interno; não é chamada direto pela tela)
create or replace function public.crl_dose_slots(p_institution uuid, p_day date)
returns table(medication_id uuid, stay_id uuid, slot time, scheduled_for timestamptz)
language sql stable security definer set search_path to ''
as $$
  select m.id, m.stay_id, t.slot, ((p_day + t.slot) at time zone 'America/Sao_Paulo')
  from public.crl_medication_records m
  join public.crl_stays s on s.id = m.stay_id and s.status = 'active'
  cross join lateral unnest(m.times) as t(slot)
  where m.institution_id = p_institution and m.verified_by is not null and m.suspended_at is null
    and not m.as_needed
    and (m.start_date is null or m.start_date <= p_day)
    and (m.end_date is null or m.end_date >= p_day)
$$;
revoke execute on function public.crl_dose_slots(uuid,date) from public, anon, authenticated;

-- ADM define horários, se é "só se necessário", instruções, foto do remédio e até quando tomar
create or replace function public.crl_med_schedule_set(p_medication uuid, p_times text[], p_as_needed boolean default false,
  p_instructions text default null, p_box_file uuid default null, p_end_date date default null)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  m public.crl_medication_records%rowtype; v_times time[];
begin
  select * into m from public.crl_medication_records where id = p_medication for update;
  if v_actor is null or not found or not public.crl_is_member(m.institution_id, true) then
    raise exception 'Somente o ADM define os horários do remédio';
  end if;
  if m.suspended_at is not null then raise exception 'Medicamento suspenso'; end if;
  begin
    select coalesce(array_agg(distinct trim(x)::time order by trim(x)::time), '{}'::time[]) into v_times
    from unnest(coalesce(p_times, '{}'::text[])) x where nullif(trim(x), '') is not null;
  exception when others then raise exception 'Horário inválido. Use o formato 08:00';
  end;
  if coalesce(p_as_needed, false) then v_times := '{}'; end if;
  if not coalesce(p_as_needed, false) and cardinality(v_times) = 0 then raise exception 'Escolha pelo menos um horário (ou marque "só se necessário")'; end if;
  if cardinality(v_times) > 8 then raise exception 'No máximo 8 horários por dia'; end if;
  if length(coalesce(p_instructions, '')) > 300 then raise exception 'Instrução longa demais'; end if;
  if p_end_date is not null and p_end_date < v_today then raise exception 'A data final já passou'; end if;
  if p_box_file is not null and not exists (select 1 from public.crl_files f where f.id = p_box_file
       and f.institution_id = m.institution_id and f.stay_id = m.stay_id and f.deleted_at is null
       and f.category in ('remedio','receita','foto','outro')) then
    raise exception 'Foto do remédio não encontrada';
  end if;
  update public.crl_medication_records set
    times = v_times,
    as_needed = coalesce(p_as_needed, false),
    instructions = nullif(trim(coalesce(p_instructions, '')), ''),
    box_file_id = coalesce(p_box_file, box_file_id),
    end_date = p_end_date,
    -- horários novos valem a partir de hoje (as doses antigas não viram "atrasadas")
    start_date = case when m.times is distinct from v_times or m.start_date is null then v_today else m.start_date end
  where id = p_medication;
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (m.institution_id, v_actor, 'medication_schedule_set', 'crl_medication_records', p_medication,
          jsonb_build_object('before', jsonb_build_object('times', m.times, 'as_needed', m.as_needed, 'instructions', m.instructions, 'box_file_id', m.box_file_id, 'end_date', m.end_date),
                             'after', jsonb_build_object('times', v_times, 'as_needed', coalesce(p_as_needed, false), 'instructions', nullif(trim(coalesce(p_instructions, '')), ''), 'box_file_id', coalesce(p_box_file, m.box_file_id), 'end_date', p_end_date)));
  return jsonb_build_object('ok', true, 'times', v_times);
end $function$;

-- Tela "Remédios de hoje": doses do dia com quem toma, remédio, dose, foto e situação
create or replace function public.crl_doses_day(p_institution uuid, p_day date default null)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_day date := coalesce(p_day, (now() at time zone 'America/Sao_Paulo')::date);
  v_doses jsonb; v_unscheduled jsonb; v_as_needed jsonb;
begin
  if (select auth.uid()) is null or not public.crl_is_member(p_institution, false) then raise exception 'Acesso negado'; end if;
  if not public.crl_is_member(p_institution, true) and not exists (select 1 from public.crl_members mm
       where mm.auth_user_id = (select auth.uid()) and mm.institution_id = p_institution and mm.active
         and coalesce(mm.monitor_vinculo, '') <> 'aluno') then
    raise exception 'Acesso restrito à equipe';
  end if;
  if v_day > v_today or v_day < v_today - 7 then raise exception 'Escolha um dia da última semana'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'medication_id', d.medication_id, 'stay_id', d.stay_id, 'resident', r.full_name,
      'medication_name', m.medication_name, 'dose_text', m.dose_text, 'instructions', m.instructions,
      'slot', to_char(d.slot, 'HH24:MI'), 'scheduled_for', d.scheduled_for,
      'box_path', bf.storage_path, 'prescription_path', pf.storage_path,
      'administration_id', a.id, 'status', a.status, 'notes', a.notes, 'recorded_at', a.occurred_at,
      'recorded_by', case when a.id is null then null else coalesce(mb.display_name, 'Equipe') end)
      order by d.slot, r.full_name, m.medication_name), '[]'::jsonb)
  into v_doses
  from public.crl_dose_slots(p_institution, v_day) d
  join public.crl_medication_records m on m.id = d.medication_id
  join public.crl_stays s on s.id = d.stay_id
  join public.crl_residents r on r.id = s.resident_id
  left join public.crl_files bf on bf.id = m.box_file_id and bf.deleted_at is null
  left join public.crl_files pf on pf.id = m.prescription_file_id and pf.deleted_at is null
  left join public.crl_medication_administrations a on a.medication_record_id = d.medication_id and a.scheduled_for = d.scheduled_for
  left join public.crl_members mb on mb.auth_user_id = a.recorded_by and mb.institution_id = p_institution;

  select coalesce(jsonb_agg(jsonb_build_object('medication_id', m.id, 'resident', r.full_name, 'medication_name', m.medication_name,
           'dose_text', m.dose_text, 'instructions', m.instructions, 'box_path', bf.storage_path, 'prescription_path', pf.storage_path,
           'given_today', (select count(*) from public.crl_medication_administrations a where a.medication_record_id = m.id
                             and (a.occurred_at at time zone 'America/Sao_Paulo')::date = v_day))
           order by r.full_name, m.medication_name), '[]'::jsonb)
  into v_as_needed
  from public.crl_medication_records m
  join public.crl_stays s on s.id = m.stay_id and s.status = 'active'
  join public.crl_residents r on r.id = s.resident_id
  left join public.crl_files bf on bf.id = m.box_file_id and bf.deleted_at is null
  left join public.crl_files pf on pf.id = m.prescription_file_id and pf.deleted_at is null
  where m.institution_id = p_institution and m.verified_by is not null and m.suspended_at is null and m.as_needed
    and (m.end_date is null or m.end_date >= v_day);

  select coalesce(jsonb_agg(jsonb_build_object('medication_id', m.id, 'stay_id', m.stay_id, 'resident', r.full_name, 'medication_name', m.medication_name,
           'dose_text', m.dose_text, 'schedule_text', m.schedule_text) order by r.full_name), '[]'::jsonb)
  into v_unscheduled
  from public.crl_medication_records m
  join public.crl_stays s on s.id = m.stay_id and s.status = 'active'
  join public.crl_residents r on r.id = s.resident_id
  where m.institution_id = p_institution and m.verified_by is not null and m.suspended_at is null
    and not m.as_needed and cardinality(m.times) = 0;

  return jsonb_build_object('day', v_day, 'today', v_today, 'now', now(),
                            'doses', v_doses, 'as_needed', v_as_needed, 'unscheduled', v_unscheduled);
end $function$;

-- Monitor registra a dose: deu (depois de conferir a caixa), recusou, não deu ou não tinha
create or replace function public.crl_record_dose(p_medication uuid, p_scheduled_for timestamptz, p_status text,
  p_checked boolean default false, p_notes text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_day date := (p_scheduled_for at time zone 'America/Sao_Paulo')::date;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  m public.crl_medication_records%rowtype; v_id uuid;
begin
  select * into m from public.crl_medication_records where id = p_medication;
  if v_actor is null or not found or not public.crl_is_member(m.institution_id, false) or not public.crl_can_access_stay(m.stay_id) then
    raise exception 'Remédio não encontrado';
  end if;
  if m.verified_by is null then raise exception 'Remédio ainda não conferido pelo ADM'; end if;
  if m.suspended_at is not null then raise exception 'Medicamento suspenso pelo ADM'; end if;
  if p_scheduled_for is null or not exists (select 1 from public.crl_dose_slots(m.institution_id, v_day) d
       where d.medication_id = p_medication and d.scheduled_for = p_scheduled_for) then
    raise exception 'Esse horário não está na receita conferida';
  end if;
  if p_scheduled_for > now() + interval '2 hours' then raise exception 'Ainda não chegou a hora dessa dose'; end if;
  if v_day < v_today - 1 and not public.crl_is_member(m.institution_id, true) then
    raise exception 'Dose de mais de um dia atrás: só o ADM registra';
  end if;
  if p_status is null or p_status not in ('administrado','recusado','nao_administrado','indisponivel') then raise exception 'Situação inválida'; end if;
  if p_status = 'administrado' and not coalesce(p_checked, false) then
    raise exception 'Confira o nome e a dose na caixa antes de marcar que deu';
  end if;
  if p_status <> 'administrado' and (v_notes is null or length(v_notes) < 3) then raise exception 'Escreva o motivo'; end if;
  if length(coalesce(v_notes, '')) > 1500 then raise exception 'Observação longa demais'; end if;
  if exists (select 1 from public.crl_medication_administrations a where a.medication_record_id = p_medication and a.scheduled_for = p_scheduled_for) then
    raise exception 'Essa dose já foi registrada. Para corrigir, fale com o ADM';
  end if;
  insert into public.crl_medication_administrations(institution_id, medication_record_id, status, notes, recorded_by, scheduled_for, double_checked)
  values (m.institution_id, p_medication, p_status, v_notes, v_actor, p_scheduled_for, coalesce(p_checked, false))
  returning id into v_id;
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (m.institution_id, v_actor, 'dose_recorded', 'crl_medication_administrations', v_id,
          jsonb_build_object('medication_record_id', p_medication, 'scheduled_for', p_scheduled_for, 'status', p_status, 'checked_box', coalesce(p_checked, false)));
  return v_id;
end $function$;

-- Resumo do mês por acolhido (ADM): doses dadas, recusadas, não dadas e sem registro
create or replace function public.crl_med_month(p_stay uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_stay public.crl_stays%rowtype;
  v_start date := date_trunc('month', p_month)::date;
  v_last date; v_counts jsonb; v_missing bigint;
begin
  select * into v_stay from public.crl_stays where id = p_stay;
  if (select auth.uid()) is null or not found or not public.crl_is_member(v_stay.institution_id, true) then raise exception 'Somente ADM'; end if;
  v_last := least((v_start + interval '1 month')::date - 1, (now() at time zone 'America/Sao_Paulo')::date);
  select jsonb_build_object(
      'given', count(*) filter (where a.status = 'administrado'),
      'refused', count(*) filter (where a.status = 'recusado'),
      'not_given', count(*) filter (where a.status in ('nao_administrado','indisponivel')))
  into v_counts
  from public.crl_medication_administrations a
  join public.crl_medication_records m on m.id = a.medication_record_id
  where m.stay_id = p_stay
    and (coalesce(a.scheduled_for, a.occurred_at) at time zone 'America/Sao_Paulo')::date between v_start and (v_start + interval '1 month')::date - 1;
  select count(*) into v_missing
  from generate_series(v_start, v_last, interval '1 day') g(day)
  cross join lateral public.crl_dose_slots(v_stay.institution_id, g.day::date) d
  where d.stay_id = p_stay and d.scheduled_for < now() - interval '1 hour'
    and not exists (select 1 from public.crl_medication_administrations a
                    where a.medication_record_id = d.medication_id and a.scheduled_for = d.scheduled_for);
  return v_counts || jsonb_build_object('missing', v_missing);
end $function$;

revoke execute on function public.crl_med_schedule_set(uuid,text[],boolean,text,uuid,date) from public, anon;
revoke execute on function public.crl_doses_day(uuid,date) from public, anon;
revoke execute on function public.crl_record_dose(uuid,timestamptz,text,boolean,text) from public, anon;
revoke execute on function public.crl_med_month(uuid,date) from public, anon;
grant execute on function public.crl_med_schedule_set(uuid,text[],boolean,text,uuid,date) to authenticated;
grant execute on function public.crl_doses_day(uuid,date) to authenticated;
grant execute on function public.crl_record_dose(uuid,timestamptz,text,boolean,text) to authenticated;
grant execute on function public.crl_med_month(uuid,date) to authenticated;

-- Painel: doses atrasadas (passou 1 hora sem registro) e relatório mensal com os remédios
do $patch$
declare d text; o text;
begin
  d := pg_get_functiondef('public.crl_dashboard_cards(uuid)'::regprocedure); o := d;
  d := replace(d, $x$'trips_month',$x$,
    $x$'meds_late',(select count(*) from public.crl_dose_slots(p_institution,v_today) ds where ds.scheduled_for < now() - interval '1 hour' and not exists(select 1 from public.crl_medication_administrations ma where ma.medication_record_id=ds.medication_id and ma.scheduled_for=ds.scheduled_for)),
   'trips_month',$x$);
  if d = o or position('meds_late' in d) = 0 then raise exception 'patch painel (remédios) não aplicado'; end if;
  execute d;

  d := pg_get_functiondef('public.crl_prepare_evolution_report(uuid,date)'::regprocedure); o := d;
  d := replace(d, 'v_existing text;', 'v_existing text;v_meds jsonb;');
  d := replace(d, ' v_counts:=jsonb_build_object(', ' v_meds:=public.crl_med_month(p_stay,p_month);' || chr(10) || ' v_counts:=jsonb_build_object(' || chr(10) || ' ''med_doses'',v_meds,');
  d := replace(d, $x$E'\nRessocializações iniciadas: '$x$,
    $x$E'\nRemédios: '||coalesce(v_meds->>'given','0')||' doses dadas, '||coalesce(v_meds->>'refused','0')||' recusadas, '||coalesce(v_meds->>'not_given','0')||' não dadas e '||coalesce(v_meds->>'missing','0')||' sem registro.'||E'\nRessocializações iniciadas: '$x$);
  if position('v_meds jsonb' in d) = 0 or position('med_doses' in d) = 0 or position('Remédios: ' in d) = 0 then
    raise exception 'patch relatório mensal (remédios) não aplicado';
  end if;
  execute d;

  -- nova categoria de arquivo: foto do remédio (caixa / cartela)
  d := pg_get_functiondef('public.crl_change(text,uuid,text,jsonb,text)'::regprocedure); o := d;
  d := replace(d, $x$rfl.category not in ('documento','receita','pertences','foto','outro')$x$, $x$rfl.category not in ('documento','receita','pertences','foto','remedio','outro')$x$);
  if d = o then raise exception 'patch crl_change (categoria remédio) não aplicado'; end if;
  execute d;
end $patch$;

commit;
