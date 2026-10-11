-- CRL · Ajustes das abas (prontuário, escala semanal, refeições do dia, extrato do caixa, estoque do mês)
-- Tudo numa transação: se qualquer parte falhar, nada é aplicado.
begin;

-- 0) Arquivos ganham "o que é" (ex.: Receita de Amoxicilina — Dr. João)
alter table public.crl_files add column if not exists description text;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'crl_files_description_len') then
    alter table public.crl_files add constraint crl_files_description_len check (description is null or length(description) <= 300);
  end if;
end $c$;
grant insert (description) on public.crl_files to authenticated;

-- 1) PRONTUÁRIO: só o ADM corrige (presença, ressocialização, ocorrência de remédio, registros de rotina e arquivos).
do $patch$
declare d text; o text;
begin
  d := pg_get_functiondef('public.crl_change(text,uuid,text,jsonb,text)'::regprocedure); o := d;
  d := replace(d, 'public.crl_may_change(v_inst, rfl.uploaded_by, rfl.created_at)', 'public.crl_is_member(v_inst, true)');
  d := replace(d, 'Só o ADM, ou quem enviou no mesmo dia, pode alterar', 'Somente o ADM altera o prontuário');
  d := replace(d, 'if c ? ''category'' then rfl.category := c->>''category''; end if;',
    'if c ? ''category'' then rfl.category := c->>''category''; end if;' || chr(10) ||
    '      if c ? ''description'' then rfl.description := nullif(trim(c->>''description''), ''''); end if;' || chr(10) ||
    '      if length(coalesce(rfl.description, '''')) > 300 then raise exception ''Descrição longa demais''; end if;');
  d := replace(d, 'update public.crl_files set category = rfl.category where id = p_id;',
    'update public.crl_files set category = rfl.category, description = rfl.description where id = p_id;');
  if position('rfl.uploaded_by, rfl.created_at' in d) > 0 or position('description = rfl.description' in d) = 0 then
    raise exception 'patch crl_change (arquivos) não aplicado';
  end if;
  d := replace(d, 'public.crl_may_change(v_inst, rat.entered_by, rat.created_at) or not public.crl_can_access_stay(rat.stay_id)', 'public.crl_is_member(v_inst, true)');
  d := replace(d, 'public.crl_may_change(v_inst, rr.authorization_by, rr.created_at) or not public.crl_can_access_stay(rr.stay_id)', 'public.crl_is_member(v_inst, true)');
  d := regexp_replace(d, 'public\.crl_may_change\(v_inst, rma\.recorded_by, rma\.occurred_at\)\s+or not public\.crl_can_access_stay\(\(select m\.stay_id from public\.crl_medication_records m where m\.id = rma\.medication_record_id\)\)', 'public.crl_is_member(v_inst, true)');
  d := replace(d, 'Só o ADM, ou quem marcou no mesmo dia, pode corrigir', 'Somente o ADM corrige o prontuário');
  d := replace(d, 'Só o ADM, ou quem registrou no mesmo dia, pode corrigir', 'Somente o ADM corrige o prontuário');
  if position('rat.entered_by, rat.created_at' in d) > 0 or position('rr.authorization_by, rr.created_at' in d) > 0
     or position('rma.recorded_by, rma.occurred_at' in d) > 0 then
    raise exception 'patch crl_change (prontuário) não aplicado';
  end if;
  -- excluir cadastro feito por engano também limpa a escala (se ainda não houver nada marcado)
  o := d;
  d := replace(d, 'or exists(select 1 from public.crl_tasks where stay_id = p_id and deleted_at is null)',
    'or exists(select 1 from public.crl_tasks where stay_id = p_id and deleted_at is null)' || chr(10) ||
    '         or exists(select 1 from public.crl_task_checks tc join public.crl_task_assignments ta on ta.id = tc.assignment_id where ta.stay_id = p_id)');
  d := replace(d, 'delete from public.crl_tasks where stay_id = p_id;',
    'delete from public.crl_tasks where stay_id = p_id;' || chr(10) || '      delete from public.crl_task_assignments where stay_id = p_id;');
  if position('crl_task_assignments where stay_id = p_id' in d) = 0 or position('tc.assignment_id' in d) = 0 then
    raise exception 'patch crl_change (excluir cadastro / escala) não aplicado';
  end if;
  execute d;

  d := pg_get_functiondef('public.crl_amend_record(uuid,text,text)'::regprocedure); o := d;
  d := replace(d, 'v_record.author_id is distinct from v_actor and not public.crl_is_member(v_record.institution_id,true)', 'not public.crl_is_member(v_record.institution_id,true)');
  d := replace(d, 'Somente o autor ou ADM pode retificar', 'Somente o ADM corrige o prontuário');
  if d = o then raise exception 'patch crl_amend_record não aplicado'; end if;
  execute d;
end $patch$;

-- 2) ESCALA SEMANAL DE TAREFAS
create table if not exists public.crl_task_types(
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.crl_institutions(id),
  name text not null check (length(trim(name)) between 2 and 80),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists crl_task_types_name_uq on public.crl_task_types(institution_id, lower(trim(name)));

create table if not exists public.crl_task_weeks(
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.crl_institutions(id),
  week_start date not null check (extract(isodow from week_start) = 1),
  status text not null default 'draft' check (status in ('draft','final')),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, week_start)
);

create table if not exists public.crl_task_assignments(
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.crl_institutions(id),
  week_id uuid not null references public.crl_task_weeks(id),
  task_type_id uuid references public.crl_task_types(id),
  task_name text not null,
  stay_id uuid not null references public.crl_stays(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz, deleted_by uuid, delete_reason text
);
create index if not exists crl_task_assignments_week_idx on public.crl_task_assignments(week_id) where deleted_at is null;
create index if not exists crl_task_assignments_stay_idx on public.crl_task_assignments(stay_id);

create table if not exists public.crl_task_checks(
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.crl_institutions(id),
  assignment_id uuid not null references public.crl_task_assignments(id),
  day date not null,
  done boolean not null,
  justification text,
  checked_by uuid references auth.users(id),
  checked_at timestamptz not null default now(),
  unique (assignment_id, day),
  check (done or length(trim(coalesce(justification,''))) >= 3)
);

alter table public.crl_task_types enable row level security;
alter table public.crl_task_weeks enable row level security;
alter table public.crl_task_assignments enable row level security;
alter table public.crl_task_checks enable row level security;
revoke all on public.crl_task_types, public.crl_task_weeks, public.crl_task_assignments, public.crl_task_checks from anon;
revoke insert, update, delete, truncate on public.crl_task_types, public.crl_task_weeks, public.crl_task_assignments, public.crl_task_checks from authenticated;
grant select on public.crl_task_types, public.crl_task_weeks, public.crl_task_assignments, public.crl_task_checks to authenticated;
drop policy if exists crl_task_types_select on public.crl_task_types;
create policy crl_task_types_select on public.crl_task_types for select to authenticated using (public.crl_is_member(institution_id, false));
drop policy if exists crl_task_weeks_select on public.crl_task_weeks;
create policy crl_task_weeks_select on public.crl_task_weeks for select to authenticated using (public.crl_is_member(institution_id, false));
drop policy if exists crl_task_assignments_select on public.crl_task_assignments;
create policy crl_task_assignments_select on public.crl_task_assignments for select to authenticated using (public.crl_is_member(institution_id, false));
drop policy if exists crl_task_checks_select on public.crl_task_checks;
create policy crl_task_checks_select on public.crl_task_checks for select to authenticated using (public.crl_is_member(institution_id, false));

-- Tarefas que já vêm prontas no painel (podem ser removidas ou acrescentadas pela equipe)
insert into public.crl_task_types(institution_id, name)
select i.id, t.name from public.crl_institutions i
cross join (values ('Cozinha'),('Louça'),('Banheiros'),('Limpeza dos quartos'),('Limpeza da sala'),('Lavanderia'),('Área externa / quintal'),('Horta'),('Lixo')) t(name)
where exists (select 1 from public.crl_members m where m.institution_id = i.id)
on conflict do nothing;

create or replace function public.crl_task_type_add(p_institution uuid, p_name text)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_actor uuid := (select auth.uid()); v_name text := regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g'); v_id uuid;
begin
  if v_actor is null or not public.crl_is_member(p_institution, false) then raise exception 'Acesso negado'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'Escreva o nome da tarefa (2 a 80 letras)'; end if;
  select id into v_id from public.crl_task_types where institution_id = p_institution and lower(trim(name)) = lower(v_name);
  if v_id is not null then
    update public.crl_task_types set active = true where id = v_id;
  else
    insert into public.crl_task_types(institution_id, name, created_by) values (p_institution, v_name, v_actor) returning id into v_id;
  end if;
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (p_institution, v_actor, 'task_type_added', 'crl_task_types', v_id, jsonb_build_object('name', v_name));
  return v_id;
end $function$;

create or replace function public.crl_task_type_remove(p_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_actor uuid := (select auth.uid()); v_type public.crl_task_types%rowtype;
begin
  select * into v_type from public.crl_task_types where id = p_id;
  if v_actor is null or not found or not public.crl_is_member(v_type.institution_id, false) then raise exception 'Tarefa não encontrada'; end if;
  update public.crl_task_types set active = false where id = p_id;
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (v_type.institution_id, v_actor, 'task_type_removed', 'crl_task_types', p_id, jsonb_build_object('name', v_type.name));
end $function$;

-- Salva a escala da semana: p_items = [{"task_type_id": "...", "stay_id": "..."}]
create or replace function public.crl_task_week_save(p_institution uuid, p_week_start date, p_items jsonb,
  p_finalize boolean default true, p_reason text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_week_start date := date_trunc('week', p_week_start)::date;
  v_week public.crl_task_weeks%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason,'')), '');
  v_item jsonb; v_type public.crl_task_types%rowtype; v_stay uuid;
  v_wanted text[] := '{}'; v_key text; v_added int := 0; v_removed int := 0; a record;
begin
  if v_actor is null or not public.crl_is_member(p_institution, false) then raise exception 'Acesso negado'; end if;
  if p_week_start is null then raise exception 'Escolha a semana'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'Escala inválida'; end if;
  if p_finalize and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'Escolha pelo menos uma tarefa e quem vai fazer'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 300 then raise exception 'Escala grande demais'; end if;

  insert into public.crl_task_weeks(institution_id, week_start, created_by) values (p_institution, v_week_start, v_actor)
  on conflict (institution_id, week_start) do nothing;
  select * into v_week from public.crl_task_weeks where institution_id = p_institution and week_start = v_week_start for update;

  -- valida e monta a lista desejada
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into v_type from public.crl_task_types where id = nullif(v_item->>'task_type_id','')::uuid and institution_id = p_institution;
    if not found then raise exception 'Tarefa inválida na escala'; end if;
    v_stay := nullif(v_item->>'stay_id','')::uuid;
    if v_stay is null then raise exception 'Escolha quem vai fazer: %', v_type.name; end if;
    if not exists (select 1 from public.crl_stays s where s.id = v_stay and s.institution_id = p_institution and s.status = 'active') then
      raise exception 'Acolhido não está ativo (tarefa %)', v_type.name;
    end if;
    v_key := v_type.id::text || ':' || v_stay::text;
    if not (v_key = any(v_wanted)) then v_wanted := v_wanted || v_key; end if;
  end loop;

  -- escala já finalizada: mudança precisa de motivo
  if v_week.status = 'final' then
    if exists (select 1 from public.crl_task_assignments x where x.week_id = v_week.id and x.deleted_at is null
               and not ((x.task_type_id::text || ':' || x.stay_id::text) = any(v_wanted)))
       or exists (select 1 from unnest(v_wanted) k where not exists (select 1 from public.crl_task_assignments x
               where x.week_id = v_week.id and x.deleted_at is null and (x.task_type_id::text || ':' || x.stay_id::text) = k)) then
      if v_reason is null or length(v_reason) < 3 then raise exception 'A escala já foi finalizada: informe o motivo da mudança'; end if;
    end if;
  end if;

  -- sai da escala (o que já foi marcado fica guardado)
  for a in select x.id from public.crl_task_assignments x where x.week_id = v_week.id and x.deleted_at is null
           and not ((x.task_type_id::text || ':' || x.stay_id::text) = any(v_wanted)) loop
    update public.crl_task_assignments set deleted_at = now(), deleted_by = v_actor,
      delete_reason = coalesce(v_reason, 'Retirado da escala') where id = a.id;
    v_removed := v_removed + 1;
  end loop;

  -- entra na escala
  foreach v_key in array v_wanted loop
    if not exists (select 1 from public.crl_task_assignments x where x.week_id = v_week.id and x.deleted_at is null
                   and (x.task_type_id::text || ':' || x.stay_id::text) = v_key) then
      select * into v_type from public.crl_task_types where id = split_part(v_key, ':', 1)::uuid;
      insert into public.crl_task_assignments(institution_id, week_id, task_type_id, task_name, stay_id, created_by)
      values (p_institution, v_week.id, v_type.id, v_type.name, split_part(v_key, ':', 2)::uuid, v_actor);
      v_added := v_added + 1;
    end if;
  end loop;

  update public.crl_task_weeks set
    status = case when p_finalize or status = 'final' then 'final' else 'draft' end,
    finalized_at = case when p_finalize and status <> 'final' then now() else finalized_at end,
    finalized_by = case when p_finalize and status <> 'final' then v_actor else finalized_by end,
    updated_at = now()
  where id = v_week.id;

  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (p_institution, v_actor, case when v_week.status = 'final' then 'task_week_edited' else 'task_week_saved' end,
          'crl_task_weeks', v_week.id,
          jsonb_build_object('week_start', v_week_start, 'added', v_added, 'removed', v_removed, 'reason', v_reason, 'finalized', p_finalize));
  return v_week.id;
end $function$;

-- Marca se a tarefa foi feita no dia (não feita exige justificativa)
create or replace function public.crl_task_check(p_assignment uuid, p_day date, p_done boolean, p_justification text default null)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_a public.crl_task_assignments%rowtype; v_week public.crl_task_weeks%rowtype; v_old public.crl_task_checks%rowtype;
  v_just text := nullif(trim(coalesce(p_justification,'')), '');
begin
  select * into v_a from public.crl_task_assignments where id = p_assignment;
  if v_actor is null or not found or v_a.deleted_at is not null or not public.crl_is_member(v_a.institution_id, false)
    or not public.crl_can_touch_stay(v_a.stay_id) then raise exception 'Tarefa não encontrada'; end if;
  select * into v_week from public.crl_task_weeks where id = v_a.week_id;
  if p_day is null or p_day < v_week.week_start or p_day > v_week.week_start + 6 then raise exception 'Dia fora da semana da escala'; end if;
  if p_day > v_today then raise exception 'Só dá para marcar até hoje'; end if;
  if p_done is null then raise exception 'Marque se fez ou não fez'; end if;
  if not p_done and (v_just is null or length(v_just) < 3) then raise exception 'Escreva a justificativa de não ter feito'; end if;
  if length(coalesce(v_just,'')) > 500 then raise exception 'Justificativa longa demais'; end if;
  select * into v_old from public.crl_task_checks where assignment_id = p_assignment and day = p_day for update;
  if found then
    if not public.crl_may_change(v_a.institution_id, v_old.checked_by, v_old.checked_at) then
      raise exception 'Já foi marcado. Só o ADM, ou quem marcou hoje, pode mudar';
    end if;
    update public.crl_task_checks set done = p_done, justification = case when p_done then null else v_just end,
      checked_by = v_actor, checked_at = now() where id = v_old.id;
  else
    insert into public.crl_task_checks(institution_id, assignment_id, day, done, justification, checked_by)
    values (v_a.institution_id, p_assignment, p_day, p_done, case when p_done then null else v_just end, v_actor);
  end if;
  insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
  values (v_a.institution_id, v_actor, case when v_old.id is null then 'task_checked' else 'task_check_changed' end,
          'crl_task_assignments', p_assignment,
          jsonb_build_object('day', p_day, 'done', p_done, 'justification', v_just,
                             'before', case when v_old.id is null then null else jsonb_build_object('done', v_old.done, 'justification', v_old.justification) end));
  return jsonb_build_object('ok', true);
end $function$;

-- Tudo o que a tela da escala precisa para uma semana (tarefas, quem faz e o que foi marcado)
create or replace function public.crl_task_week_view(p_institution uuid, p_week_start date)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ws date := date_trunc('week', coalesce(p_week_start, (now() at time zone 'America/Sao_Paulo')::date))::date;
  v_admin boolean; v_week public.crl_task_weeks%rowtype;
begin
  if (select auth.uid()) is null or not public.crl_is_member(p_institution, false) then raise exception 'Acesso negado'; end if;
  v_admin := public.crl_is_member(p_institution, true);
  select * into v_week from public.crl_task_weeks where institution_id = p_institution and week_start = v_ws;
  return jsonb_build_object(
    'week_start', v_ws, 'today', v_today,
    'week', case when v_week.id is null then null else jsonb_build_object('id', v_week.id, 'status', v_week.status,
            'finalized_at', v_week.finalized_at, 'updated_at', v_week.updated_at) end,
    'types', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by lower(t.name)), '[]'::jsonb)
              from public.crl_task_types t where t.institution_id = p_institution and t.active),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'task_type_id', a.task_type_id, 'task_name', a.task_name,
                      'stay_id', a.stay_id, 'active', s.status = 'active',
                      'resident', case when s.status = 'active' or v_admin then r.full_name else 'Acolhido que saiu' end)
                      order by lower(a.task_name), r.full_name), '[]'::jsonb)
                    from public.crl_task_assignments a
                    join public.crl_stays s on s.id = a.stay_id
                    join public.crl_residents r on r.id = s.resident_id
                    where a.week_id = v_week.id and a.deleted_at is null),
    'checks', (select coalesce(jsonb_agg(jsonb_build_object('assignment_id', c.assignment_id, 'day', c.day, 'done', c.done,
                 'justification', c.justification, 'checked_by', c.checked_by, 'checked_at', c.checked_at,
                 'by', coalesce(m.display_name, 'Equipe'))), '[]'::jsonb)
               from public.crl_task_checks c
               join public.crl_task_assignments a on a.id = c.assignment_id
               left join public.crl_members m on m.auth_user_id = c.checked_by and m.institution_id = c.institution_id
               where a.week_id = v_week.id and a.deleted_at is null)
  );
end $function$;
revoke execute on function public.crl_task_week_view(uuid,date) from public, anon;
grant execute on function public.crl_task_week_view(uuid,date) to authenticated;

revoke execute on function public.crl_task_type_add(uuid,text) from public, anon;
revoke execute on function public.crl_task_type_remove(uuid) from public, anon;
revoke execute on function public.crl_task_week_save(uuid,date,jsonb,boolean,text) from public, anon;
revoke execute on function public.crl_task_check(uuid,date,boolean,text) from public, anon;
grant execute on function public.crl_task_type_add(uuid,text) to authenticated;
grant execute on function public.crl_task_type_remove(uuid) to authenticated;
grant execute on function public.crl_task_week_save(uuid,date,jsonb,boolean,text) to authenticated;
grant execute on function public.crl_task_check(uuid,date,boolean,text) to authenticated;

-- Painel e relatório mensal passam a usar a escala semanal
do $patch$
declare d text; o text;
begin
  d := pg_get_functiondef('public.crl_dashboard_cards(uuid)'::regprocedure); o := d;
  d := replace(d, $x$'tasks_today',(select count(*) from public.crl_tasks where institution_id=p_institution and deleted_at is null and due_at>=v_day_start and due_at<v_day_next and status<>'done'),$x$,
    $x$'tasks_today',(select count(*) from public.crl_task_assignments a join public.crl_task_weeks w on w.id=a.week_id where a.institution_id=p_institution and a.deleted_at is null and w.week_start=date_trunc('week',v_today)::date and not exists(select 1 from public.crl_task_checks c where c.assignment_id=a.id and c.day=v_today)),$x$);
  d := replace(d, $x$'tasks_week',(select count(*) from public.crl_tasks where institution_id=p_institution and deleted_at is null and due_at>=v_day_start and due_at<v_day_start+interval '7 days' and status<>'done'),$x$,
    $x$'tasks_week',(select count(*) from public.crl_task_assignments a join public.crl_task_weeks w on w.id=a.week_id where a.institution_id=p_institution and a.deleted_at is null and w.week_start=date_trunc('week',v_today)::date),$x$);
  if position('public.crl_tasks' in d) > 0 then raise exception 'patch painel (tarefas) não aplicado'; end if;
  execute d;

  d := pg_get_functiondef('public.crl_prepare_evolution_report(uuid,date)'::regprocedure); o := d;
  d := replace(d, 'v_tasks integer;', 'v_tasks integer;v_tasks_missed integer;');
  d := regexp_replace(d, 'select count\(\*\) into v_tasks from public\.crl_tasks\s+where stay_id=p_stay and institution_id=v_stay\.institution_id\s+and due_at>=v_start and due_at<v_end and deleted_at is null;',
    'select count(*) filter(where c.done), count(*) filter(where not c.done) into v_tasks, v_tasks_missed from public.crl_task_checks c join public.crl_task_assignments ta on ta.id=c.assignment_id where ta.stay_id=p_stay and ta.institution_id=v_stay.institution_id and ta.deleted_at is null and c.day>=p_month and c.day<v_next;');
  d := replace(d, $x$'tasks_planned',v_tasks$x$, $x$'tasks_done',v_tasks,'tasks_missed',v_tasks_missed$x$);
  d := replace(d, $x$Tarefas programadas: '||v_tasks||'.'$x$, $x$Escala de tarefas: '||v_tasks||' feitas e '||v_tasks_missed||' não feitas.'$x$);
  if position('public.crl_tasks' in d) > 0 or position('v_tasks_missed' in d) = 0 or position('Escala de tarefas' in d) = 0 then
    raise exception 'patch relatório mensal (tarefas) não aplicado';
  end if;
  execute d;
end $patch$;

-- 3) REFEIÇÕES DO DIA: o monitor marca café, almoço, café da tarde e janta de uma vez
create or replace function public.crl_save_day_meals(p_institution uuid, p_day date, p_meals jsonb, p_servings integer,
  p_notes text default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_reason text := nullif(trim(coalesce(p_reason,'')), '');
  v_notes text := nullif(trim(coalesce(p_notes,'')), '');
  t text; v_want boolean; v_at timestamptz; m public.crl_meals%rowtype; v_found boolean;
  v_added int := 0; v_changed int := 0; v_removed int := 0;
begin
  if v_actor is null or not public.crl_is_member(p_institution, false) then raise exception 'Acesso negado'; end if;
  if p_day is null or p_day > v_today or p_day < v_today - 60 then raise exception 'Data inválida'; end if;
  if p_servings is null or p_servings < 1 or p_servings > 10000 then raise exception 'Informe quantas pessoas comeram'; end if;
  if jsonb_typeof(coalesce(p_meals, 'null'::jsonb)) <> 'object' then raise exception 'Refeições inválidas'; end if;
  if length(coalesce(v_notes,'')) > 1000 then raise exception 'Observação longa demais'; end if;
  foreach t in array array['cafe','almoco','lanche','jantar'] loop
    v_want := coalesce((p_meals->>t)::boolean, false);
    v_at := least(((p_day + case t when 'cafe' then time '07:30' when 'almoco' then time '12:00' when 'lanche' then time '15:30' else time '19:00' end)
                   at time zone 'America/Sao_Paulo'), now());
    v_found := false;
    for m in select * from public.crl_meals x where x.institution_id = p_institution and x.meal_type = t and x.deleted_at is null
             and (x.served_at at time zone 'America/Sao_Paulo')::date = p_day for update loop
      v_found := true;
      if (not v_want) or m.servings <> p_servings then
        if not public.crl_may_change(p_institution, m.recorded_by, m.created_at) then
          raise exception 'Esse dia já foi registrado. Só o ADM, ou quem lançou hoje, pode mudar';
        end if;
        if v_reason is null or length(v_reason) < 3 then raise exception 'Informe o motivo da mudança'; end if;
        if not v_want then
          update public.crl_meals set deleted_at = now(), deleted_by = v_actor, delete_reason = v_reason where id = m.id;
          v_removed := v_removed + 1;
          insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
          values (p_institution, v_actor, 'deleted', 'crl_meals', m.id, jsonb_build_object('reason', v_reason, 'before', to_jsonb(m), 'after', null));
        else
          update public.crl_meals set servings = p_servings where id = m.id;
          v_changed := v_changed + 1;
          insert into public.crl_audit_events(institution_id, actor_id, action, entity_name, entity_id, data)
          values (p_institution, v_actor, 'edited', 'crl_meals', m.id, jsonb_build_object('reason', v_reason, 'before', to_jsonb(m), 'after', jsonb_build_object('servings', p_servings)));
        end if;
      end if;
    end loop;
    if v_want and not v_found then
      insert into public.crl_meals(institution_id, meal_type, servings, served_at, notes, recorded_by)
      values (p_institution, t, p_servings, v_at, v_notes, v_actor);
      v_added := v_added + 1;
    end if;
  end loop;
  return jsonb_build_object('added', v_added, 'changed', v_changed, 'removed', v_removed);
end $function$;
revoke execute on function public.crl_save_day_meals(uuid,date,jsonb,integer,text,text) from public, anon;
grant execute on function public.crl_save_day_meals(uuid,date,jsonb,integer,text,text) to authenticated;

-- 4) EXTRATO DO CAIXA (ADM): entradas (lançamentos + contribuições recebidas), saídas e saldo
create or replace function public.crl_cash_statement(p_institution uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_start date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_end date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month')::date;
  v_open numeric; v_in numeric; v_out numeric; v_now numeric; v_rows jsonb;
begin
  if (select auth.uid()) is null or not public.crl_is_member(p_institution, true) then raise exception 'Somente ADM'; end if;
  with mov as (
    select f.id, 'cash'::text as kind, f.date as day, f.description, f.entry_type as kind_type, f.amount
    from public.crl_financial_entries f
    where f.institution_id = p_institution and f.deleted_at is null
    union all
    select p.id, 'payment', p.paid_on, 'Contribuição de ' || coalesce(r.full_name, 'acolhido') || coalesce(' (' || p.payment_method || ')', ''), 'income', p.amount
    from public.crl_contribution_payments p
    join public.crl_contributions c on c.id = p.contribution_id
    join public.crl_stays s on s.id = c.stay_id
    join public.crl_residents r on r.id = s.resident_id
    where p.institution_id = p_institution and p.deleted_at is null
  )
  select
    (select coalesce(sum(case when kind_type = 'income' then amount else -amount end), 0) from mov where day < v_start),
    (select coalesce(sum(amount), 0) from mov where kind_type = 'income' and day >= v_start and day < v_end),
    (select coalesce(sum(amount), 0) from mov where kind_type = 'expense' and day >= v_start and day < v_end),
    (select coalesce(sum(case when kind_type = 'income' then amount else -amount end), 0) from mov),
    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'day', day, 'description', description, 'type', kind_type, 'amount', amount)
            order by day, kind_type desc, description), '[]'::jsonb) from mov where day >= v_start and day < v_end)
  into v_open, v_in, v_out, v_now, v_rows;
  return jsonb_build_object('month', v_start, 'opening', v_open, 'income', v_in, 'expense', v_out,
                            'closing', v_open + v_in - v_out, 'balance_now', v_now, 'rows', v_rows);
end $function$;
revoke execute on function public.crl_cash_statement(uuid,date) from public, anon;
grant execute on function public.crl_cash_statement(uuid,date) to authenticated;

-- 5) ESTOQUE DO MÊS: saldo no início, o que entrou, o que saiu e saldo no fim, por produto
create or replace function public.crl_stock_month(p_institution uuid, p_month date)
returns table(product text, unit text, opening numeric, entered numeric, used numeric, closing numeric, balance_now numeric)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_start timestamptz := (date_trunc('month', coalesce(p_month, current_date))::date)::timestamp at time zone 'America/Sao_Paulo';
  v_end timestamptz := ((date_trunc('month', coalesce(p_month, current_date)) + interval '1 month')::date)::timestamp at time zone 'America/Sao_Paulo';
begin
  if (select auth.uid()) is null or not public.crl_is_member(p_institution, false) then raise exception 'Sem acesso ao estoque'; end if;
  return query
  select min(m.product)::text, m.unit::text,
    coalesce(sum(case when m.direction = 'in' then m.quantity else -m.quantity end) filter (where m.occurred_at < v_start), 0),
    coalesce(sum(m.quantity) filter (where m.direction = 'in' and m.occurred_at >= v_start and m.occurred_at < v_end), 0),
    coalesce(sum(m.quantity) filter (where m.direction = 'out' and m.occurred_at >= v_start and m.occurred_at < v_end), 0),
    coalesce(sum(case when m.direction = 'in' then m.quantity else -m.quantity end) filter (where m.occurred_at < v_end), 0),
    coalesce(sum(case when m.direction = 'in' then m.quantity else -m.quantity end), 0)
  from public.crl_inventory_movements m
  where m.institution_id = p_institution and m.deleted_at is null
  group by lower(trim(m.product)), m.unit
  order by 1, 2;
end $function$;
revoke execute on function public.crl_stock_month(uuid,date) from public, anon;
grant execute on function public.crl_stock_month(uuid,date) to authenticated;

commit;
