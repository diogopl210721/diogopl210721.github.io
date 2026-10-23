-- DDS Finance — análise e importação incremental do CSV, consultas do app e LGPD.
-- Todas as funções públicas recebem o token de sessão (p_token); ver 20261023130000_dds_finance_sessions.sql.
--
-- Regras de classificação (rule_version 1), validadas com o transactions.csv real e com o saldo
-- confirmado na plataforma em 23/10/2026:
--   TradeResults   → resultado operacional = AmountProfit (igual ao Amount em todo o arquivo)
--   PerformanceFee → resultado operacional = Amount (a taxa efetivamente debitada).
--                    AmountProfit nessa linha é o lucro da semana que foi "liquidado" no
--                    fechamento, não dinheiro saindo da conta; fica guardado para auditoria.
--   Deposit        → entrada de capital = Amount (não é lucro)
--   Withdrawal     → saída de capital = |Amount| (não é prejuízo)
--   outros Reason  → 'unclassified': importados e sinalizados, fora dos cálculos.
--
-- Deduplicação: (user_id, source, external_transaction_id) é único no banco. A comparação de
-- conteúdo usa uma impressão digital dos campos financeiros normalizados (nomes e comentários
-- ficam fora, para que uma mudança de texto não vire divergência).
--
-- Aplicada em partes (dds_finance_import_a … _d) em 23/10/2026.

-- ---------------------------------------------------------------------------
-- Parte A — preparação e análise
-- ---------------------------------------------------------------------------
create or replace function public.dds_finance__norm(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or btrim(p) = '' then ''
    when btrim(p) ~ '^[-+]?[0-9]+(\.[0-9]+)?$' then trim_scale(btrim(p)::numeric)::text
    else btrim(p) end
$$;

-- Aceita [{coluna: valor}, …] ou {columns: [...], rows: [[...], …]} e devolve sempre o primeiro formato.
create or replace function public.dds_finance__prepare_rows(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_required text[] := array['Id', 'Reason', 'Currency', 'Amount', 'AmountProfit', 'Time'];
  v_cols jsonb;
  v_n int;
  v_rows jsonb;
begin
  if p is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  if jsonb_typeof(p) = 'object' then
    v_cols := p->'columns';
    if jsonb_typeof(v_cols) <> 'array' or jsonb_typeof(p->'rows') <> 'array' then
      raise exception 'invalid_payload' using errcode = '22023';
    end if;
    v_n := jsonb_array_length(v_cols);
    if v_n = 0 or v_n > 100 then
      raise exception 'invalid_columns' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_cols) c where jsonb_typeof(c) <> 'string') then
      raise exception 'invalid_columns' using errcode = '22023';
    end if;
    if (select count(distinct c) from jsonb_array_elements_text(v_cols) c) <> v_n then
      raise exception 'duplicate_columns' using errcode = '22023';
    end if;
    if not (select array_agg(c) from jsonb_array_elements_text(v_cols) c) @> v_required then
      raise exception 'missing_columns' using errcode = '22023';
    end if;
    if jsonb_array_length(p->'rows') > 50000 then
      raise exception 'too_many_rows' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(
             case when jsonb_typeof(r.val) = 'array' and jsonb_array_length(r.val) = v_n then
               (select jsonb_object_agg(c.name, r.val->(c.ord::int - 1))
                from jsonb_array_elements_text(v_cols) with ordinality c(name, ord))
             else jsonb_build_object('__invalid_row', true, '__raw', r.val) end
             order by r.ord), '[]'::jsonb)
      into v_rows
      from jsonb_array_elements(p->'rows') with ordinality r(val, ord);
  elsif jsonb_typeof(p) = 'array' then
    v_rows := p;
    if jsonb_array_length(v_rows) > 0
       and (jsonb_typeof(v_rows->0) <> 'object' or not ((v_rows->0) ?& v_required)) then
      raise exception 'missing_columns' using errcode = '22023';
    end if;
    if jsonb_array_length(v_rows) > 50000 then
      raise exception 'too_many_rows' using errcode = '22023';
    end if;
  else
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  if jsonb_array_length(v_rows) = 0 then
    raise exception 'empty_file' using errcode = '22023';
  end if;
  return v_rows;
end $$;

-- Analisa as linhas e deixa o resultado em pg_temp.dds_finance_tmp (descartada no fim da transação).
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
          when 'performance_fee' then t.amount
          else 0 end,
        capital_flow = case t.classification
          when 'deposit' then t.amount
          when 'withdrawal' then -abs(t.amount)
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
      'fee_result', coalesce(sum(op_result) filter (where status = 'new' and currency = v_cur and classification = 'performance_fee'), 0),
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

revoke all on function public.dds_finance__norm(text) from public, anon, authenticated;
revoke all on function public.dds_finance__prepare_rows(jsonb) from public, anon, authenticated;
revoke all on function public.dds_finance__analyze(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.dds_finance__summary(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Parte B — prévia, importação e falhas
-- ---------------------------------------------------------------------------
-- Prévia: valida e compara com o banco, sem gravar nada.
create or replace function public.dds_finance_analyze_import(p_token text, p_rows jsonb, p_file_hash text default null, p_source text default 'trading_csv')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v jsonb;
begin
  perform public.dds_finance__ensure_settings(v_uid);
  perform public.dds_finance__analyze(v_uid, coalesce(p_source, 'trading_csv'), p_rows);
  v := public.dds_finance__summary(v_uid);
  if p_file_hash ~ '^[0-9a-f]{64}$' then
    v := v || jsonb_build_object('already_imported_file', (
      select jsonb_build_object('import_job_id', j.id, 'created_at', j.created_at, 'original_filename', j.original_filename)
      from public.dds_finance_import_jobs j
      where j.user_id = v_uid and j.file_hash = p_file_hash and j.status in ('completed', 'completed_with_issues')
      order by j.created_at desc limit 1));
  end if;
  return v;
end $$;

-- Importação: tudo em uma transação. Só IDs novos são gravados; existentes são ignorados;
-- divergências ficam registradas e nunca sobrescrevem o que está no banco.
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
           t.payload, t.fingerprint, 1, v_job
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

-- Quando a importação falha antes de gravar (arquivo ilegível, erro de rede, etc.).
create or replace function public.dds_finance_log_failed_import(p_token text, p_filename text, p_file_hash text, p_total_rows int, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v_id uuid;
begin
  insert into public.dds_finance_import_jobs (user_id, original_filename, file_hash, status, total_rows, error_summary, completed_at)
    values (v_uid, left(coalesce(nullif(p_filename, ''), 'arquivo'), 255),
            coalesce(case when p_file_hash ~ '^[0-9a-f]{64}$' then p_file_hash end, repeat('0', 64)),
            'failed', greatest(coalesce(p_total_rows, 0), 0),
            jsonb_build_array(jsonb_build_object('code', 'import_failed', 'message', left(coalesce(p_message, ''), 500))),
            now())
    returning id into v_id;
  perform public.dds_finance__audit(v_uid, 'import_failed', jsonb_build_object('import_job_id', v_id, 'filename', left(p_filename, 255)));
  return v_id;
end $$;

revoke all on function public.dds_finance_analyze_import(text, jsonb, text, text) from public;
grant execute on function public.dds_finance_analyze_import(text, jsonb, text, text) to anon, authenticated;
revoke all on function public.dds_finance_commit_import(text, jsonb, text, text, text) from public;
grant execute on function public.dds_finance_commit_import(text, jsonb, text, text, text) to anon, authenticated;
revoke all on function public.dds_finance_log_failed_import(text, text, text, int, text) from public;
grant execute on function public.dds_finance_log_failed_import(text, text, text, int, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Parte C — consultas do app
-- ---------------------------------------------------------------------------
-- Série diária (moeda de referência, fuso do usuário). Base de todos os indicadores e gráficos.
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
         coalesce(sum(t.op_result) filter (where t.classification = 'performance_fee'), 0),
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

create or replace function public.dds_finance_overview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with u as (select public.dds_finance__require(p_token) as uid),
  s as (select coalesce(st.currency, 'USD') as cur, coalesce(st.timezone, 'America/Sao_Paulo') as tz
        from u left join public.dds_finance_settings st on st.user_id = u.uid)
  select jsonb_build_object(
    'transactions_total', (select count(*) from public.dds_finance_transactions t, u where t.user_id = u.uid),
    'unclassified_total', (select count(*) from public.dds_finance_transactions t, u
                           where t.user_id = u.uid and t.classification = 'unclassified'),
    'other_currency_total', (select count(*) from public.dds_finance_transactions t, u, s
                             where t.user_id = u.uid and t.currency <> s.cur),
    'first_transaction_at', (select min(transaction_time) from public.dds_finance_transactions t, u where t.user_id = u.uid),
    'last_transaction_at', (select max(transaction_time) from public.dds_finance_transactions t, u where t.user_id = u.uid),
    'open_conflicts', (select count(*) from public.dds_finance_import_conflicts c, u
                       where c.user_id = u.uid and c.resolved_at is null),
    'today', (select (now() at time zone s.tz)::date from s),
    'last_import', (select to_jsonb(j) - 'error_summary' - 'user_id' from public.dds_finance_import_jobs j, u
                    where j.user_id = u.uid and j.status <> 'processing'
                    order by j.created_at desc limit 1))
  from u
$$;

-- Filtro comum das movimentações.
create or replace function public.dds_finance__filtered_tx(p_uid uuid, p_tz text, p_filters jsonb)
returns setof public.dds_finance_transactions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_class text := nullif(p_filters->>'classification', '');
  v_q text := nullif(btrim(coalesce(p_filters->>'q', '')), '');
  v_from date;
  v_to date;
  v_like text;
begin
  if v_class is not null and v_class not in ('trade', 'performance_fee', 'deposit', 'withdrawal', 'unclassified', 'capital') then
    raise exception 'invalid_filter' using errcode = '22023';
  end if;
  begin
    v_from := nullif(p_filters->>'date_from', '')::date;
    v_to := nullif(p_filters->>'date_to', '')::date;
  exception when others then
    raise exception 'invalid_filter' using errcode = '22023';
  end;
  if v_q is not null then
    v_q := left(v_q, 60);
    v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  end if;
  return query
    select t.*
    from public.dds_finance_transactions t
    where t.user_id = p_uid
      and (v_class is null
           or (v_class = 'capital' and t.classification in ('deposit', 'withdrawal'))
           or t.classification = v_class)
      and (v_q is null or t.external_transaction_id like v_like || '%' or t.reason ilike '%' || v_like || '%')
      and (v_from is null or (t.transaction_time at time zone p_tz)::date >= v_from)
      and (v_to is null or (t.transaction_time at time zone p_tz)::date <= v_to);
end $$;

create or replace function public.dds_finance_list_transactions(p_token text, p_filters jsonb default '{}'::jsonb, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v_tz text;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total int;
  v_rows jsonb;
  v_days jsonb;
begin
  select s.timezone into v_tz from public.dds_finance_settings s where s.user_id = v_uid;
  v_tz := coalesce(v_tz, 'America/Sao_Paulo');

  select count(*) into v_total from public.dds_finance__filtered_tx(v_uid, v_tz, coalesce(p_filters, '{}'::jsonb));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'external_transaction_id', t.external_transaction_id, 'reason', t.reason,
           'classification', t.classification, 'currency', t.currency, 'amount', t.amount,
           'amount_profit', t.amount_profit, 'op_result', t.op_result, 'capital_flow', t.capital_flow,
           'transaction_time', t.transaction_time, 'time_raw', t.time_raw,
           'local_date', (t.transaction_time at time zone v_tz)::date)
           order by t.transaction_time desc, t.external_transaction_id desc), '[]'::jsonb)
    into v_rows
    from (select * from public.dds_finance__filtered_tx(v_uid, v_tz, coalesce(p_filters, '{}'::jsonb)) x
          order by x.transaction_time desc, x.external_transaction_id desc
          limit v_limit offset v_offset) t;

  select coalesce(jsonb_object_agg(d.local_date, jsonb_build_object(
           'op_result', d.op_result, 'capital_flow', d.capital_flow, 'count', d.n)), '{}'::jsonb)
    into v_days
    from (select (x.transaction_time at time zone v_tz)::date as local_date,
                 sum(x.op_result) as op_result, sum(x.capital_flow) as capital_flow, count(*) as n
          from public.dds_finance__filtered_tx(v_uid, v_tz, coalesce(p_filters, '{}'::jsonb)) x
          where (x.transaction_time at time zone v_tz)::date in (
            select distinct (r->>'local_date')::date from jsonb_array_elements(v_rows) r)
          group by 1) d;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows, 'days', v_days);
end $$;

create or replace function public.dds_finance_get_transaction(p_token text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v jsonb;
begin
  select to_jsonb(t) - 'user_id' || jsonb_build_object(
           'import', (select jsonb_build_object('id', j.id, 'original_filename', j.original_filename, 'created_at', j.created_at)
                      from public.dds_finance_import_jobs j where j.id = t.source_import_id),
           'conflicts', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', c.id, 'kind', c.kind, 'created_at', c.created_at, 'resolved_at', c.resolved_at,
                            'incoming', c.incoming_payload) order by c.created_at desc), '[]'::jsonb)
                         from public.dds_finance_import_conflicts c
                         where c.user_id = v_uid and c.external_transaction_id = t.external_transaction_id))
    into v
    from public.dds_finance_transactions t
    where t.id = p_id and t.user_id = v_uid;
  if v is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v;
end $$;

create or replace function public.dds_finance_list_imports(p_token text, p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
begin
  return jsonb_build_object(
    'total', (select count(*) from public.dds_finance_import_jobs j where j.user_id = v_uid),
    'rows', (select coalesce(jsonb_agg(to_jsonb(j) - 'user_id' - 'error_summary'
                                       || jsonb_build_object('error_count', jsonb_array_length(j.error_summary))
                                       order by j.created_at desc), '[]'::jsonb)
             from (select * from public.dds_finance_import_jobs j
                   where j.user_id = v_uid
                   order by j.created_at desc
                   limit least(greatest(coalesce(p_limit, 30), 1), 100)
                   offset greatest(coalesce(p_offset, 0), 0)) j));
end $$;

create or replace function public.dds_finance_get_import(p_token text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v jsonb;
begin
  select to_jsonb(j) - 'user_id' || jsonb_build_object(
           'conflicts', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', c.id, 'external_transaction_id', c.external_transaction_id, 'kind', c.kind,
                            'file_row', c.file_row, 'existing', c.existing_payload, 'incoming', c.incoming_payload,
                            'resolved_at', c.resolved_at) order by c.file_row), '[]'::jsonb)
                         from public.dds_finance_import_conflicts c where c.import_job_id = j.id))
    into v
    from public.dds_finance_import_jobs j
    where j.id = p_id and j.user_id = v_uid;
  if v is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v;
end $$;

create or replace function public.dds_finance_resolve_conflict(p_token text, p_conflict_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
begin
  update public.dds_finance_import_conflicts set resolved_at = now()
    where id = p_conflict_id and user_id = v_uid and resolved_at is null;
  if found then
    perform public.dds_finance__audit(v_uid, 'conflict_reviewed', jsonb_build_object('conflict_id', p_conflict_id));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- LGPD: exportação completa dos próprios dados.
create or replace function public.dds_finance_export_my_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v jsonb;
begin
  v := jsonb_build_object(
    'exported_at', now(),
    'product', 'DDS Finance',
    'profile', public.dds_finance__profile_json(v_uid),
    'settings', public.dds_finance__settings_json(v_uid),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.transaction_time, t.external_transaction_id), '[]'::jsonb)
                     from public.dds_finance_transactions t where t.user_id = v_uid),
    'import_jobs', (select coalesce(jsonb_agg(to_jsonb(j) - 'user_id' order by j.created_at), '[]'::jsonb)
                    from public.dds_finance_import_jobs j where j.user_id = v_uid),
    'import_conflicts', (select coalesce(jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at), '[]'::jsonb)
                         from public.dds_finance_import_conflicts c where c.user_id = v_uid),
    'audit_log', (select coalesce(jsonb_agg(to_jsonb(a) - 'user_id' order by a.created_at), '[]'::jsonb)
                  from public.dds_finance_audit_log a where a.user_id = v_uid));
  perform public.dds_finance__audit(v_uid, 'data_exported', '{}'::jsonb);
  return v;
end $$;

revoke all on function public.dds_finance__filtered_tx(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.dds_finance_daily_series(text) from public;
grant execute on function public.dds_finance_daily_series(text) to anon, authenticated;
revoke all on function public.dds_finance_overview(text) from public;
grant execute on function public.dds_finance_overview(text) to anon, authenticated;
revoke all on function public.dds_finance_list_transactions(text, jsonb, int, int) from public;
grant execute on function public.dds_finance_list_transactions(text, jsonb, int, int) to anon, authenticated;
revoke all on function public.dds_finance_get_transaction(text, uuid) from public;
grant execute on function public.dds_finance_get_transaction(text, uuid) to anon, authenticated;
revoke all on function public.dds_finance_list_imports(text, int, int) from public;
grant execute on function public.dds_finance_list_imports(text, int, int) to anon, authenticated;
revoke all on function public.dds_finance_get_import(text, uuid) from public;
grant execute on function public.dds_finance_get_import(text, uuid) to anon, authenticated;
revoke all on function public.dds_finance_resolve_conflict(text, uuid) from public;
grant execute on function public.dds_finance_resolve_conflict(text, uuid) to anon, authenticated;
revoke all on function public.dds_finance_export_my_data(text) from public;
grant execute on function public.dds_finance_export_my_data(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Parte D — exclusões (LGPD) e limpeza diária
-- ---------------------------------------------------------------------------
-- Apagar os próprios dados financeiros (o acesso continua).
create or replace function public.dds_finance_delete_my_financial_data(p_token text, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v_tx int;
  v_jobs int;
begin
  if p_confirm is distinct from 'EXCLUIR' then
    raise exception 'confirmation_required' using errcode = '22023';
  end if;
  delete from public.dds_finance_transactions where user_id = v_uid;
  get diagnostics v_tx = row_count;
  delete from public.dds_finance_import_jobs where user_id = v_uid;
  get diagnostics v_jobs = row_count;
  perform public.dds_finance__audit(v_uid, 'financial_data_deleted',
    jsonb_build_object('transactions', v_tx, 'import_jobs', v_jobs));
  return jsonb_build_object('transactions_deleted', v_tx, 'import_jobs_deleted', v_jobs);
end $$;

-- Excluir a conta inteira (exige o PIN). Tudo do usuário é apagado em cascata.
create or replace function public.dds_finance_delete_account(p_token text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v_prof public.dds_finance_profiles;
  v_key text := 'chg:' || v_uid::text;
  v_fail jsonb;
begin
  select * into v_prof from public.dds_finance_profiles where id = v_uid;
  if public.dds_finance__guard_locked_until(v_key) is not null then
    return jsonb_build_object('ok', false, 'code', 'locked');
  end if;
  if not public.dds_finance__check_pin(v_uid, p_pin) then
    v_fail := public.dds_finance__guard_fail(v_key, 'progressive');
    return jsonb_build_object('ok', false,
      'code', case when v_fail->>'locked_until' is not null then 'locked' else 'wrong_pin' end,
      'attempts_left', v_fail->'attempts_left');
  end if;
  if v_prof.is_admin and (select count(*) from public.dds_finance_profiles where is_admin and is_active) <= 1 then
    return jsonb_build_object('ok', false, 'code', 'last_admin');
  end if;
  perform public.dds_finance__audit(null, 'account_deleted', jsonb_build_object('phone', public.dds_finance__mask_phone(v_prof.phone_normalized)));
  delete from public.dds_finance_profiles where id = v_uid;
  perform public.dds_finance__guard_reset(v_key);
  perform public.dds_finance__guard_reset('phone:' || v_prof.phone_normalized);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dds_finance__cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dds_finance_login_guard
    where updated_at < now() - interval '7 days'
      and (locked_until is null or locked_until < now());
  delete from public.dds_finance_sessions
    where expires_at < now() - interval '1 day'
       or revoked_at < now() - interval '30 days';
  delete from public.dds_finance_rate_fetch_log
    where checked_at < now() - interval '90 days';
end $$;

revoke all on function public.dds_finance_delete_my_financial_data(text, text) from public;
grant execute on function public.dds_finance_delete_my_financial_data(text, text) to anon, authenticated;
revoke all on function public.dds_finance_delete_account(text, text) from public;
grant execute on function public.dds_finance_delete_account(text, text) to anon, authenticated;
revoke all on function public.dds_finance__cleanup() from public, anon, authenticated;

select cron.schedule('dds_finance_cleanup', '23 6 * * *', 'select public.dds_finance__cleanup()');
