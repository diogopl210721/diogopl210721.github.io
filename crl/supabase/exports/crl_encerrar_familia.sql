-- CRL · Monitor pode encerrar o acolhimento + "família avisada" + ADM desfaz encerramento recente
begin;

alter table public.crl_stays
  add column if not exists family_notified boolean,
  add column if not exists family_note text,
  add column if not exists family_notified_at timestamptz,
  add column if not exists family_notified_by uuid references auth.users(id),
  add column if not exists closed_by uuid references auth.users(id);
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'crl_stays_family_note_len') then
    alter table public.crl_stays add constraint crl_stays_family_note_len check (family_note is null or length(family_note) <= 500);
  end if;
end $c$;

drop function if exists public.crl_close_stay(uuid,text,date,text);
create or replace function public.crl_close_stay(p_stay uuid, p_status text, p_date date, p_reason text,
  p_family_notified boolean default null, p_family_note text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_stay public.crl_stays%rowtype; v_actor uuid := (select auth.uid());
  v_note text := nullif(trim(coalesce(p_family_note, '')), '');
begin
  select * into v_stay from public.crl_stays where id = p_stay for update;
  if not found or v_actor is null or not public.crl_is_staff(v_stay.institution_id) then
    raise exception 'Somente a equipe (ADM ou monitor) pode encerrar o acolhimento';
  end if;
  if v_stay.status <> 'active' then raise exception 'O acolhimento já está encerrado'; end if;
  if p_status not in ('concluded','requested','administrative','abandoned','other') then raise exception 'Motivo da saída inválido'; end if;
  if p_date is null or p_date < v_stay.admission_date or p_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Data de saída inválida';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 4000 then raise exception 'Justificativa obrigatória'; end if;
  if p_status = 'concluded' and p_date < (v_stay.admission_date + interval '9 months')::date then
    raise exception 'Conclusão exige nove meses completos; use o desfecho real e justifique';
  end if;
  if p_family_notified is null then raise exception 'Marque se a família foi avisada'; end if;
  if p_family_notified and (v_note is null or length(v_note) < 3) then raise exception 'Escreva quem da família foi avisado e como'; end if;
  if length(coalesce(v_note, '')) > 500 then raise exception 'Texto do aviso à família longo demais'; end if;
  update public.crl_stays set status = p_status, departure_date = p_date, departure_reason = trim(p_reason),
    closed_by = v_actor, family_notified = p_family_notified, family_note = v_note,
    family_notified_at = case when p_family_notified then now() else null end,
    family_notified_by = case when p_family_notified then v_actor else null end
  where id = p_stay;
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (v_stay.institution_id, v_actor, 'closed', 'crl_stays', p_stay,
          jsonb_build_object('status', p_status, 'date', p_date, 'reason', trim(p_reason), 'family_notified', p_family_notified, 'family_note', v_note));
  with blocked as (
    update public.crl_members set active = false
    where institution_id = v_stay.institution_id and role = 'monitor' and resident_id = v_stay.resident_id and active
    returning id)
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  select v_stay.institution_id, v_actor, 'monitor_blocked_on_exit', 'crl_members', blocked.id, jsonb_build_object('stay_id', p_stay)
  from blocked;
  return p_stay;
end $function$;

-- Família avisada depois (para saídas marcadas como "ainda não")
create or replace function public.crl_mark_family_notified(p_stay uuid, p_note text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_stay public.crl_stays%rowtype; v_actor uuid := (select auth.uid()); v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_stay from public.crl_stays where id = p_stay for update;
  if not found or v_actor is null or not public.crl_is_staff(v_stay.institution_id) then raise exception 'Acesso negado'; end if;
  if v_stay.status = 'active' then raise exception 'O acolhimento ainda está ativo'; end if;
  if v_note is null or length(v_note) < 3 or length(v_note) > 500 then raise exception 'Escreva quem da família foi avisado e como'; end if;
  perform set_config('crl.trusted_change', 'on', true);
  update public.crl_stays set family_notified = true, family_note = v_note, family_notified_at = now(), family_notified_by = v_actor where id = p_stay;
  perform set_config('crl.trusted_change', 'off', true);
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (v_stay.institution_id, v_actor, 'family_notified', 'crl_stays', p_stay, jsonb_build_object('note', v_note));
end $function$;

-- Saídas dos últimos 30 dias sem aviso à família (aparece no Painel)
create or replace function public.crl_family_pending(p_institution uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
begin
  if (select auth.uid()) is null or not public.crl_is_staff(p_institution) then raise exception 'Acesso negado'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('stay_id', s.id, 'resident', r.full_name, 'departure_date', s.departure_date,
            'responsible', r.responsible_name) order by s.departure_date desc), '[]'::jsonb)
          from public.crl_stays s join public.crl_residents r on r.id = s.resident_id
          where s.institution_id = p_institution and s.status <> 'active' and s.family_notified = false
            and s.departure_date >= (now() at time zone 'America/Sao_Paulo')::date - 30);
end $function$;

-- ADM desfaz um encerramento feito por engano (até 7 dias, se a pessoa não tiver outro período depois)
create or replace function public.crl_undo_close_stay(p_stay uuid, p_reason text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_stay public.crl_stays%rowtype; v_actor uuid := (select auth.uid()); v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_stay from public.crl_stays where id = p_stay for update;
  if not found or v_actor is null or not public.crl_is_member(v_stay.institution_id, true) then raise exception 'Somente o ADM desfaz um encerramento'; end if;
  if v_stay.status = 'active' then raise exception 'O acolhimento já está ativo'; end if;
  if v_reason is null or length(v_reason) < 3 then raise exception 'Informe o motivo'; end if;
  if v_stay.departure_date < (now() at time zone 'America/Sao_Paulo')::date - 7 then raise exception 'Só dá para desfazer encerramentos dos últimos 7 dias. Para mais antigos, abra um novo período'; end if;
  if exists (select 1 from public.crl_stays o where o.resident_id = v_stay.resident_id and o.id <> v_stay.id and o.admission_date >= v_stay.admission_date) then
    raise exception 'Esta pessoa já tem um período mais novo'; end if;
  perform set_config('crl.trusted_change', 'on', true);
  update public.crl_stays set status = 'active', departure_date = null, departure_reason = null, closed_by = null,
    family_notified = null, family_note = null, family_notified_at = null, family_notified_by = null
  where id = p_stay;
  perform set_config('crl.trusted_change', 'off', true);
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (v_stay.institution_id, v_actor, 'close_undone', 'crl_stays', p_stay, jsonb_build_object('reason', v_reason, 'before', to_jsonb(v_stay)));
end $function$;

revoke execute on function public.crl_close_stay(uuid,text,date,text,boolean,text) from public, anon;
revoke execute on function public.crl_mark_family_notified(uuid,text) from public, anon;
revoke execute on function public.crl_family_pending(uuid) from public, anon;
revoke execute on function public.crl_undo_close_stay(uuid,text) from public, anon;
grant execute on function public.crl_close_stay(uuid,text,date,text,boolean,text) to authenticated;
grant execute on function public.crl_mark_family_notified(uuid,text) to authenticated;
grant execute on function public.crl_family_pending(uuid) to authenticated;
grant execute on function public.crl_undo_close_stay(uuid,text) to authenticated;

commit;
