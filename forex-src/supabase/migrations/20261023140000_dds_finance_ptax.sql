-- DDS Finance — cotação PTAX (Banco Central do Brasil).
-- Fonte: API Olinda do BCB, serviço CotacaoDolarPeriodo (PTAX de fechamento, compra e venda).
-- Quem busca: a Edge Function forex-ptax (chave de serviço). O app só lê o que está no banco.
-- Cache: a função não consulta o BCB se a última consulta tiver menos de 10 minutos.
-- Duplicidade: única por (base, cotada, data, fonte, tipo); correção do BCB atualiza o valor.

create or replace function public.dds_finance_ptax_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'last_check', (select to_jsonb(l) from (
                     select checked_at, status, latest_rate_date, message
                     from public.dds_finance_rate_fetch_log order by checked_at desc limit 1) l),
    'latest_rate_date', (select max(rate_date) from public.dds_finance_exchange_rates
                         where base_currency = 'USD' and quote_currency = 'BRL' and rate_type = 'ptax_venda_fechamento'))
$$;

create or replace function public.dds_finance_store_ptax(p_rates jsonb, p_status text, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted int := 0;
  v_updated int := 0;
  v_latest date;
  v_n int := 0;
begin
  if p_status not in ('ok', 'error') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if p_status = 'ok' then
    if jsonb_typeof(p_rates) <> 'array' then
      raise exception 'invalid_payload' using errcode = '22023';
    end if;
    v_n := jsonb_array_length(p_rates);
    with src as (
      select (r->>'date')::date as d,
             (r->>'venda')::numeric as venda,
             (r->>'compra')::numeric as compra,
             ((r->>'quoted_at')::timestamp at time zone 'America/Sao_Paulo') as q
      from jsonb_array_elements(p_rates) r
      where (r->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and (r->>'venda') ~ '^[0-9]+(\.[0-9]+)?$' and (r->>'compra') ~ '^[0-9]+(\.[0-9]+)?$'
        and (r->>'quoted_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}'
    ), rws as (
      select d, 'ptax_venda_fechamento' as t, venda as rate, q from src where venda between 0.5 and 50
      union all
      select d, 'ptax_compra_fechamento', compra, q from src where compra between 0.5 and 50
    ), up as (
      insert into public.dds_finance_exchange_rates as x
        (base_currency, quote_currency, rate, rate_date, source, rate_type, quoted_at, fetched_at)
      select 'USD', 'BRL', rate, d, 'BCB PTAX', t, q, now() from rws
      on conflict on constraint dds_finance_exchange_rates_unique do update
        set rate = excluded.rate, quoted_at = excluded.quoted_at, fetched_at = now()
        where x.rate is distinct from excluded.rate
      returning (xmax = 0) as is_insert
    )
    select count(*) filter (where is_insert), count(*) filter (where not is_insert)
      into v_inserted, v_updated from up;
  end if;
  select max(rate_date) into v_latest from public.dds_finance_exchange_rates
    where base_currency = 'USD' and quote_currency = 'BRL' and rate_type = 'ptax_venda_fechamento';
  insert into public.dds_finance_rate_fetch_log (status, latest_rate_date, rows_received, message)
    values (p_status, v_latest, v_n, left(p_message, 500));
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'latest_rate_date', v_latest);
end $$;

-- Leitura para o app: última PTAX, histórico e situação da última consulta.
create or replace function public.dds_finance_fx(p_token text, p_since date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v_since date;
begin
  v_since := coalesce(p_since,
    (select (min(t.transaction_time) at time zone 'America/Sao_Paulo')::date
     from public.dds_finance_transactions t where t.user_id = v_uid),
    (now() at time zone 'America/Sao_Paulo')::date - 30) - 10;
  return jsonb_build_object(
    'latest', (select to_jsonb(r) from (
                 select rate, rate_date, source, rate_type, quoted_at, fetched_at
                 from public.dds_finance_exchange_rates
                 where base_currency = 'USD' and quote_currency = 'BRL' and rate_type = 'ptax_venda_fechamento'
                 order by rate_date desc limit 1) r),
    'latest_buy', (select to_jsonb(r) from (
                 select rate, rate_date, source, rate_type, quoted_at, fetched_at
                 from public.dds_finance_exchange_rates
                 where base_currency = 'USD' and quote_currency = 'BRL' and rate_type = 'ptax_compra_fechamento'
                 order by rate_date desc limit 1) r),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('date', rate_date, 'rate', rate) order by rate_date), '[]'::jsonb)
                from public.dds_finance_exchange_rates
                where base_currency = 'USD' and quote_currency = 'BRL' and rate_type = 'ptax_venda_fechamento'
                  and rate_date >= v_since),
    'last_check', (select to_jsonb(l) from (
                     select checked_at, status, latest_rate_date, message
                     from public.dds_finance_rate_fetch_log order by checked_at desc limit 1) l),
    'last_ok_check_at', (select max(checked_at) from public.dds_finance_rate_fetch_log where status = 'ok'),
    'server_now', now(),
    'today', (now() at time zone 'America/Sao_Paulo')::date);
end $$;

revoke all on function public.dds_finance_ptax_status() from public, anon, authenticated;
grant execute on function public.dds_finance_ptax_status() to service_role;
revoke all on function public.dds_finance_store_ptax(jsonb, text, text) from public, anon, authenticated;
grant execute on function public.dds_finance_store_ptax(jsonb, text, text) to service_role;
revoke all on function public.dds_finance_fx(text, date) from public;
grant execute on function public.dds_finance_fx(text, date) to anon, authenticated;

-- Agenda (UTC): dias úteis 13h25–17h55 de Brasília a cada 30 min (a PTAX sai por volta das 13h)
-- e uma vez por dia às 08h10 de Brasília para recuperar falhas.
select cron.schedule('dds_finance_ptax_intraday', '25,55 16-20 * * 1-5', $cron$
  select net.http_post(
    url := 'https://arffptuclrrzuzdrcmuc.supabase.co/functions/v1/forex-ptax',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_XCY3BoeUR_jzDSRrtlibyg_Os7lIrVi"}'::jsonb,
    body := '{"source": "cron"}'::jsonb,
    timeout_milliseconds := 20000)
$cron$);
select cron.schedule('dds_finance_ptax_daily', '10 11 * * *', $cron$
  select net.http_post(
    url := 'https://arffptuclrrzuzdrcmuc.supabase.co/functions/v1/forex-ptax',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_XCY3BoeUR_jzDSRrtlibyg_Os7lIrVi"}'::jsonb,
    body := '{"source": "cron"}'::jsonb,
    timeout_milliseconds := 20000)
$cron$);
