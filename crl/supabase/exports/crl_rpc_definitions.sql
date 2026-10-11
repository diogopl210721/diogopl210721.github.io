-- CRL / snapshot das funções PostgreSQL, somente para revisão de código.
-- Gerado a partir do catálogo ativo. NÃO executar diretamente como migração.
-- Há dependências e permissões no projeto compartilhado DDS Avaliações.

-- crl_admit_resident(p_institution uuid, p_name text, p_date date, p_cpf text, p_responsible text, p_phone text)
CREATE OR REPLACE FUNCTION public.crl_admit_resident(p_institution uuid, p_name text, p_date date, p_cpf text DEFAULT NULL::text, p_responsible text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_resident uuid; v_stay uuid; v_actor uuid;
begin
 v_actor=(select auth.uid());
 if v_actor is null or not public.crl_is_member(p_institution,false)
 then raise exception 'Acesso negado'; end if;
 if length(trim(coalesce(p_name,'')))<3 or length(p_name)>200
 then raise exception 'Nome inválido'; end if;
 if p_date is null or p_date>current_date then raise exception 'Data de entrada inválida'; end if;
 if p_cpf is not null and length(p_cpf)>30 then raise exception 'Documento inválido'; end if;
 insert into public.crl_residents(institution_id,full_name,cpf,responsible_name,responsible_phone)
 values(p_institution,trim(p_name),nullif(trim(p_cpf),''),nullif(trim(p_responsible),''),nullif(trim(p_phone),''))
 returning id into v_resident;
 insert into public.crl_stays(institution_id,resident_id,admission_date,created_by)
 values(p_institution,v_resident,p_date,v_actor) returning id into v_stay;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(p_institution,v_actor,'created','crl_stays',v_stay,jsonb_build_object('resident_id',v_resident));
 return v_stay;
end $function$
;

-- crl_amend_record(p_record uuid, p_text text, p_reason text)
CREATE OR REPLACE FUNCTION public.crl_amend_record(p_record uuid, p_text text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_record public.crl_records%rowtype; v_new uuid; v_actor uuid;
begin
 v_actor=(select auth.uid());
 if v_actor is null then raise exception 'Acesso negado'; end if;
 select * into v_record from public.crl_records where id=p_record;
 if not found or not public.crl_is_member(v_record.institution_id,false)
    or not public.crl_can_access_stay(v_record.stay_id) then raise exception 'Registro indisponível'; end if;
 if v_record.author_id is distinct from v_actor and not public.crl_is_member(v_record.institution_id,true)
 then raise exception 'Somente o autor ou ADM pode retificar'; end if;
 if length(trim(coalesce(p_text,'')))<3 or length(trim(coalesce(p_reason,'')))<3
 then raise exception 'Informe texto e motivo da retificação'; end if;
 insert into public.crl_records(institution_id,stay_id,category,original_text,correction_of,correction_reason,author_id)
 values(v_record.institution_id,v_record.stay_id,v_record.category,trim(p_text),p_record,trim(p_reason),v_actor)
 returning id into v_new;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_record.institution_id,v_actor,'rectified','crl_records',v_new,jsonb_build_object('original_id',p_record,'reason',trim(p_reason)));
 return v_new;
end $function$
;

-- crl_approve_evolution_report(p_report uuid, p_final_text text)
CREATE OR REPLACE FUNCTION public.crl_approve_evolution_report(p_report uuid, p_final_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid;v_report public.crl_evolution_reports%rowtype;
begin
 v_actor:=(select auth.uid());
 select * into v_report from public.crl_evolution_reports where id=p_report for update;
 if not found or v_actor is null or not public.crl_is_member(v_report.institution_id,true)
 then raise exception 'Somente ADM pode aprovar';end if;
 if v_report.report_status='approved' then raise exception 'Este relatório já está aprovado';end if;
 if v_report.month_start>=date_trunc('month',current_date)::date
 then raise exception 'Aprovação mensal disponível após o encerramento do mês';end if;
 if length(trim(coalesce(p_final_text,'')))<40 or length(p_final_text)>15000
 then raise exception 'Revise o texto final antes da aprovação (40 a 15000 caracteres)';end if;
 update public.crl_evolution_reports set report_status='approved',approved_text=trim(p_final_text),
   approved_by=v_actor,approved_at=now(),updated_at=now()
 where id=p_report;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_report.institution_id,v_actor,'evolution_report_approved','crl_evolution_reports',v_report.id,
   jsonb_build_object('month',v_report.month_start,'sources',jsonb_array_length(v_report.source_snapshot->'evidence')));
 return v_report.id;
end $function$
;

-- crl_can_access_issued_document_path(p_path text)
CREATE OR REPLACE FUNCTION public.crl_can_access_issued_document_path(p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_institution uuid; v_stay uuid;
begin
 if (select auth.uid()) is null then return false; end if;
 if p_path is null or p_path !~* 
 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
 then return false; end if;
 v_institution:=split_part(p_path,'/',1)::uuid;
 v_stay:=split_part(p_path,'/',2)::uuid;
 return public.crl_is_member(v_institution,true) and
 exists(select 1 from public.crl_stays st where st.id=v_stay and st.institution_id=v_institution);
end $function$
;

-- crl_can_access_signature_path(p_path text)
CREATE OR REPLACE FUNCTION public.crl_can_access_signature_path(p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tenant uuid;
begin
 if (select auth.uid()) is null then return false; end if;
 if p_path is null or p_path !~*
 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/signature-[0-9a-f-]{36}\.(png|webp)$'
 then return false; end if;
 tenant:=split_part(p_path,'/',1)::uuid;
 return public.crl_is_member(tenant,true);
end $function$
;

-- crl_can_access_stay(s uuid)
CREATE OR REPLACE FUNCTION public.crl_can_access_stay(s uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select exists(select 1 from public.crl_stays st join public.crl_members m on m.institution_id=st.institution_id where st.id=s and m.auth_user_id=(select auth.uid()) and m.active and (m.role='admin' or st.status='active'))$function$
;

-- crl_can_access_storage_path(p_path text)
CREATE OR REPLACE FUNCTION public.crl_can_access_storage_path(p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tenant uuid; stay uuid;
begin
 if (select auth.uid()) is null then return false; end if;
 if p_path is null or p_path !~* 
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$'
 then return false; end if;
 tenant:=split_part(p_path,'/',1)::uuid;
 stay:=split_part(p_path,'/',2)::uuid;
 return exists(select 1 from public.crl_stays s where s.id=stay and s.institution_id=tenant)
   and (public.crl_is_member(tenant,true) or
       (public.crl_is_member(tenant,false) and public.crl_can_access_stay(stay)));
end $function$
;

-- crl_cash_summary(p_institution uuid)
CREATE OR REPLACE FUNCTION public.crl_cash_summary(p_institution uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare incoming numeric; outgoing numeric; movements bigint;
begin
 if not public.crl_is_member(p_institution,true) then raise exception 'Somente ADM';end if;
 select coalesce(sum(amount) filter(where entry_type='income'),0),
 coalesce(sum(amount) filter(where entry_type='expense'),0),
 count(*) into incoming,outgoing,movements
 from public.crl_financial_entries where institution_id=p_institution;
 return jsonb_build_object('income',incoming,'expense',outgoing,'balance',incoming-outgoing,'movements',movements);
end $function$
;

-- crl_check_tenant_reference()
CREATE OR REPLACE FUNCTION public.crl_check_tenant_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare parent_tenant uuid; linked_stay uuid;
begin
 if tg_table_name='crl_stays' then
  select institution_id into parent_tenant from public.crl_residents where id=new.resident_id;
 elsif tg_table_name='crl_files' then
  select institution_id into parent_tenant from public.crl_stays where id=new.stay_id;
  if new.record_id is not null then
    select stay_id into linked_stay from public.crl_records where id=new.record_id and institution_id=new.institution_id;
    if not found or new.stay_id is distinct from linked_stay then raise exception 'CRL: arquivo incompatível com registro';end if;
  end if;
 elsif tg_table_name in ('crl_records','crl_attendance','crl_tasks','crl_contributions','crl_documents','crl_medication_records') then
  if new.stay_id is null and tg_table_name='crl_tasks' then return new;end if;
  select institution_id into parent_tenant from public.crl_stays where id=new.stay_id;
 elsif tg_table_name='crl_medication_administrations' then
  select institution_id into parent_tenant from public.crl_medication_records where id=new.medication_record_id;
 else return new;end if;
 if parent_tenant is null or parent_tenant<>new.institution_id then raise exception 'CRL: referência inválida para instituição';end if;
 if tg_table_name='crl_attendance' then
  if not exists(select 1 from public.crl_activities where id=new.activity_id and institution_id=new.institution_id) then raise exception 'CRL: atividade de outra instituição';end if;
 elsif tg_table_name='crl_medication_records' then
  if new.prescription_file_id is not null and not exists(select 1 from public.crl_files where id=new.prescription_file_id and institution_id=new.institution_id and stay_id=new.stay_id) then raise exception 'CRL: prescrição não pertence ao acolhido';end if;
 end if;
 return new;
end $function$
;

-- crl_close_resocialization(p_id uuid, p_return_notes text)
CREATE OR REPLACE FUNCTION public.crl_close_resocialization(p_id uuid, p_return_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.crl_resocializations%rowtype; v_actor uuid;
begin
 v_actor:=(select auth.uid());
 select * into v_row from public.crl_resocializations where id=p_id for update;
 if v_actor is null or not found or v_row.actual_return_at is not null
 or not public.crl_is_member(v_row.institution_id,false)
 or not public.crl_can_access_stay(v_row.stay_id) then
  raise exception 'Saída não encontrada, já encerrada ou sem permissão'; end if;
 if length(trim(coalesce(p_return_notes,'')))<3 or length(p_return_notes)>2000
 then raise exception 'Registre como foi o retorno'; end if;
 update public.crl_resocializations set actual_return_at=now(),
  closed_by=v_actor,return_notes=trim(p_return_notes) where id=p_id;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_row.institution_id,v_actor,'resocialization_closed','crl_resocializations',p_id,
 jsonb_build_object('stay_id',v_row.stay_id));
 return p_id;
end $function$
;

-- crl_close_stay(p_stay uuid, p_status text, p_date date, p_reason text)
CREATE OR REPLACE FUNCTION public.crl_close_stay(p_stay uuid, p_status text, p_date date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_stay public.crl_stays%rowtype; v_actor uuid;
begin
 v_actor := (select auth.uid());
 select * into v_stay from public.crl_stays where id=p_stay for update;
 if not found or v_actor is null or not public.crl_is_member(v_stay.institution_id,true)
 then raise exception 'Apenas o ADM responsável pode encerrar o acolhimento'; end if;
 if v_stay.status<>'active' then raise exception 'O acolhimento já está encerrado'; end if;
 if p_status not in ('concluded','requested','administrative','abandoned','other')
 then raise exception 'Motivo da saída inválido'; end if;
 if p_date is null or p_date<v_stay.admission_date or p_date>current_date
 then raise exception 'Data de saída inválida'; end if;
 if length(trim(coalesce(p_reason,'')))<5 or length(p_reason)>4000
 then raise exception 'Justificativa obrigatória'; end if;
 if p_status='concluded' and p_date < (v_stay.admission_date + interval '9 months')::date
 then raise exception 'Conclusão exige nove meses completos; use o desfecho real e justifique'; end if;
 update public.crl_stays
 set status=p_status, departure_date=p_date, departure_reason=trim(p_reason)
 where id=p_stay;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_stay.institution_id,v_actor,'closed','crl_stays',p_stay,
 jsonb_build_object('status',p_status,'date',p_date,'reason',trim(p_reason)));
 return p_stay;
end $function$
;

-- crl_complete_devotional(p_institution uuid, p_title text, p_presenter text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_attendance jsonb)
CREATE OR REPLACE FUNCTION public.crl_complete_devotional(p_institution uuid, p_title text, p_presenter text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_attendance jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_active integer; v_count integer; v_distinct integer; v_item jsonb; v_stay uuid; v_status text; v_reason text;
begin
 if not public.crl_is_member(p_institution,false) then raise exception 'Acesso negado'; end if;
 if length(trim(coalesce(p_title,'')))<3 or length(trim(coalesce(p_presenter,'')))<2 then raise exception 'Informe tema e ministrante'; end if;
 if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Horários inválidos'; end if;
 if jsonb_typeof(p_attendance) is distinct from 'array' then raise exception 'Lista de presença inválida'; end if;
 select count(*) into v_active from public.crl_stays where institution_id=p_institution and status='active';
 if v_active=0 then raise exception 'Não há acolhidos ativos'; end if;
 select count(*),count(distinct i->>'stay_id') into v_count,v_distinct from jsonb_array_elements(p_attendance) i;
 if v_count<>v_active or v_distinct<>v_active then raise exception 'Todos os acolhidos ativos precisam de marcação única'; end if;
 for v_item in select value from jsonb_array_elements(p_attendance) loop
   v_stay=(v_item->>'stay_id')::uuid;
   v_status=v_item->>'status'; v_reason=trim(coalesce(v_item->>'justification',''));
   if v_status not in ('present','absent','late','excused') or v_status is null then raise exception 'Presença inválida'; end if;
   if v_status in ('absent','excused') and length(v_reason)<3 then raise exception 'Justifique a ausência'; end if;
   if not exists(select 1 from public.crl_stays s where s.id=v_stay and s.institution_id=p_institution and s.status='active') then
     raise exception 'Acolhido não pertence aos ativos';
   end if;
 end loop;
 insert into public.crl_activities(institution_id,type,title,presenter,starts_at,ends_at,created_by)
 values(p_institution,'devocional',trim(p_title),trim(p_presenter),p_starts_at,p_ends_at,auth.uid()) returning id into v_id;
 insert into public.crl_attendance(institution_id,activity_id,stay_id,status,justification,entered_by)
 select p_institution,v_id,r.stay_id,r.status,nullif(trim(r.justification),''),auth.uid()
 from jsonb_to_recordset(p_attendance) as r(stay_id uuid,status text,justification text);
 return v_id;
end $function$
;

-- crl_complete_task(p_task uuid, p_notes text)
CREATE OR REPLACE FUNCTION public.crl_complete_task(p_task uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.crl_tasks%rowtype; actor uuid; next_due timestamptz; next_id uuid;
begin
 actor := (select auth.uid());
 select * into t from public.crl_tasks where id=p_task for update;
 if not found or actor is null or not public.crl_is_member(t.institution_id,false)
 or (t.stay_id is not null and not public.crl_can_access_stay(t.stay_id)) then raise exception 'Tarefa indisponível'; end if;
 if t.status='done' then raise exception 'Tarefa já concluída'; end if;
 if t.status is distinct from 'planned' then raise exception 'Situação não permite conclusão'; end if;
 if length(coalesce(p_notes,''))>1500 then raise exception 'Observação longa demais'; end if;
 update public.crl_tasks set status='done',completed_at=now(),completed_by=actor,
 completion_notes=nullif(trim(p_notes),'') where id=p_task;
 if t.due_at is not null and t.recurrence in ('semanal','quinzenal','mensal')
 and (t.stay_id is null or exists(select 1 from public.crl_stays where id=t.stay_id and status='active')) then
 next_due:=case t.recurrence when 'semanal' then t.due_at+interval '7 days'
 when 'quinzenal' then t.due_at+interval '14 days' else t.due_at+interval '1 month' end;
 insert into public.crl_tasks(institution_id,title,stay_id,recurrence,due_at,status,created_by,previous_task_id)
 values(t.institution_id,t.title,t.stay_id,t.recurrence,next_due,'planned',actor,p_task) returning id into next_id;
 end if;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(t.institution_id,actor,'task_completed','crl_tasks',p_task,jsonb_build_object('next_task',next_id));
 return next_id;
end $function$
;

-- crl_contribution_opening_guard()
CREATE OR REPLACE FUNCTION public.crl_contribution_opening_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.paid_amount<>0 then raise exception 'Pagamentos só podem ser incluídos pela operação de recebimento'; end if;
 return new;
end $function$
;

-- crl_dashboard_cards(p_institution uuid)
CREATE OR REPLACE FUNCTION public.crl_dashboard_cards(p_institution uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=(now() at time zone 'America/Sao_Paulo')::date;
  v_month date:=date_trunc('month',(now() at time zone 'America/Sao_Paulo'))::date;
  v_start timestamptz;
  v_next timestamptz;
  v_day_start timestamptz;
  v_day_next timestamptz;
  v_admin boolean;
  v_metrics jsonb;
begin
 if (select auth.uid()) is null or not public.crl_is_member(p_institution,false)
 then raise exception 'CRL: acesso negado'; end if;
 v_admin:=public.crl_is_member(p_institution,true);
 v_start:=(v_month::timestamp at time zone 'America/Sao_Paulo');
 v_next:=((v_month+interval '1 month')::timestamp at time zone 'America/Sao_Paulo');
 v_day_start:=(v_today::timestamp at time zone 'America/Sao_Paulo');
 v_day_next:=((v_today+1)::timestamp at time zone 'America/Sao_Paulo');
 select jsonb_build_object(
   'date',v_today,'month',v_month,
   'active', (select count(*) from public.crl_stays where institution_id=p_institution and status='active'),
   'devotionals_month',(select count(*) from public.crl_activities
      where institution_id=p_institution and type='devocional' and starts_at>=v_start and starts_at<v_next),
   'tasks_today',(select count(*) from public.crl_tasks
      where institution_id=p_institution and due_at>=v_day_start and due_at<v_day_next and status<>'done'),
   'tasks_week',(select count(*) from public.crl_tasks
      where institution_id=p_institution and due_at>=v_day_start and due_at<v_day_start+interval '7 days' and status<>'done'),
   'meals_month',(select coalesce(sum(servings),0) from public.crl_meals
      where institution_id=p_institution and served_at>=v_start and served_at<v_next),
   'resocializations_open',(select count(*) from public.crl_resocializations
      where institution_id=p_institution and actual_return_at is null),
   'medications_pending',(case when v_admin then
      (select count(*) from public.crl_medication_requests where institution_id=p_institution and request_status='pending')
      else null end),
   'trips_month',(select count(*) from public.crl_vehicle_trips
      where institution_id=p_institution and departure_at>=v_start and departure_at<v_next),
   'kilometers_month',(select coalesce(sum(km_driven),0) from public.crl_vehicle_trips
      where institution_id=p_institution and arrival_at>=v_start and arrival_at<v_next),
   'stock_entries_month',(select count(*) from public.crl_inventory_movements
      where institution_id=p_institution and direction='in' and occurred_at>=v_start and occurred_at<v_next),
   'kg_received_month',(select coalesce(sum(quantity),0) from public.crl_inventory_movements
      where institution_id=p_institution and direction='in' and unit='kg' and occurred_at>=v_start and occurred_at<v_next),
   'kg_consumed_month',(select coalesce(sum(quantity),0) from public.crl_inventory_movements
      where institution_id=p_institution and direction='out' and unit='kg' and occurred_at>=v_start and occurred_at<v_next),
   'contributions_overdue',(case when v_admin then
      (select count(*) from public.crl_contributions
       where institution_id=p_institution and due_date<v_today and amount>coalesce(paid_amount,0)) else null end),
   'expenses_month',(case when v_admin then
      (select coalesce(sum(amount),0) from public.crl_financial_entries
       where institution_id=p_institution and entry_type='expense' and date>=v_month and date<(v_month+interval '1 month')::date)
      else null end),
   'concluded_month',(case when v_admin then
      (select count(*) from public.crl_stays where institution_id=p_institution and status='concluded'
       and departure_date>=v_month and departure_date<(v_month+interval '1 month')::date) else null end),
   'departures_month',(case when v_admin then
      (select count(*) from public.crl_stays where institution_id=p_institution and status in ('requested','abandoned')
       and departure_date>=v_month and departure_date<(v_month+interval '1 month')::date) else null end),
   'near_nine_months',(case when v_admin then
      (select count(*) from public.crl_stays where institution_id=p_institution and status='active'
       and (admission_date+interval '9 months')::date between v_today and v_today+30) else null end)
 ) into v_metrics;
 return v_metrics;
end $function$
;

-- crl_dashboard_summary(p_institution uuid, p_start date, p_end date)
CREATE OR REPLACE FUNCTION public.crl_dashboard_summary(p_institution uuid, p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_active bigint; v_admitted bigint; v_closed bigint; v_concluded bigint; v_9month bigint;
 v_requested bigint; v_abandoned bigint; v_administrative bigint;
 v_distance numeric; v_received numeric; v_consumed numeric;
 v_meals bigint; v_devotionals bigint; v_contributions numeric;
begin
 if (select auth.uid()) is null or not public.crl_is_member(p_institution,true) then
   raise exception 'Apenas ADM pode consultar o consolidado';
 end if;
 if p_start is null or p_end is null or p_start>p_end or p_end-p_start>3660 then
   raise exception 'Período inválido';
 end if;
 select
   count(*) filter(where admission_date<=p_end and (status='active' or departure_date>p_end)),
   count(*) filter(where admission_date between p_start and p_end),
   count(*) filter(where status<>'active' and departure_date between p_start and p_end),
   count(*) filter(where status='concluded' and departure_date between p_start and p_end),
   count(*) filter(where status='concluded' and departure_date between p_start and p_end and departure_date >= (admission_date+interval '9 months')::date),
   count(*) filter(where status='requested' and departure_date between p_start and p_end),
   count(*) filter(where status='abandoned' and departure_date between p_start and p_end),
   count(*) filter(where status='administrative' and departure_date between p_start and p_end)
 into v_active,v_admitted,v_closed,v_concluded,v_9month,v_requested,v_abandoned,v_administrative
 from public.crl_stays where institution_id=p_institution;
 select coalesce(sum(
    coalesce((select r.new_km_final from public.crl_trip_rectifications r
              where r.trip_id=t.id and r.new_km_final is not null
              order by r.created_at desc,r.id desc limit 1),t.km_final) - t.km_initial
 ),0) into v_distance
 from public.crl_vehicle_trips t
 where t.institution_id=p_institution and t.arrival_at::date between p_start and p_end
 and t.km_final is not null;
 select
  coalesce(sum(quantity) filter(where direction='in' and lower(unit) in ('kg','quilo','quilos')),0),
  coalesce(sum(quantity) filter(where direction='out' and lower(unit) in ('kg','quilo','quilos')),0)
 into v_received,v_consumed
 from public.crl_inventory_movements
 where institution_id=p_institution and occurred_at::date between p_start and p_end;
 select coalesce(sum(servings),0) into v_meals
 from public.crl_meals where institution_id=p_institution and served_at::date between p_start and p_end;
 select count(*) into v_devotionals from public.crl_activities
 where institution_id=p_institution and type='devocional' and starts_at::date between p_start and p_end;
 select coalesce(sum(p.amount),0) into v_contributions from public.crl_contribution_payments p
 where p.institution_id=p_institution and p.paid_on between p_start and p_end;
 return jsonb_build_object(
 'period_start',p_start,'period_end',p_end,
 'active_at_end',v_active,'admissions',v_admitted,'closed',v_closed,
 'concluded',v_concluded,'concluded_nine_months',v_9month,
 'requested_departures',v_requested,'abandonments',v_abandoned,'administrative_departures',v_administrative,
 'nine_month_completion_rate',case when v_closed>0 then round(100.0*v_9month/v_closed,1) else null end,
 'nine_months_per_ten',case when v_closed>0 then round(10.0*v_9month/v_closed,1) else null end,
 'kilometers',v_distance,'received_kg',v_received,'consumed_kg',v_consumed,
 'meals_served',v_meals,'devotionals',v_devotionals,'paid_contributions',v_contributions,
 'rate_method','conclusoes de pelo menos nove meses / acolhimentos encerrados no periodo'
 );
end $function$
;

-- crl_finish_trip(p_trip uuid, p_km_final numeric, p_arrival timestamp with time zone, p_clean boolean, p_notes text)
CREATE OR REPLACE FUNCTION public.crl_finish_trip(p_trip uuid, p_km_final numeric, p_arrival timestamp with time zone, p_clean boolean, p_notes text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_trip public.crl_vehicle_trips%rowtype;
begin
 select * into v_trip from public.crl_vehicle_trips where id=p_trip for update;
 if not found or not public.crl_is_member(v_trip.institution_id,false) then raise exception 'Viagem não encontrada'; end if;
 if v_trip.created_by <> auth.uid() and not public.crl_is_member(v_trip.institution_id,true) then raise exception 'Sem autorização'; end if;
 if v_trip.arrival_at is not null then raise exception 'Viagem já encerrada'; end if;
 if p_km_final<v_trip.km_initial or p_arrival<v_trip.departure_at then raise exception 'KM ou horário inválido'; end if;
 update public.crl_vehicle_trips set km_final=p_km_final, arrival_at=p_arrival,clean_return=p_clean,notes=p_notes where id=p_trip;
 return p_km_final-v_trip.km_initial;
end $function$
;

-- crl_is_admin()
CREATE OR REPLACE FUNCTION public.crl_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select exists(select 1 from public.crl_members m where m.auth_user_id=(select auth.uid()) and m.active and m.role='admin')$function$
;

-- crl_is_member(tenant uuid, require_admin boolean)
CREATE OR REPLACE FUNCTION public.crl_is_member(tenant uuid, require_admin boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select exists(select 1 from public.crl_members m where m.institution_id=tenant and m.auth_user_id=(select auth.uid()) and m.active and (not require_admin or m.role='admin'))$function$
;

-- crl_keep_closed_stays_immutable()
CREATE OR REPLACE FUNCTION public.crl_keep_closed_stays_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.status <> 'active' then
   raise exception 'CRL: acolhimento encerrado é imutável. Abra um novo período ou registre uma retificação.';
 end if;
 if old.resident_id is distinct from new.resident_id
    or old.institution_id is distinct from new.institution_id
    or old.admission_date is distinct from new.admission_date then
   raise exception 'CRL: identidade e admissão do período não podem ser substituídas';
 end if;
 if new.status = 'active' and (new.departure_date is not null or new.departure_reason is not null) then
   raise exception 'CRL: período ativo não possui data de saída';
 end if;
 if new.status <> 'active' and (new.departure_date is null or new.departure_reason is null) then
   raise exception 'CRL: encerramento exige data e justificativa';
 end if;
 return new;
end $function$
;

-- crl_open_resocialization(p_stay uuid, p_purpose text, p_justification text, p_expected_return timestamp with time zone, p_pickup text, p_no_pickup boolean)
CREATE OR REPLACE FUNCTION public.crl_open_resocialization(p_stay uuid, p_purpose text, p_justification text, p_expected_return timestamp with time zone DEFAULT NULL::timestamp with time zone, p_pickup text DEFAULT NULL::text, p_no_pickup boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_stay public.crl_stays%rowtype; v_actor uuid; v_id uuid;
begin
 v_actor:=(select auth.uid());
 select * into v_stay from public.crl_stays where id=p_stay;
 if v_actor is null or not found or v_stay.status<>'active'
 or not public.crl_is_member(v_stay.institution_id,false)
 or not public.crl_can_access_stay(p_stay) then raise exception 'Acolhimento não autorizado'; end if;
 if length(trim(coalesce(p_purpose,'')))<3 or length(p_purpose)>500
 or length(trim(coalesce(p_justification,'')))<3 or length(p_justification)>2000
 then raise exception 'Informe a finalidade e a justificativa'; end if;
 if p_expected_return is not null and p_expected_return<now()
 then raise exception 'Previsão de retorno não pode estar no passado'; end if;
 if p_no_pickup is false and length(trim(coalesce(p_pickup,'')))<3
 then raise exception 'Informe quem irá buscar ou marque que não haverá responsável'; end if;
 insert into public.crl_resocializations(
  institution_id,stay_id,purpose,justification,expected_return_at,picked_up_by,no_responsible_pickup,authorization_by)
 values(v_stay.institution_id,p_stay,trim(p_purpose),trim(p_justification),
 p_expected_return,nullif(trim(p_pickup),''),p_no_pickup,v_actor)
 returning id into v_id;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_stay.institution_id,v_actor,'resocialization_authorized','crl_resocializations',v_id,
 jsonb_build_object('stay_id',p_stay,'no_responsible_pickup',p_no_pickup));
 return v_id;
end $function$
;

-- crl_prepare_evolution_report(p_stay uuid, p_month date)
CREATE OR REPLACE FUNCTION public.crl_prepare_evolution_report(p_stay uuid, p_month date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid;v_stay public.crl_stays%rowtype;v_report uuid;
 v_start timestamptz;v_end timestamptz;v_next date;
 v_notes integer;v_occurrences integer;v_att_present integer;v_att_absent integer;v_att_late integer;v_att_excused integer;
 v_tasks integer;v_outings integer;v_returned integer;
 v_evidence jsonb;v_counts jsonb;v_snapshot jsonb;v_text text;
 v_existing text;
begin
 v_actor:=(select auth.uid());
 select * into v_stay from public.crl_stays where id=p_stay;
 if not found or v_actor is null or not public.crl_is_member(v_stay.institution_id,true)
 then raise exception 'Apenas ADM da instituição pode preparar relatório';end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date
 or p_month>current_date or p_month<(v_stay.admission_date - interval '1 month')::date
 then raise exception 'Escolha uma competência mensal válida';end if;
 v_next:=(p_month+interval '1 month')::date;
 if v_stay.departure_date is not null and p_month>v_stay.departure_date
 then raise exception 'Competência posterior ao encerramento do acolhimento';end if;
 select report_status into v_existing from public.crl_evolution_reports
 where stay_id=p_stay and month_start=p_month for update;
 if v_existing='approved' then raise exception 'Relatório já aprovado, o histórico é permanente';end if;
 v_start:=p_month::timestamp at time zone 'America/Sao_Paulo';
 v_end:=v_next::timestamp at time zone 'America/Sao_Paulo';
 select count(*), count(*) filter(where category='ocorrencia')
 into v_notes,v_occurrences from public.crl_records
 where stay_id=p_stay and institution_id=v_stay.institution_id and created_at>=v_start and created_at<v_end;
 select coalesce(jsonb_agg(jsonb_build_object(
   'kind','record','id',r.id,'category',r.category,'created_at',r.created_at,
   'excerpt',left(r.original_text,250),'correction_of',r.correction_of
 ) order by r.created_at desc),'[]'::jsonb) into v_evidence
 from (
   select id,category,created_at,original_text,correction_of
   from public.crl_records where stay_id=p_stay and institution_id=v_stay.institution_id
    and created_at>=v_start and created_at<v_end
   order by created_at desc limit 30
 ) r;
 select count(*) filter(where a.status='present'),
   count(*) filter(where a.status='absent'),
   count(*) filter(where a.status='late'),
   count(*) filter(where a.status='excused')
 into v_att_present,v_att_absent,v_att_late,v_att_excused
 from public.crl_attendance a
 join public.crl_activities ac on ac.id=a.activity_id and ac.institution_id=v_stay.institution_id
 where a.stay_id=p_stay and a.institution_id=v_stay.institution_id
  and ac.starts_at>=v_start and ac.starts_at<v_end;
 select count(*) into v_tasks from public.crl_tasks
 where stay_id=p_stay and institution_id=v_stay.institution_id
   and due_at>=v_start and due_at<v_end;
 select count(*),count(*) filter(where actual_return_at is not null)
 into v_outings,v_returned from public.crl_resocializations
 where stay_id=p_stay and institution_id=v_stay.institution_id
   and departure_at>=v_start and departure_at<v_end;
 v_counts:=jsonb_build_object(
 'records',v_notes,'occurrences',v_occurrences,
 'present',v_att_present,'absent',v_att_absent,'late',v_att_late,'excused',v_att_excused,
 'tasks_planned',v_tasks,'resocializations_started',v_outings,'resocializations_returned',v_returned
 );
 v_snapshot:=jsonb_build_object(
 'month_start',p_month,'until_exclusive',v_next,'counts',v_counts,'evidence',v_evidence,
 'evidence_truncated',v_notes>jsonb_array_length(v_evidence),
 'method','Contagens de lançamentos do período e até 30 excertos com referência à origem. Sem avaliação clínica ou causal.'
 );
 v_text:='Relatório de acompanhamento — '||to_char(p_month,'MM/YYYY')||E'\n\n'||
 'Registros individuais lançados: '||v_notes||' (ocorrências: '||v_occurrences||').'||
 E'\nDevocionais: '||v_att_present||' presenças, '||v_att_late||' atrasos, '||
 v_att_absent||' faltas e '||v_att_excused||' ausências justificadas.'||
 E'\nTarefas programadas: '||v_tasks||'.'||
 E'\nRessocializações iniciadas: '||v_outings||'; com retorno registrado até esta extração: '||v_returned||'.'||
 E'\n\nObservações da administração: revisar os registros originais, descrever apenas fatos verificáveis e indicar situações que exigem acompanhamento.'||
 E'\n\nEste texto automático não identifica causa, recuperação, estado emocional ou diagnóstico e não substitui avaliação profissional.';
 insert into public.crl_evolution_reports(
 institution_id,stay_id,month_start,report_status,source_snapshot,generated_text,prepared_by)
 values(v_stay.institution_id,p_stay,p_month,'draft',v_snapshot,v_text,v_actor)
 on conflict (stay_id,month_start) do update set
  source_snapshot=excluded.source_snapshot,
  generated_text=excluded.generated_text,
  prepared_by=excluded.prepared_by,
  updated_at=now()
 returning id into v_report;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_stay.institution_id,v_actor,'evolution_draft_prepared','crl_evolution_reports',v_report,
   jsonb_build_object('month',p_month,'record_count',v_notes,'evidence_count',jsonb_array_length(v_evidence)));
 return v_report;
end $function$
;

-- crl_preserve_approved_evolution()
CREATE OR REPLACE FUNCTION public.crl_preserve_approved_evolution()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.report_status='approved' then
   raise exception 'CRL: relatório aprovado não pode ser sobrescrito';
 end if;
 if new.institution_id is distinct from old.institution_id
    or new.stay_id is distinct from old.stay_id
    or new.month_start is distinct from old.month_start
 then raise exception 'CRL: vínculo e competência não podem ser alterados';end if;
 return new;
end $function$
;

-- crl_protect_trip_history()
CREATE OR REPLACE FUNCTION public.crl_protect_trip_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.arrival_at is not null then
   raise exception 'CRL: viagem encerrada só pode receber retificação';
 end if;
 if (to_jsonb(new) - 'km_final' - 'arrival_at' - 'clean_return' - 'damage_reported' - 'notes' - 'km_driven')
    is distinct from
    (to_jsonb(old) - 'km_final' - 'arrival_at' - 'clean_return' - 'damage_reported' - 'notes' - 'km_driven')
 then raise exception 'CRL: dados da abertura da viagem não podem ser alterados'; end if;
 if (new.arrival_at is null) <> (new.km_final is null)
 then raise exception 'CRL: hora de chegada e KM final devem ser informados juntos'; end if;
 if new.arrival_at is not null and new.arrival_at < old.departure_at
 then raise exception 'CRL: chegada anterior à saída'; end if;
 return new;
end $function$
;

-- crl_readmit_resident(p_resident uuid, p_date date, p_monthly numeric, p_due_day integer)
CREATE OR REPLACE FUNCTION public.crl_readmit_resident(p_resident uuid, p_date date, p_monthly numeric DEFAULT 0, p_due_day integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_resident public.crl_residents%rowtype; v_actor uuid; v_stay uuid; v_latest_exit date;
begin
 v_actor := (select auth.uid());
 select * into v_resident from public.crl_residents where id=p_resident for update;
 if not found or v_actor is null or not public.crl_is_member(v_resident.institution_id,true)
 then raise exception 'Apenas o ADM pode abrir um retorno'; end if;
 if p_date is null or p_date>current_date then raise exception 'Data de reingresso inválida'; end if;
 if p_monthly is null or p_monthly<0 then raise exception 'Contribuição inválida'; end if;
 if p_due_day is not null and (p_due_day<1 or p_due_day>31) then raise exception 'Vencimento inválido'; end if;
 if exists(select 1 from public.crl_stays where resident_id=p_resident and status='active')
 then raise exception 'Já existe acolhimento ativo para esta pessoa'; end if;
 select max(departure_date) into v_latest_exit from public.crl_stays
 where resident_id=p_resident and status<>'active';
 if v_latest_exit is not null and p_date < v_latest_exit then
   raise exception 'Data de retorno anterior ao último encerramento';
 end if;
 insert into public.crl_stays (institution_id,resident_id,admission_date,monthly_contribution,due_day,created_by)
 values(v_resident.institution_id,p_resident,p_date,p_monthly,p_due_day,v_actor)
 returning id into v_stay;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_resident.institution_id,v_actor,'readmitted','crl_stays',v_stay,
 jsonb_build_object('resident_id',p_resident,'admission_date',p_date,'previous_departure',v_latest_exit));
 return v_stay;
end $function$
;

-- crl_record_medication_event(p_medication uuid, p_status text, p_notes text)
CREATE OR REPLACE FUNCTION public.crl_record_medication_event(p_medication uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_med public.crl_medication_records%rowtype; v_id uuid; v_actor uuid;
begin
 v_actor:=(select auth.uid());
 select * into v_med from public.crl_medication_records where id=p_medication;
 if v_actor is null or not found or v_med.verified_by is null
 or not public.crl_is_member(v_med.institution_id,false)
 or not public.crl_can_access_stay(v_med.stay_id) then
   raise exception 'Medicamento não conferido ou acolhido não ativo';
 end if;
 if p_status not in ('administrado','recusado','nao_administrado','indisponivel') or p_status is null
 then raise exception 'Status inválido'; end if;
 if p_status<>'administrado' and length(trim(coalesce(p_notes,'')))<3
 then raise exception 'Informe a justificativa ou ocorrência'; end if;
 if length(coalesce(p_notes,''))>1500 then raise exception 'Observação muito longa'; end if;
 insert into public.crl_medication_administrations(
  institution_id,medication_record_id,status,notes,recorded_by)
 values(v_med.institution_id,p_medication,p_status,nullif(trim(p_notes),''),v_actor)
 returning id into v_id;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_med.institution_id,v_actor,'medication_event_recorded','crl_medication_administrations',v_id,
 jsonb_build_object('medication_record_id',p_medication,'status',p_status));
 return v_id;
end $function$
;

-- crl_rectify_trip(p_trip uuid, p_reason text, p_km_final numeric, p_arrival timestamp with time zone, p_notes text)
CREATE OR REPLACE FUNCTION public.crl_rectify_trip(p_trip uuid, p_reason text, p_km_final numeric DEFAULT NULL::numeric, p_arrival timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_trip public.crl_vehicle_trips%rowtype; v_id uuid; v_actor uuid;
begin
 v_actor=(select auth.uid());
 if v_actor is null then raise exception 'Acesso negado'; end if;
 select * into v_trip from public.crl_vehicle_trips where id=p_trip;
 if not found or not public.crl_is_member(v_trip.institution_id,true)
 then raise exception 'Apenas ADM da instituição pode retificar'; end if;
 if v_trip.arrival_at is null then raise exception 'Viagem ainda não encerrada'; end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Informe a justificativa'; end if;
 if p_km_final is not null and p_km_final<v_trip.km_initial then raise exception 'KM final inválido'; end if;
 if p_arrival is not null and p_arrival<v_trip.departure_at then raise exception 'Horário inválido'; end if;
 insert into public.crl_trip_rectifications(institution_id,trip_id,author_id,new_km_final,new_arrival_at,new_notes,justification)
 values(v_trip.institution_id,p_trip,v_actor,p_km_final,p_arrival,p_notes,trim(p_reason)) returning id into v_id;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_trip.institution_id,v_actor,'rectified','crl_vehicle_trips',p_trip,jsonb_build_object('rectification_id',v_id,'reason',trim(p_reason)));
 return v_id;
end $function$
;

-- crl_register_contribution_payment(p_contribution uuid, p_amount numeric, p_paid_on date, p_method text, p_notes text)
CREATE OR REPLACE FUNCTION public.crl_register_contribution_payment(p_contribution uuid, p_amount numeric, p_paid_on date, p_method text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_due public.crl_contributions%rowtype; v_id uuid; v_actor uuid; v_new_total numeric;
begin
 v_actor=(select auth.uid());
 select * into v_due from public.crl_contributions where id=p_contribution for update;
 if not found or v_actor is null or not public.crl_is_member(v_due.institution_id,true)
 then raise exception 'Somente ADM pode registrar pagamentos'; end if;
 if p_amount is null or p_amount<=0 or p_amount>1000000 then raise exception 'Valor inválido'; end if;
 if p_paid_on is null or p_paid_on>current_date then raise exception 'Data de recebimento inválida'; end if;
 v_new_total:=v_due.paid_amount+p_amount;
 if v_new_total>v_due.amount then raise exception 'Pagamento excede o valor desta contribuição'; end if;
 insert into public.crl_contribution_payments
  (institution_id,contribution_id,amount,paid_on,payment_method,notes,registered_by)
 values(v_due.institution_id,p_contribution,p_amount,p_paid_on,
        nullif(left(trim(p_method),80),''),
        nullif(left(trim(p_notes),2000),''),v_actor) returning id into v_id;
 update public.crl_contributions set paid_amount=v_new_total where id=p_contribution;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_due.institution_id,v_actor,'payment_registered','crl_contribution_payments',v_id,
 jsonb_build_object('contribution_id',p_contribution,'amount',p_amount,'paid_on',p_paid_on));
 return v_id;
end $function$
;

-- crl_register_monitor_salary(p_member uuid, p_competence date)
CREATE OR REPLACE FUNCTION public.crl_register_monitor_salary(p_member uuid, p_competence date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid; v_member public.crl_members%rowtype; v_id uuid; v_payroll uuid;
begin
 v_actor=(select auth.uid());
 select * into v_member from public.crl_members where id=p_member and role='monitor';
 if v_actor is null or not found or not public.crl_is_member(v_member.institution_id,true) then raise exception 'Apenas ADM pode lançar salários';end if;
 if not v_member.active or v_member.monitor_vinculo<>'contratado' or coalesce(v_member.salary_monthly,0)<=0 then
  raise exception 'Monitor contratado ativo com salário configurado é obrigatório';end if;
 if p_competence is null or p_competence<>date_trunc('month',p_competence)::date
    or p_competence > date_trunc('month',current_date)::date then raise exception 'Competência inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_member.id::text||p_competence::text,0));
 if exists (select 1 from public.crl_monitor_payroll where member_id=p_member and competence=p_competence)
 then raise exception 'Salário já lançado nesta competência';end if;
 insert into public.crl_financial_entries(institution_id,description,entry_type,amount,date,created_by)
 values(v_member.institution_id,'Salário monitor contratado - '||v_member.display_name||' - '||to_char(p_competence,'MM/YYYY'),
 'expense',v_member.salary_monthly,current_date,v_actor) returning id into v_id;
 insert into public.crl_monitor_payroll(institution_id,member_id,competence,amount,financial_entry_id,created_by)
 values(v_member.institution_id,v_member.id,p_competence,v_member.salary_monthly,v_id,v_actor)
 returning id into v_payroll;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_member.institution_id,v_actor,'monitor_salary_posted','crl_financial_entries',v_id,
 jsonb_build_object('monitor_id',v_member.id,'competence',p_competence,'amount',v_member.salary_monthly,'payroll_id',v_payroll));
 return v_id;
end $function$
;

-- crl_register_stock_movement(p_institution uuid, p_product text, p_unit text, p_quantity numeric, p_direction text, p_source text)
CREATE OR REPLACE FUNCTION public.crl_register_stock_movement(p_institution uuid, p_product text, p_unit text, p_quantity numeric, p_direction text, p_source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid; current_balance numeric; v_id uuid; v_product text; v_unit text;
begin
 actor=(select auth.uid());
 if actor is null or not public.crl_is_member(p_institution,false) then raise exception 'Sem acesso ao estoque';end if;
 v_product=trim(coalesce(p_product,''));v_unit=trim(coalesce(p_unit,''));
 if length(v_product)<2 or length(v_product)>150 then raise exception 'Produto inválido';end if;
 if v_unit not in ('un','kg','litro','caixa','pacote') then raise exception 'Unidade inválida';end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>1000000 then raise exception 'Quantidade inválida';end if;
 if p_direction not in ('in','out') then raise exception 'Movimento inválido';end if;
 if length(trim(coalesce(p_source,'')))<3 or length(p_source)>300 then raise exception 'Informe motivo ou origem';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution::text||lower(v_product)||v_unit,0));
 select coalesce(sum(case when direction='in' then quantity else -quantity end),0)
 into current_balance from public.crl_inventory_movements
 where institution_id=p_institution and lower(trim(product))=lower(v_product) and unit=v_unit;
 if p_direction='out' and p_quantity>current_balance then raise exception 'Saldo insuficiente para saída';end if;
 insert into public.crl_inventory_movements(institution_id,product,unit,quantity,direction,source,occurred_at,created_by)
 values(p_institution,v_product,v_unit,p_quantity,p_direction,trim(p_source),now(),actor) returning id into v_id;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(p_institution,actor,'stock_movement','crl_inventory_movements',v_id,
 jsonb_build_object('direction',p_direction,'quantity',p_quantity,'unit',v_unit));
 return v_id;
end $function$
;

-- crl_register_verified_medication(p_stay uuid, p_name text, p_dose text, p_schedule text, p_prescription_file uuid)
CREATE OR REPLACE FUNCTION public.crl_register_verified_medication(p_stay uuid, p_name text, p_dose text, p_schedule text, p_prescription_file uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_stay public.crl_stays%rowtype; v_id uuid; v_actor uuid;
begin
 v_actor:=(select auth.uid());
 select * into v_stay from public.crl_stays where id=p_stay;
 if v_actor is null or not found or v_stay.status<>'active'
   or not public.crl_is_member(v_stay.institution_id,true) then
   raise exception 'Apenas ADM pode conferir medicamentos de acolhidos ativos';
 end if;
 if length(trim(coalesce(p_name,'')))<2 or length(p_name)>180 or
    length(trim(coalesce(p_dose,'')))<1 or length(p_dose)>200 or
    length(trim(coalesce(p_schedule,'')))<2 or length(p_schedule)>500 then
   raise exception 'Medicamento, dose e horários transcritos são obrigatórios';
 end if;
 if p_prescription_file is null or not exists (
   select 1 from public.crl_files f where f.id=p_prescription_file
   and f.institution_id=v_stay.institution_id and f.stay_id=p_stay
   and f.category='receita'
 ) then raise exception 'Anexe uma foto ou PDF da prescrição ao acolhimento'; end if;
 insert into public.crl_medication_records(
  institution_id,stay_id,prescription_file_id,medication_name,dose_text,schedule_text,verified_by)
 values(v_stay.institution_id,p_stay,p_prescription_file,trim(p_name),trim(p_dose),trim(p_schedule),v_actor)
 returning id into v_id;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_stay.institution_id,v_actor,'medication_prescription_verified','crl_medication_records',v_id,
 jsonb_build_object('stay_id',p_stay,'prescription_file_id',p_prescription_file));
 return v_id;
end $function$
;

-- crl_request_medication(p_stay uuid, p_file uuid, p_name text, p_dose text, p_schedule text, p_notes text)
CREATE OR REPLACE FUNCTION public.crl_request_medication(p_stay uuid, p_file uuid, p_name text, p_dose text, p_schedule text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_stay public.crl_stays%rowtype;v_id uuid;v_actor uuid;
begin
 v_actor=(select auth.uid());
 select * into v_stay from public.crl_stays where id=p_stay;
 if not found or v_actor is null or v_stay.status<>'active' or not public.crl_is_member(v_stay.institution_id,false)
 or not public.crl_can_access_stay(p_stay) then raise exception 'Acolhimento não autorizado';end if;
 if p_file is null or not exists(select 1 from public.crl_files where id=p_file and stay_id=p_stay
   and institution_id=v_stay.institution_id and category='receita')
 then raise exception 'Anexe uma imagem ou PDF da prescrição';end if;
 if length(trim(coalesce(p_name,'')))<2 or length(p_name)>180
 or length(trim(coalesce(p_dose,'')))<1 or length(p_dose)>200
 or length(trim(coalesce(p_schedule,'')))<2 or length(p_schedule)>500
 or length(coalesce(p_notes,''))>1500 then raise exception 'Complete os dados transcritos da receita';end if;
 insert into public.crl_medication_requests(
 institution_id,stay_id,prescription_file_id,medication_name,dose_text,schedule_text,monitor_notes,requested_by)
 values(v_stay.institution_id,p_stay,p_file,trim(p_name),trim(p_dose),trim(p_schedule),
 nullif(trim(p_notes),''),v_actor) returning id into v_id;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_stay.institution_id,v_actor,'medication_pending_review','crl_medication_requests',v_id,
 jsonb_build_object('stay_id',p_stay,'prescription_file_id',p_file));
 return v_id;
end $function$
;

-- crl_review_medication_request(p_request uuid, p_approve boolean, p_review_note text)
CREATE OR REPLACE FUNCTION public.crl_review_medication_request(p_request uuid, p_approve boolean, p_review_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.crl_medication_requests%rowtype;v_actor uuid;v_med_id uuid;
begin
 v_actor=(select auth.uid());
 select * into v from public.crl_medication_requests where id=p_request for update;
 if not found or v_actor is null or not public.crl_is_member(v.institution_id,true)
 then raise exception 'Somente ADM pode conferir a prescrição';end if;
 if v.request_status<>'pending' then raise exception 'Solicitação já revisada';end if;
 if length(trim(coalesce(p_review_note,'')))<3 or length(p_review_note)>2000
 then raise exception 'Registre o resultado da conferência';end if;
 if p_approve then
   if not exists(select 1 from public.crl_stays where id=v.stay_id and status='active') then
    raise exception 'Acolhimento encerrado';end if;
   if not exists(select 1 from public.crl_files where id=v.prescription_file_id
     and stay_id=v.stay_id and institution_id=v.institution_id and category='receita') then
    raise exception 'Prescrição não localizada';end if;
   insert into public.crl_medication_records(
    institution_id,stay_id,prescription_file_id,medication_name,dose_text,schedule_text,verified_by)
   values(v.institution_id,v.stay_id,v.prescription_file_id,
    v.medication_name,v.dose_text,v.schedule_text,v_actor) returning id into v_med_id;
 end if;
 update public.crl_medication_requests set request_status=case when p_approve then 'approved' else 'rejected' end,
  reviewed_by=v_actor,reviewed_at=now(),review_notes=trim(p_review_note),linked_medication_id=v_med_id
 where id=v.id;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v.institution_id,v_actor,case when p_approve then 'medication_request_approved' else 'medication_request_rejected' end,
 'crl_medication_requests',v.id,jsonb_build_object('medication_id',v_med_id,'stay_id',v.stay_id));
 return v_med_id;
end $function$
;

-- crl_save_evolution_review_draft(p_report uuid, p_text text)
CREATE OR REPLACE FUNCTION public.crl_save_evolution_review_draft(p_report uuid, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid;v_report public.crl_evolution_reports%rowtype;
begin
 v_actor := (select auth.uid());
 select * into v_report from public.crl_evolution_reports where id=p_report for update;
 if v_actor is null or not found or not public.crl_is_member(v_report.institution_id,true) then
  raise exception 'Apenas ADM autorizado pode revisar o relatório';
 end if;
 if v_report.report_status<>'draft' then
  raise exception 'Relatório aprovado não admite alteração';
 end if;
 if length(trim(coalesce(p_text,'')))<40 or length(p_text)>15000 then
  raise exception 'Informe de 40 a 15000 caracteres para o rascunho';
 end if;
 update public.crl_evolution_reports
  set reviewed_draft_text=trim(p_text),
      reviewed_draft_at=now(), reviewed_draft_by=v_actor,updated_at=now()
 where id=v_report.id;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_report.institution_id,v_actor,'evolution_review_draft_saved','crl_evolution_reports',v_report.id,
        jsonb_build_object('month',v_report.month_start,'length',length(trim(p_text))));
 return v_report.id;
end $function$
;

-- crl_set_identity_document(p_stay_id uuid, p_document_type text, p_number text)
CREATE OR REPLACE FUNCTION public.crl_set_identity_document(p_stay_id uuid, p_document_type text, p_number text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_stay public.crl_stays%rowtype; v_actor uuid; v_value text;
begin
 v_actor=(select auth.uid());
 select * into v_stay from public.crl_stays where id=p_stay_id;
 if not found or v_actor is null or not public.crl_is_member(v_stay.institution_id,true)
 then raise exception 'Apenas ADM pode atualizar CPF ou RG'; end if;
 v_value=trim(coalesce(p_number,''));
 if p_document_type='cpf' then
   if regexp_replace(v_value,'[^0-9]','','g') !~ '^[0-9]{11}$'
   then raise exception 'CPF deve conter 11 dígitos'; end if;
   update public.crl_residents set cpf=v_value where id=v_stay.resident_id and institution_id=v_stay.institution_id;
 elsif p_document_type='rg' then
   if length(v_value)<4 or length(v_value)>30 or v_value !~ '^[0-9A-Za-z .-]+$'
   then raise exception 'RG inválido'; end if;
   update public.crl_residents set rg=v_value where id=v_stay.resident_id and institution_id=v_stay.institution_id;
 else raise exception 'Tipo inválido'; end if;
 insert into public.crl_audit_events(institution_id,actor_id,action,entity_name,entity_id,data)
 values(v_stay.institution_id,v_actor,'identity_document_updated','crl_residents',v_stay.resident_id,
 jsonb_build_object('document_type',p_document_type,'stay_id',p_stay_id));
end $function$
;

-- crl_stock_balances(p_institution uuid)
CREATE OR REPLACE FUNCTION public.crl_stock_balances(p_institution uuid)
 RETURNS TABLE(product text, unit text, balance numeric, movements bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.crl_is_member(p_institution,false) then raise exception 'Sem acesso ao estoque';end if;
 return query
 select m.product,m.unit,
 coalesce(sum(case when m.direction='in' then m.quantity else -m.quantity end),0),
 count(*)
 from public.crl_inventory_movements m
 where m.institution_id=p_institution
 group by m.product,m.unit order by m.product,m.unit;
end $function$
;
