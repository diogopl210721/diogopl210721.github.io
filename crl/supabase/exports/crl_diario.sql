-- CRL · Diário da casa: resumo geral do dia + apontamentos por acolhido (etiquetas para estatística).
-- Monitor registra e não altera; ADM altera, exclui ou reabre para quem escreveu (sempre com motivo).
begin;

create or replace function public.crl_is_staff(p_inst uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
  select exists(select 1 from public.crl_members m
                where m.institution_id = p_inst and m.auth_user_id = (select auth.uid()) and m.active
                  and (m.role = 'admin' or coalesce(m.monitor_vinculo, '') <> 'aluno'))
$$;
revoke execute on function public.crl_is_staff(uuid) from public, anon;
grant execute on function public.crl_is_staff(uuid) to authenticated;

create table if not exists public.crl_diaries(
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.crl_institutions(id),
  day date not null,
  shift text not null default 'dia' check (shift in ('dia','manha','tarde','noite')),
  general_text text not null check (length(general_text) between 10 and 20000),
  raw_text text check (raw_text is null or length(raw_text) <= 20000),
  ai_used boolean not null default false,
  status text not null default 'closed' check (status in ('closed','reopened')),
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  reopened_at timestamptz, reopened_by uuid references auth.users(id), reopen_reason text,
  deleted_at timestamptz, deleted_by uuid references auth.users(id), delete_reason text
);
create index if not exists crl_diaries_day_idx on public.crl_diaries(institution_id, day desc) where deleted_at is null;

create table if not exists public.crl_diary_entries(
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.crl_institutions(id),
  diary_id uuid not null references public.crl_diaries(id),
  stay_id uuid not null references public.crl_stays(id),
  tags text[] not null default '{}',
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (diary_id, stay_id)
);
create index if not exists crl_diary_entries_stay_idx on public.crl_diary_entries(stay_id);

alter table public.crl_diaries enable row level security;
alter table public.crl_diary_entries enable row level security;
revoke all on public.crl_diaries, public.crl_diary_entries from anon;
revoke insert, update, delete, truncate on public.crl_diaries, public.crl_diary_entries from authenticated;
grant select on public.crl_diaries, public.crl_diary_entries to authenticated;
drop policy if exists crl_diaries_select on public.crl_diaries;
create policy crl_diaries_select on public.crl_diaries for select to authenticated using (public.crl_is_staff(institution_id));
drop policy if exists crl_diary_entries_select on public.crl_diary_entries;
create policy crl_diary_entries_select on public.crl_diary_entries for select to authenticated using (public.crl_is_staff(institution_id));

-- Salvar (novo ou alteração). Novo: qualquer pessoa da equipe. Alterar: ADM (com motivo) ou o autor quando o ADM reabriu.
create or replace function public.crl_diary_save(p_institution uuid, p_day date, p_shift text, p_general text, p_entries jsonb,
  p_raw text default null, p_ai_used boolean default false, p_diary uuid default null, p_reason text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_general text := trim(coalesce(p_general, ''));
  v_raw text := nullif(trim(coalesce(p_raw, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_allowed text[] := array['positivo','ocorrencia','saude','familia','atividade','comportamento','espiritual'];
  d public.crl_diaries%rowtype; e jsonb; v_stay uuid; v_tags text[]; v_note text; v_id uuid; v_before jsonb; v_seen uuid[] := '{}';
begin
  if v_actor is null or not public.crl_is_staff(p_institution) then raise exception 'Acesso negado'; end if;
  v_admin := public.crl_is_member(p_institution, true);
  if length(v_general) < 10 then raise exception 'Escreva o resumo do dia (pelo menos uma frase)'; end if;
  if length(v_general) > 20000 or length(coalesce(v_raw, '')) > 20000 then raise exception 'Texto longo demais'; end if;
  if p_shift is null or p_shift not in ('dia','manha','tarde','noite') then raise exception 'Turno inválido'; end if;
  if p_day is null or p_day > v_today then raise exception 'Data inválida'; end if;
  if not v_admin and p_day < v_today - 7 then raise exception 'Diário de mais de 7 dias atrás: só o ADM registra'; end if;
  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 200 then
    raise exception 'Lista de acolhidos inválida';
  end if;

  if p_diary is null then
    insert into public.crl_diaries(institution_id, day, shift, general_text, raw_text, ai_used, author_id)
    values (p_institution, p_day, p_shift, v_general, v_raw, coalesce(p_ai_used, false), v_actor)
    returning id into v_id;
  else
    select * into d from public.crl_diaries where id = p_diary and institution_id = p_institution for update;
    if not found or d.deleted_at is not null then raise exception 'Diário não encontrado'; end if;
    if v_admin then
      if v_reason is null or length(v_reason) < 3 then raise exception 'Informe o motivo da alteração'; end if;
    elsif not (d.author_id = v_actor and d.status = 'reopened') then
      raise exception 'Diário salvo não pode ser alterado. Peça ao ADM para reabrir';
    end if;
    v_before := to_jsonb(d) || jsonb_build_object('entries',
      (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.crl_diary_entries x where x.diary_id = p_diary));
    update public.crl_diaries set
      day = case when v_admin then p_day else day end,
      shift = p_shift, general_text = v_general,
      raw_text = coalesce(v_raw, raw_text),
      ai_used = ai_used or coalesce(p_ai_used, false),
      status = 'closed', updated_at = now(), updated_by = v_actor
    where id = p_diary;
    delete from public.crl_diary_entries where diary_id = p_diary;
    v_id := p_diary;
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    v_stay := nullif(e->>'stay_id', '')::uuid;
    if v_stay is null or v_stay = any(v_seen) then continue; end if;
    if not exists (select 1 from public.crl_stays s where s.id = v_stay and s.institution_id = p_institution
                   and (s.status = 'active' or v_admin)) then
      raise exception 'Acolhido inválido no diário';
    end if;
    select coalesce(array_agg(distinct x.tag), '{}'::text[]) into v_tags
    from jsonb_array_elements_text(coalesce(e->'tags', '[]'::jsonb)) as x(tag) where x.tag = any(v_allowed);
    v_note := nullif(trim(coalesce(e->>'note', '')), '');
    if length(coalesce(v_note, '')) > 2000 then raise exception 'Apontamento longo demais'; end if;
    insert into public.crl_diary_entries(institution_id, diary_id, stay_id, tags, note) values (p_institution, v_id, v_stay, v_tags, v_note);
    v_seen := v_seen || v_stay;
  end loop;

  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (p_institution, v_actor, case when p_diary is null then 'diary_created' else 'diary_edited' end, 'crl_diaries', v_id,
          jsonb_build_object('day', p_day, 'people', cardinality(v_seen), 'ai_used', coalesce(p_ai_used, false),
                             'reason', v_reason, 'before', v_before));
  return v_id;
end $function$;

-- ADM reabre para quem escreveu corrigir
create or replace function public.crl_diary_reopen(p_diary uuid, p_reason text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_actor uuid := (select auth.uid()); d public.crl_diaries%rowtype; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into d from public.crl_diaries where id = p_diary for update;
  if v_actor is null or not found or d.deleted_at is not null or not public.crl_is_member(d.institution_id, true) then
    raise exception 'Somente o ADM reabre o diário';
  end if;
  if v_reason is null or length(v_reason) < 3 then raise exception 'Informe o motivo'; end if;
  update public.crl_diaries set status = 'reopened', reopened_at = now(), reopened_by = v_actor, reopen_reason = v_reason where id = p_diary;
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (d.institution_id, v_actor, 'diary_reopened', 'crl_diaries', p_diary, jsonb_build_object('reason', v_reason));
end $function$;

-- ADM exclui (fica guardado na Auditoria)
create or replace function public.crl_diary_delete(p_diary uuid, p_reason text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_actor uuid := (select auth.uid()); d public.crl_diaries%rowtype; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into d from public.crl_diaries where id = p_diary for update;
  if v_actor is null or not found or d.deleted_at is not null or not public.crl_is_member(d.institution_id, true) then
    raise exception 'Somente o ADM exclui o diário';
  end if;
  if v_reason is null or length(v_reason) < 3 then raise exception 'Informe o motivo'; end if;
  update public.crl_diaries set deleted_at = now(), deleted_by = v_actor, delete_reason = v_reason where id = p_diary;
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (d.institution_id, v_actor, 'diary_deleted', 'crl_diaries', p_diary,
          jsonb_build_object('reason', v_reason, 'before', to_jsonb(d) || jsonb_build_object('entries',
            (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.crl_diary_entries x where x.diary_id = p_diary))));
end $function$;

-- Lista para a tela e para o prontuário (com nome de quem escreveu e dos acolhidos)
create or replace function public.crl_diary_list(p_institution uuid, p_stay uuid default null, p_from date default null)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_admin boolean; v_rows jsonb;
begin
  if (select auth.uid()) is null or not public.crl_is_staff(p_institution) then raise exception 'Acesso negado'; end if;
  v_admin := public.crl_is_member(p_institution, true);
  select coalesce(jsonb_agg(x.j order by x.day desc, x.created_at desc), '[]'::jsonb) into v_rows from (
    select d.day, d.created_at, jsonb_build_object(
      'id', d.id, 'day', d.day, 'shift', d.shift, 'general_text', d.general_text,
      'raw_text', case when v_admin then d.raw_text else null end,
      'ai_used', d.ai_used, 'status', d.status, 'author_id', d.author_id,
      'author', coalesce((select m.display_name from public.crl_members m where m.auth_user_id = d.author_id and m.institution_id = d.institution_id limit 1), 'Equipe'),
      'created_at', d.created_at, 'updated_at', d.updated_at, 'edited', d.updated_by is not null,
      'reopened_at', d.reopened_at, 'reopen_reason', d.reopen_reason,
      'entries', (select coalesce(jsonb_agg(jsonb_build_object('stay_id', e.stay_id, 'tags', e.tags, 'note', e.note,
                     'resident', case when s.status = 'active' or v_admin then r.full_name else 'Acolhido que saiu' end)
                     order by r.full_name), '[]'::jsonb)
                  from public.crl_diary_entries e join public.crl_stays s on s.id = e.stay_id join public.crl_residents r on r.id = s.resident_id
                  where e.diary_id = d.id)) as j
    from public.crl_diaries d
    where d.institution_id = p_institution and d.deleted_at is null
      and (p_from is null or d.day >= p_from)
      and (p_stay is null or exists (select 1 from public.crl_diary_entries e2 where e2.diary_id = d.id and e2.stay_id = p_stay))
    order by d.day desc, d.created_at desc
    limit 150
  ) x;
  return v_rows;
end $function$;

revoke execute on function public.crl_diary_save(uuid,date,text,text,jsonb,text,boolean,uuid,text) from public, anon;
revoke execute on function public.crl_diary_reopen(uuid,text) from public, anon;
revoke execute on function public.crl_diary_delete(uuid,text) from public, anon;
revoke execute on function public.crl_diary_list(uuid,uuid,date) from public, anon;
grant execute on function public.crl_diary_save(uuid,date,text,text,jsonb,text,boolean,uuid,text) to authenticated;
grant execute on function public.crl_diary_reopen(uuid,text) to authenticated;
grant execute on function public.crl_diary_delete(uuid,text) to authenticated;
grant execute on function public.crl_diary_list(uuid,uuid,date) to authenticated;

-- Painel: diário de hoje; relatório mensal: o que o diário diz de cada acolhido
do $patch$
declare d text; o text;
begin
  d := pg_get_functiondef('public.crl_dashboard_cards(uuid)'::regprocedure); o := d;
  d := replace(d, $x$'trips_month',$x$,
    $x$'diaries_today',(select count(*) from public.crl_diaries dd where dd.institution_id=p_institution and dd.deleted_at is null and dd.day=v_today),
   'trips_month',$x$);
  if d = o or position('diaries_today' in d) = 0 then raise exception 'patch painel (diário) não aplicado'; end if;
  execute d;

  d := pg_get_functiondef('public.crl_prepare_evolution_report(uuid,date)'::regprocedure); o := d;
  d := replace(d, 'v_meds jsonb;', 'v_meds jsonb;v_diary jsonb;');
  d := replace(d, ' v_meds:=public.crl_med_month(p_stay,p_month);',
    ' v_meds:=public.crl_med_month(p_stay,p_month);' || chr(10) ||
    $x$ select jsonb_build_object('mentions',count(*),'positivo',count(*) filter(where 'positivo'=any(e.tags)),'ocorrencia',count(*) filter(where 'ocorrencia'=any(e.tags)),'saude',count(*) filter(where 'saude'=any(e.tags)),'familia',count(*) filter(where 'familia'=any(e.tags)),'atividade',count(*) filter(where 'atividade'=any(e.tags)),'comportamento',count(*) filter(where 'comportamento'=any(e.tags)),'espiritual',count(*) filter(where 'espiritual'=any(e.tags))) into v_diary from public.crl_diary_entries e join public.crl_diaries dd on dd.id=e.diary_id and dd.deleted_at is null where e.stay_id=p_stay and dd.day>=p_month and dd.day<v_next;$x$);
  d := replace(d, $x$ 'med_doses',v_meds,$x$, $x$ 'med_doses',v_meds,'diary',v_diary,$x$);
  d := replace(d, $x$E'\nRemédios: '$x$,
    $x$E'\nDiário da casa: citado em '||(v_diary->>'mentions')||' registro(s) — destaques positivos: '||(v_diary->>'positivo')||'; ocorrências: '||(v_diary->>'ocorrencia')||'; saúde: '||(v_diary->>'saude')||'; família/visita: '||(v_diary->>'familia')||'; atividade: '||(v_diary->>'atividade')||'; comportamento: '||(v_diary->>'comportamento')||'; vida espiritual: '||(v_diary->>'espiritual')||'.'||E'\nRemédios: '$x$);
  if position('v_diary jsonb' in d) = 0 or position('''diary'',v_diary' in d) = 0 or position('Diário da casa' in d) = 0 then
    raise exception 'patch relatório mensal (diário) não aplicado';
  end if;
  execute d;
end $patch$;

commit;
