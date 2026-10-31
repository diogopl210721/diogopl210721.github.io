-- DDS Finance — regra de classificação 2 (31/10/2026, pedido do Diogo):
-- a PerformanceFee é a COMISSÃO da conta PAMM paga ao gestor. É saída de dinheiro, não prejuízo.
--   op_result    = lucro das operações (só TradeResults)
--   capital_flow = depósito (+), retirada (−) e comissão PAMM (−, Amount da linha)
-- O capital estimado não muda; o lucro e o lucro diário deixam de descontar a comissão.
-- As impressões digitais (fingerprint, prefixo 'v1') continuam iguais: dependem só dos campos brutos.
-- As permissões (grant/revoke) das funções não mudam com create or replace.

create or replace function public.dds_finance__analyze(p_uid uuid, p_source text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb := public.dds_finance__prepare_rows(p_payload);
  v_tz text;
  v_num text := '^[-+]?[0-9]+(\.[0-9]+)?$';
begin
  if p_source is null or p_source !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'invalid_source' using errcode = '22023';
  end if;

  select s.source_timezone into v_tz from public.dds_finance_settings s where s.user_id = p_uid;
  v_tz := coalesce(v_tz, 'America/Sao_Paulo');

  -- tabela temporária descartada no fim da transação (on commit drop). Se já houver uma análise
  -- na mesma transação, a anterior é renomeada (continua sendo descartada no commit).
  if to_regclass('pg_temp.dds_finance_tmp') is not null then
    execute format('alter table pg_temp.dds_finance_tmp rename to dds_finance_tmp_%s',
                   replace(gen_random_uuid()::text, '-', ''));
  end if;
  create temp table dds_finance_tmp (
    row_no int primary key,
    payload jsonb,
    ext_id text,
    reason text,
    classification text,
    currency text,
    amount numeric,
    amount_profit numeric,
    op_result numeric,
    capital_flow numeric,
    tx_time timestamptz,
    time_raw text,
    investment_id text,
    manager_name text,
    fingerprint text,
    error_code text,
    status text,
    existing_payload jsonb
  ) on commit drop;

  insert into pg_temp.dds_finance_tmp (row_no, payload, ext_id, reason, currency, time_raw, investment_id, manager_name, error_code, amount, amount_profit, tx_time)
  select r.ord::int,
         case when jsonb_typeof(r.val) = 'object' and r.val ? '__invalid_row' then r.val->'__raw' else r.val end,
         f.ext_id, f.reason, f.currency, f.time_txt, f.investment_id, f.manager_name,
         case
           when jsonb_typeof(r.val) <> 'object' then 'row_not_object'
           when r.val ? '__invalid_row' then 'column_count_mismatch'
           when f.ext_id is null then 'missing_id'
           when f.ext_id !~ '^[0-9]{1,20}$' then 'invalid_id'
           when f.reason is null then 'missing_reason'
           when f.currency is null or f.currency !~ '^[A-Z]{3}$' then 'invalid_currency'
           when f.amount_txt is null or f.amount_txt !~ v_num or length(f.amount_txt) > 30 then 'invalid_amount'
           when f.profit_txt is null or f.profit_txt !~ v_num or length(f.profit_txt) > 30 then 'invalid_amount_profit'
           when f.time_txt is null then 'missing_time'
           when public.dds_finance__parse_time(f.time_txt, v_tz) is null then 'invalid_time'
           else null
         end,
         case when f.amount_txt ~ v_num and length(f.amount_txt) <= 30 then f.amount_txt::numeric end,
         case when f.profit_txt ~ v_num and length(f.profit_txt) <= 30 then f.profit_txt::numeric end,
         public.dds_finance__parse_time(f.time_txt, v_tz)
  from jsonb_array_elements(v_rows) with ordinality as r(val, ord)
  cross join lateral (
    select
      nullif(btrim(case when jsonb_typeof(r.val) = 'object' then r.val->>'Id' end), '') as ext_id,
      nullif(btrim(case when jsonb_typeof(r.val) = 'object' then r.val->>'Reason' end), '') as reason,
      upper(nullif(btrim(case when jsonb_typeof(r.val) = 'object' then r.val->>'Currency' end), '')) as currency,
      nullif(btrim(case when jsonb_typeof(r.val) = 'object' then r.val->>'Amount' end), '') as amount_txt,
      nullif(btrim(case when jsonb_typeof(r.val) = 'object' then r.val->>'AmountProfit' end), '') as profit_txt,
      nullif(btrim(case when jsonb_typeof(r.val) = 'object' then r.val->>'Time' end), '') as time_txt,
      nullif(btrim(case when jsonb_typeof(r.val) = 'object' then r.val->>'InvestmentId' end), '') as investment_id,
      nullif(btrim(case when jsonb_typeof(r.val) = 'object' then r.val->>'ManagerName' end), '') as manager_name
  ) f;

  -- estatísticas da tabela temporária: sem isso o planejador compara linha a linha com o histórico
  create index on pg_temp.dds_finance_tmp (ext_id);
  analyze pg_temp.dds_finance_tmp;

  -- classificação e valores considerados
  update pg_temp.dds_finance_tmp t
    set classification = case t.reason
          when 'TradeResults' then 'trade'
          when 'PerformanceFee' then 'performance_fee'
          when 'Deposit' then 'deposit'
          when 'Withdrawal' then 'withdrawal'
          else 'unclassified' end
    where t.error_code is null;

  update pg_temp.dds_finance_tmp t
    set op_result = case t.classification
          when 'trade' then t.amount_profit
          else 0 end,
        -- regra 2: a comissão PAMM (PerformanceFee) é saída de dinheiro, não resultado das operações
        capital_flow = case t.classification
          when 'deposit' then t.amount
          when 'withdrawal' then -abs(t.amount)
          when 'performance_fee' then t.amount
          else 0 end,
        fingerprint = encode(extensions.digest(convert_to(concat_ws('|',
          'v1', t.ext_id, t.reason,
          public.dds_finance__norm(t.payload->>'InvestmentId'),
          public.dds_finance__norm(t.payload->>'ManagerId'),
          t.currency,
          trim_scale(t.amount)::text,
          trim_scale(t.amount_profit)::text,
          replace(t.time_raw, 'T', ' '),
          public.dds_finance__norm(t.payload->>'RolloverId'),
          public.dds_finance__norm(t.payload->>'RequestId'),
          public.dds_finance__norm(t.payload->>'PlatformPositionId'),
          public.dds_finance__norm(t.payload->>'PlatformOperationId')), 'UTF8'), 'sha256'), 'hex')
    where t.error_code is null;

  update pg_temp.dds_finance_tmp set status = 'invalid' where error_code is not null;

  -- mesmo Id repetido no arquivo
  with g as (
    select t.ext_id, count(*) as c, count(distinct t.fingerprint) as fc, min(t.row_no) as first_row
    from pg_temp.dds_finance_tmp t
    where t.error_code is null
    group by t.ext_id
    having count(*) > 1
  )
  update pg_temp.dds_finance_tmp t
    set status = case when g.fc > 1 then 'conflict_in_file'
                      when t.row_no = g.first_row then null
                      else 'duplicate_in_file' end
    from g
    where t.ext_id = g.ext_id and t.error_code is null;

  -- já existe no banco
  update pg_temp.dds_finance_tmp t
    set existing_payload = x.original_payload,
        status = case when x.fingerprint = t.fingerprint then 'existing' else 'conflict_existing' end
    from public.dds_finance_transactions x
    where x.user_id = p_uid
      and x.source = p_source
      and x.external_transaction_id = t.ext_id
      and t.error_code is null
      and t.status is null;

  update pg_temp.dds_finance_tmp set status = 'new' where status is null;
end $$;

create or replace function public.dds_finance__summary(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur text;
  v jsonb;
begin
  select s.currency into v_cur from public.dds_finance_settings s where s.user_id = p_uid;
  v_cur := coalesce(v_cur, 'USD');

  select jsonb_build_object(
    'total_rows', count(*),
    'new_rows', count(*) filter (where status = 'new'),
    'existing_rows', count(*) filter (where status = 'existing'),
    'duplicate_rows', count(*) filter (where status = 'duplicate_in_file'),
    'invalid_rows', count(*) filter (where status = 'invalid'),
    'conflict_rows', count(*) filter (where status in ('conflict_in_file', 'conflict_existing')),
    'conflict_ids', count(distinct ext_id) filter (where status in ('conflict_in_file', 'conflict_existing')),
    'unclassified_new_rows', count(*) filter (where status = 'new' and classification = 'unclassified'),
    'other_currency_new_rows', count(*) filter (where status = 'new' and currency <> v_cur),
    'trade_amount_mismatch_rows', count(*) filter (where error_code is null and classification = 'trade' and amount <> amount_profit),
    'period_start', min(tx_time) filter (where error_code is null),
    'period_end', max(tx_time) filter (where error_code is null),
    'new_period_start', min(tx_time) filter (where status = 'new'),
    'new_period_end', max(tx_time) filter (where status = 'new'),
    'reference_currency', v_cur,
    'impact', jsonb_build_object(
      'op_result', coalesce(sum(op_result) filter (where status = 'new' and currency = v_cur), 0),
      'trade_result', coalesce(sum(op_result) filter (where status = 'new' and currency = v_cur and classification = 'trade'), 0),
      'fee_result', coalesce(sum(capital_flow) filter (where status = 'new' and currency = v_cur and classification = 'performance_fee'), 0),
      'deposits', coalesce(sum(capital_flow) filter (where status = 'new' and currency = v_cur and classification = 'deposit'), 0),
      'withdrawals', coalesce(-sum(capital_flow) filter (where status = 'new' and currency = v_cur and classification = 'withdrawal'), 0))
  ) into v
  from pg_temp.dds_finance_tmp;

  v := v || jsonb_build_object(
    'already_imported_file', null,
    'currencies', (select coalesce(jsonb_agg(distinct currency order by currency), '[]'::jsonb)
                   from pg_temp.dds_finance_tmp where error_code is null),
    'reasons', (select coalesce(jsonb_object_agg(reason, c), '{}'::jsonb)
                from (select reason, count(*) as c from pg_temp.dds_finance_tmp
                      where error_code is null group by reason) s),
    'sample', (select coalesce(jsonb_agg(jsonb_build_object(
                  'row', row_no + 1, 'external_id', ext_id, 'reason', reason, 'classification', classification,
                  'currency', currency, 'amount', amount, 'amount_profit', amount_profit,
                  'op_result', op_result, 'capital_flow', capital_flow, 'time', time_raw) order by row_no), '[]'::jsonb)
               from pg_temp.dds_finance_tmp
               where status = 'new' and row_no in (
                 select a.row_no from (select row_no from pg_temp.dds_finance_tmp where status = 'new' order by row_no limit 3) a
                 union
                 select b.row_no from (select row_no from pg_temp.dds_finance_tmp where status = 'new' order by row_no desc limit 3) b)),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object(
                  'row', row_no + 1, 'external_id', ext_id, 'code', error_code, 'payload', payload) order by row_no), '[]'::jsonb)
               from (select * from pg_temp.dds_finance_tmp where status = 'invalid' order by row_no limit 500) s),
    'duplicates', (select coalesce(jsonb_agg(jsonb_build_object('row', row_no + 1, 'external_id', ext_id) order by row_no), '[]'::jsonb)
                   from (select * from pg_temp.dds_finance_tmp where status = 'duplicate_in_file' order by row_no limit 500) s),
    'conflicts', (select coalesce(jsonb_agg(jsonb_build_object(
                    'row', row_no + 1, 'external_id', ext_id,
                    'kind', case status when 'conflict_existing' then 'existing_mismatch' else 'in_file_mismatch' end,
                    'incoming', payload, 'existing', existing_payload) order by row_no), '[]'::jsonb)
                  from (select * from pg_temp.dds_finance_tmp
                        where status in ('conflict_in_file', 'conflict_existing') order by row_no limit 500) s),
    'unclassified', (select coalesce(jsonb_agg(jsonb_build_object('row', row_no + 1, 'external_id', ext_id, 'reason', reason) order by row_no), '[]'::jsonb)
                     from (select * from pg_temp.dds_finance_tmp
                           where status = 'new' and classification = 'unclassified' order by row_no limit 500) s));
  return v;
end $$;

create or replace function public.dds_finance_commit_import(
  p_token text,
  p_rows jsonb,
  p_filename text,
  p_file_hash text,
  p_source text default 'trading_csv'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v_source text := coalesce(p_source, 'trading_csv');
  v_sum jsonb;
  v_job uuid;
  v_inserted int;
  v_new int;
  v_status text;
begin
  if p_filename is null or char_length(p_filename) not between 1 and 255 then
    raise exception 'invalid_filename' using errcode = '22023';
  end if;
  if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_file_hash' using errcode = '22023';
  end if;

  -- uma importação por vez para cada usuário
  perform pg_advisory_xact_lock(hashtextextended('dds_finance_import:' || v_uid::text, 0));

  perform public.dds_finance__ensure_settings(v_uid);
  perform public.dds_finance__analyze(v_uid, v_source, p_rows);
  v_sum := public.dds_finance__summary(v_uid);
  v_new := (v_sum->>'new_rows')::int;

  insert into public.dds_finance_import_jobs (user_id, source, original_filename, file_hash, status, total_rows)
    values (v_uid, v_source, p_filename, p_file_hash, 'processing', (v_sum->>'total_rows')::int)
    returning id into v_job;

  with ins as (
    insert into public.dds_finance_transactions (
      user_id, source, external_transaction_id, reason, classification, investment_id, manager_name,
      currency, amount, amount_profit, op_result, capital_flow, transaction_time, time_raw,
      original_payload, fingerprint, rule_version, source_import_id)
    select v_uid, v_source, t.ext_id, t.reason, t.classification, t.investment_id, t.manager_name,
           t.currency, t.amount, t.amount_profit, t.op_result, t.capital_flow, t.tx_time, t.time_raw,
           t.payload, t.fingerprint, 2, v_job
    from pg_temp.dds_finance_tmp t
    where t.status = 'new'
    order by t.row_no
    on conflict on constraint dds_finance_transactions_unique_external do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  insert into public.dds_finance_import_conflicts (user_id, import_job_id, external_transaction_id, kind, file_row, existing_payload, incoming_payload)
  select v_uid, v_job, t.ext_id,
         case t.status when 'conflict_existing' then 'existing_mismatch' else 'in_file_mismatch' end,
         t.row_no + 1, t.existing_payload, t.payload
  from pg_temp.dds_finance_tmp t
  where t.status in ('conflict_in_file', 'conflict_existing');

  v_status := case
    when (v_sum->>'invalid_rows')::int > 0 or (v_sum->>'conflict_rows')::int > 0
         or (v_sum->>'unclassified_new_rows')::int > 0 then 'completed_with_issues'
    else 'completed' end;

  update public.dds_finance_import_jobs
    set status = v_status,
        inserted_rows = v_inserted,
        existing_rows = (v_sum->>'existing_rows')::int + (v_new - v_inserted),
        duplicate_rows = (v_sum->>'duplicate_rows')::int,
        rejected_rows = (v_sum->>'invalid_rows')::int,
        conflict_rows = (v_sum->>'conflict_rows')::int,
        unclassified_rows = (v_sum->>'unclassified_new_rows')::int,
        period_start = (v_sum->>'period_start')::timestamptz,
        period_end = (v_sum->>'period_end')::timestamptz,
        currencies = array(select jsonb_array_elements_text(v_sum->'currencies')),
        inserted_op_result = case when v_inserted = v_new then (v_sum#>>'{impact,op_result}')::numeric end,
        inserted_deposits = case when v_inserted = v_new then (v_sum#>>'{impact,deposits}')::numeric end,
        inserted_withdrawals = case when v_inserted = v_new then (v_sum#>>'{impact,withdrawals}')::numeric end,
        error_summary = v_sum->'errors',
        completed_at = now()
    where id = v_job;

  perform public.dds_finance__audit(v_uid, 'import_completed', jsonb_build_object(
    'import_job_id', v_job, 'filename', p_filename, 'total_rows', v_sum->'total_rows',
    'inserted_rows', v_inserted, 'conflict_rows', v_sum->'conflict_rows', 'invalid_rows', v_sum->'invalid_rows'));

  return v_sum || jsonb_build_object(
    'import_job_id', v_job,
    'inserted_rows', v_inserted,
    'status', v_status,
    'race_skipped_rows', v_new - v_inserted);
end $$;

create or replace function public.dds_finance_daily_series(p_token text)
returns table (
  day date,
  op_result numeric,
  trade_result numeric,
  fee_result numeric,
  deposits numeric,
  withdrawals numeric,
  tx_count int,
  trade_count int,
  positive_trades int,
  negative_trades int
)
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select public.dds_finance__require(p_token) as uid
  ), s as (
    select coalesce(st.timezone, 'America/Sao_Paulo') as tz, coalesce(st.currency, 'USD') as cur, u.uid
    from u left join public.dds_finance_settings st on st.user_id = u.uid
  )
  select (t.transaction_time at time zone s.tz)::date as day,
         sum(t.op_result),
         coalesce(sum(t.op_result) filter (where t.classification = 'trade'), 0),
         coalesce(sum(t.capital_flow) filter (where t.classification = 'performance_fee'), 0),
         coalesce(sum(t.capital_flow) filter (where t.classification = 'deposit'), 0),
         coalesce(-sum(t.capital_flow) filter (where t.classification = 'withdrawal'), 0),
         count(*)::int,
         (count(*) filter (where t.classification = 'trade'))::int,
         (count(*) filter (where t.classification = 'trade' and t.op_result > 0))::int,
         (count(*) filter (where t.classification = 'trade' and t.op_result < 0))::int
  from public.dds_finance_transactions t
  join s on t.user_id = s.uid
  where t.currency = s.cur and t.classification <> 'unclassified'
  group by 1
  order by 1
$$;

-- Dados já gravados: reclassifica as comissões e marca tudo como regra 2.
update public.dds_finance_transactions
  set op_result = 0, capital_flow = amount, rule_version = 2, updated_at = now()
  where classification = 'performance_fee' and rule_version < 2;
update public.dds_finance_transactions set rule_version = 2 where rule_version < 2;

-- Importações antigas: "lucro das operações adicionado" passa a ser só dos trades gravados por elas.
update public.dds_finance_import_jobs j
  set inserted_op_result = coalesce((
        select sum(t.op_result) from public.dds_finance_transactions t
        where t.source_import_id = j.id
          and t.currency = coalesce((select s.currency from public.dds_finance_settings s where s.user_id = j.user_id), 'USD')), 0)
  where j.inserted_op_result is not null;
