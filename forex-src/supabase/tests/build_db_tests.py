#!/usr/bin/env python3
"""Gera o teste de banco do DDS Finance (testes A–O do briefing).

Uso: python3 build_db_tests.py caminho/transactions.csv > .local/db_tests.sql

O SQL gerado roda tudo dentro de um único bloco DO, chamando as funções como o papel `anon`
(o mesmo da API pública), e termina com RAISE EXCEPTION contendo o resultado em JSON.
A exceção desfaz a transação inteira: nada do teste fica gravado no banco compartilhado.

Usa uma amostra do CSV real (as linhas que não são TradeResults + algumas operações).
O arquivo gerado contém dados reais e por isso fica fora do Git (.local/).
"""
import csv
import json
import sys


def main(path: str) -> None:
    rows = list(csv.reader(open(path, encoding="utf-8-sig")))
    cols, data = rows[0], rows[1:]
    ix = {c: i for i, c in enumerate(cols)}
    special = [r for r in data if r[ix["Reason"]] != "TradeResults"]
    trades = [r for r in data if r[ix["Reason"]] == "TradeResults"]
    sample = trades[:20] + special + trades[-10:]
    sample.sort(key=lambda r: (r[ix["Time"]], int(r[ix["Id"]])))

    def num(x: str) -> float:
        return float(x) if x else 0.0

    ref = {
        "rows": len(sample),
        "op": round(sum(num(r[ix["AmountProfit"]]) for r in sample if r[ix["Reason"]] == "TradeResults")
                    + sum(num(r[ix["Amount"]]) for r in sample if r[ix["Reason"]] == "PerformanceFee"), 2),
        "deposits": round(sum(num(r[ix["Amount"]]) for r in sample if r[ix["Reason"]] == "Deposit"), 2),
        "withdrawals": round(-sum(num(r[ix["Amount"]]) for r in sample if r[ix["Reason"]] == "Withdrawal"), 2),
        "fees": round(sum(num(r[ix["Amount"]]) for r in sample if r[ix["Reason"]] == "PerformanceFee"), 2),
        "fees_if_amountprofit": round(sum(num(r[ix["AmountProfit"]]) for r in sample if r[ix["Reason"]] == "PerformanceFee"), 2),
    }

    base = trades[-1]
    extra = []
    for k, v in enumerate(["1.50", "-0.75", "2.25"]):
        r = list(base)
        r[ix["Id"]] = str(99000000 + k)
        r[ix["Time"]] = "2026-10-23T03:0%d:00" % k
        r[ix["Amount"]] = r[ix["AmountProfit"]] = v
        extra.append(r)

    changed = [list(x) for x in sample]
    target = next(i for i, r in enumerate(changed) if r[ix["Reason"]] == "TradeResults")
    changed[target][ix["Amount"]] = changed[target][ix["AmountProfit"]] = "999.99"
    changed_id = changed[target][ix["Id"]]

    def bad(r, col, val):
        r = list(r)
        r[ix[col]] = val
        return r

    invalid = [
        bad(trades[0], "Time", "31/02/2026 10:00"),
        bad(trades[1], "Id", ""),
        bad(trades[2], "Amount", "12,50"),
        trades[3][:-3],  # menos colunas
    ]
    unknown = bad(bad(trades[4], "Reason", "Bonus"), "Id", "99100000")
    dup_same = [trades[5], trades[5]]
    dup_conflict = [trades[6], bad(trades[6], "Amount", "5.55")]

    payload = {"columns": cols, "rows": sample}
    q = lambda o: json.dumps(o, ensure_ascii=False).replace("'", "''")

    sql = f"""
do $test$
declare
  v_payload jsonb := '{q(payload)}'::jsonb;
  v_cols jsonb := v_payload->'columns';
  v_extra jsonb := '{q(extra)}'::jsonb;
  v_changed jsonb := jsonb_build_object('columns', '{q(cols)}'::jsonb, 'rows', '{q(changed)}'::jsonb);
  v_invalid jsonb := '{q(invalid)}'::jsonb;
  v_unknown jsonb := '{q([unknown])}'::jsonb;
  v_dup_same jsonb := '{q(dup_same)}'::jsonb;
  v_dup_conflict jsonb := '{q(dup_conflict)}'::jsonb;
  v_ref jsonb := '{q(ref)}'::jsonb;
  r jsonb := '{{}}'::jsonb;
  a jsonb; b jsonb; x jsonb; s jsonb;
  pin_a text; pin_b text; tok_a text; tok_b text; new_pin text;
  t0 timestamptz;
  n int;
  v_err text;
  v_big jsonb;
  v_first_tx uuid;
begin
  -- perfis de teste (como dono do banco: criação é função interna)
  a := public.dds_finance__create_profile('Teste A', '(41) 90000-0001', true, null);
  b := public.dds_finance__create_profile('Teste B', '41 90000-0002', false, null);
  pin_a := a->>'temp_pin';
  pin_b := b->>'temp_pin';
  r := r || jsonb_build_object('phone_normalized', a->>'phone_normalized', 'temp_pin_format', pin_a ~ '^[0-9]{{4}}$');

  -- daqui em diante, tudo como a API pública
  execute 'set local role anon';

  begin
    perform public.dds_finance__check_pin((a->>'profile_id')::uuid, pin_a);
    r := r || '{{"anon_internal_fn_blocked": false}}';
  exception when insufficient_privilege then
    r := r || '{{"anon_internal_fn_blocked": true}}';
  end;
  begin
    perform count(*) from public.dds_finance_transactions;
    r := r || '{{"anon_table_blocked": false}}';
  exception when insufficient_privilege then
    r := r || '{{"anon_table_blocked": true}}';
  end;

  -- login e PIN
  x := public.dds_finance_login('(41) 90000-0001', lpad(((pin_a::int + 1) % 10000)::text, 4, '0'), true, 'teste');
  r := r || jsonb_build_object('login_wrong_pin', x);
  x := public.dds_finance_login('+55 41 90000-0001', pin_a, true, 'teste');
  tok_a := x->>'token';
  r := r || jsonb_build_object('login_ok', jsonb_build_object('ok', x->'ok', 'must_change_pin', x->'must_change_pin',
          'token_ok', tok_a ~ '^ddsf_[0-9a-f]{{64}}$', 'is_admin', x#>'{{profile,is_admin}}'));
  x := public.dds_finance_change_pin(tok_a, pin_a, '1234');
  r := r || jsonb_build_object('change_pin_weak', x->>'code');
  new_pin := case when pin_a = '7391' then '7392' else '7391' end;
  x := public.dds_finance_change_pin(tok_a, pin_a, new_pin);
  r := r || jsonb_build_object('change_pin_ok', x->'ok');
  x := public.dds_finance_login('41900000002', pin_b, false, 'teste');
  tok_b := x->>'token';
  r := r || jsonb_build_object('login_b_ok', x->'ok');

  -- Teste A: importação inicial
  t0 := clock_timestamp();
  x := public.dds_finance_commit_import(tok_a, v_payload, 'transactions.csv', repeat('a', 64));
  r := r || jsonb_build_object('A_initial', jsonb_build_object('total', x->'total_rows', 'inserted', x->'inserted_rows',
          'existing', x->'existing_rows', 'invalid', x->'invalid_rows', 'conflicts', x->'conflict_rows', 'status', x->'status',
          'ms', round(extract(epoch from clock_timestamp() - t0) * 1000)));

  -- Teste B: mesmo arquivo de novo (prévia e importação)
  x := public.dds_finance_analyze_import(tok_a, v_payload, repeat('a', 64));
  r := r || jsonb_build_object('B_preview', jsonb_build_object('new', x->'new_rows', 'existing', x->'existing_rows',
          'already_imported', (x->'already_imported_file') is not null and x->'already_imported_file' <> 'null'::jsonb));
  for n in 1..3 loop
    x := public.dds_finance_commit_import(tok_a, v_payload, 'transactions.csv', repeat('a', 64));
  end loop;
  r := r || jsonb_build_object('B_reimport_x3', jsonb_build_object('inserted', x->'inserted_rows', 'existing', x->'existing_rows'));

  -- Teste C: arquivo completo + 3 IDs novos
  x := public.dds_finance_commit_import(tok_a,
         jsonb_build_object('columns', v_cols, 'rows', (v_payload->'rows') || v_extra), 'transactions.csv', repeat('c', 64));
  r := r || jsonb_build_object('C_new_ids', jsonb_build_object('total', x->'total_rows', 'inserted', x->'inserted_rows',
          'existing', x->'existing_rows', 'impact_op', x#>'{{impact,op_result}}'));

  -- Teste D: Id existente com valor diferente
  x := public.dds_finance_commit_import(tok_a, v_changed, 'alterado.csv', repeat('d', 64));
  r := r || jsonb_build_object('D_conflict', jsonb_build_object('inserted', x->'inserted_rows', 'conflict_rows', x->'conflict_rows',
          'status', x->'status', 'kind', x#>'{{conflicts,0,kind}}'));

  -- Teste M/O: arquivo com linhas inválidas, duplicadas e Reason desconhecido
  x := public.dds_finance_analyze_import(tok_a,
         jsonb_build_object('columns', v_cols, 'rows', v_invalid || v_unknown || v_dup_same || v_dup_conflict));
  r := r || jsonb_build_object('O_mixed_preview', jsonb_build_object('total', x->'total_rows', 'invalid', x->'invalid_rows',
          'error_codes', (select jsonb_agg(e->>'code' order by (e->>'row')::int) from jsonb_array_elements(x->'errors') e),
          'duplicates', x->'duplicate_rows', 'conflicts', x->'conflict_rows', 'unclassified_new', x->'unclassified_new_rows',
          'new', x->'new_rows'));
  begin
    x := public.dds_finance_commit_import(tok_a, '{{"columns": ["Id", "Foo"], "rows": [["1", "x"]]}}'::jsonb, 'ruim.csv', repeat('e', 64));
    r := r || '{{"M_missing_columns_rejected": false}}';
  exception when others then
    get stacked diagnostics v_err = message_text;
    r := r || jsonb_build_object('M_missing_columns_rejected', v_err);
  end;

  -- Teste E: outro usuário com os mesmos IDs
  x := public.dds_finance_commit_import(tok_b, v_payload, 'transactions.csv', repeat('a', 64));
  r := r || jsonb_build_object('E_user_b_import', jsonb_build_object('inserted', x->'inserted_rows', 'existing', x->'existing_rows'));
  x := public.dds_finance_list_transactions(tok_a, '{{}}'::jsonb, 1, 0);
  v_first_tx := (x#>>'{{rows,0,id}}')::uuid;
  r := r || jsonb_build_object('E_counts', jsonb_build_object(
          'a_total', x->'total',
          'b_total', public.dds_finance_list_transactions(tok_b, '{{}}'::jsonb, 1, 0)->'total'));
  begin
    x := public.dds_finance_get_transaction(tok_b, v_first_tx);
    r := r || '{{"E_b_reads_a": "LEAK"}}';
  exception when others then
    get stacked diagnostics v_err = message_text;
    r := r || jsonb_build_object('E_b_reads_a', v_err);
  end;
  begin
    x := public.dds_finance_admin_list_users(tok_b);
    r := r || '{{"admin_forbidden_for_b": false}}';
  exception when others then
    get stacked diagnostics v_err = message_text;
    r := r || jsonb_build_object('admin_forbidden_for_b', v_err);
  end;
  begin
    x := public.dds_finance_overview('ddsf_' || repeat('0', 64));
    r := r || '{{"fake_token_rejected": false}}';
  exception when others then
    get stacked diagnostics v_err = message_text;
    r := r || jsonb_build_object('fake_token_rejected', v_err);
  end;

  -- Testes F, G, H e N: totais da série diária do usuário B (só a amostra) vs referência calculada no CSV
  select jsonb_build_object(
           'op', round(sum(d.op_result), 2), 'deposits', round(sum(d.deposits), 2),
           'withdrawals', round(sum(d.withdrawals), 2), 'fees', round(sum(d.fee_result), 2),
           'trades', round(sum(d.trade_result), 2), 'days', count(*))
    into s
    from public.dds_finance_daily_series(tok_b) d;
  r := r || jsonb_build_object('FGHN_series_b', s, 'reference', v_ref);

  -- Unclassified fica fora dos cálculos (usuário A recebeu Bonus? não: só na prévia). Importa e confere.
  x := public.dds_finance_commit_import(tok_b, jsonb_build_object('columns', v_cols, 'rows', v_unknown), 'bonus.csv', repeat('f', 64));
  select jsonb_build_object('op_after_bonus', round(sum(d.op_result), 2)) into s from public.dds_finance_daily_series(tok_b) d;
  r := r || jsonb_build_object('unclassified_import', jsonb_build_object('status', x->'status', 'inserted', x->'inserted_rows')) || s;

  -- Bloqueio progressivo: 5 erros seguidos
  for n in 1..5 loop
    x := public.dds_finance_login('41900000002', lpad(((pin_b::int + 1) % 10000)::text, 4, '0'), true, 'teste');
  end loop;
  r := r || jsonb_build_object('lockout_after_5', x->>'code');
  x := public.dds_finance_login('41900000002', pin_b, true, 'teste');
  r := r || jsonb_build_object('locked_even_with_right_pin', x->>'code');

  -- Logout invalida o token
  x := public.dds_finance_logout(tok_a, false);
  begin
    x := public.dds_finance_me(tok_a);
    r := r || '{{"token_after_logout": "still valid"}}';
  exception when others then
    get stacked diagnostics v_err = message_text;
    r := r || jsonb_build_object('token_after_logout', v_err);
  end;

  execute 'reset role';

  -- Conferências diretas (como dono do banco)
  r := r || jsonb_build_object('D_value_not_overwritten', (
          select amount from public.dds_finance_transactions t
          join public.dds_finance_profiles p on p.id = t.user_id
          where p.phone_normalized = '5541900000001' and t.external_transaction_id = '{changed_id}'));
  r := r || jsonb_build_object('stored_pin_is_bcrypt', (
          select c.pin_hash like '$2a$%' from public.dds_finance_credentials c where c.profile_id = (a->>'profile_id')::uuid));
  r := r || jsonb_build_object('token_stored_hashed', (
          select count(*) from public.dds_finance_sessions s where s.token_hash like 'ddsf_%'));

  -- Desempenho: 2.000 e 10.000 linhas sintéticas
  execute 'set local role anon';
  x := public.dds_finance_login('+5541900000001', new_pin, true, 'teste');
  tok_a := x->>'token';
  v_big := jsonb_build_object('columns', '["Id","Reason","Currency","Amount","AmountProfit","Time"]'::jsonb,
            'rows', (select jsonb_agg(jsonb_build_array((70000000 + g)::text, 'TradeResults', 'USD', '1.25', '1.25',
                     to_char(timestamp '2026-01-01' + g * interval '7 minutes', 'YYYY-MM-DD"T"HH24:MI:SS')))
                     from generate_series(1, 2000) g));
  t0 := clock_timestamp();
  x := public.dds_finance_analyze_import(tok_a, v_big);
  r := r || jsonb_build_object('perf_preview_2000_ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp();
  x := public.dds_finance_commit_import(tok_a, v_big, 'grande.csv', repeat('9', 64));
  r := r || jsonb_build_object('perf_commit_2000_ms', round(extract(epoch from clock_timestamp() - t0) * 1000), 'perf_inserted', x->'inserted_rows');
  v_big := jsonb_build_object('columns', '["Id","Reason","Currency","Amount","AmountProfit","Time"]'::jsonb,
            'rows', (select jsonb_agg(jsonb_build_array((80000000 + g)::text, 'TradeResults', 'USD', '1.25', '1.25',
                     to_char(timestamp '2025-01-01' + g * interval '7 minutes', 'YYYY-MM-DD"T"HH24:MI:SS')))
                     from generate_series(1, 10000) g));
  t0 := clock_timestamp();
  x := public.dds_finance_analyze_import(tok_a, v_big);
  r := r || jsonb_build_object('perf_preview_10000_ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp();
  perform count(*) from public.dds_finance_daily_series(tok_a);
  r := r || jsonb_build_object('perf_series_ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
  execute 'reset role';

  raise exception 'DDS_TEST_RESULT %', r::text;
end
$test$;
"""
    sys.stdout.write(sql)


if __name__ == "__main__":
    main(sys.argv[1])
