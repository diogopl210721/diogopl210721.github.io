// Backend simulado para os testes de tela: responde às mesmas funções RPC do Supabase.
// Usa o CSV real se DDS_CSV estiver definido; senão, dados sintéticos.
import { existsSync, readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";

type Row = Record<string, string>;

function loadRows(): Row[] {
  const p = process.env.DDS_CSV;
  if (p && existsSync(p)) {
    const lines = readFileSync(p, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
    const cols = lines[0].split(",");
    return lines.slice(1).map((l) => {
      const vals: string[] = [];
      let cur = "", q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === "," && !q) { vals.push(cur); cur = ""; }
        else cur += ch;
      }
      vals.push(cur);
      return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""]));
    });
  }
  const out: Row[] = [{ Id: "1", Reason: "Deposit", Currency: "USD", Amount: "1000", AmountProfit: "0", Time: "2026-09-01T10:00:00" }];
  for (let i = 0; i < 40; i++) {
    const day = new Date(Date.UTC(2026, 8, 2 + i)).toISOString().slice(0, 10);
    const v = (((i * 37) % 23) - 6) / 2;
    out.push({ Id: String(100 + i), Reason: "TradeResults", Currency: "USD", Amount: String(v), AmountProfit: String(v), Time: `${day}T14:00:00` });
  }
  return out;
}

export function buildMock() {
  const rows = loadRows();
  const tx = rows.map((r, i) => {
    const cls = r.Reason === "TradeResults" ? "trade" : r.Reason === "PerformanceFee" ? "performance_fee" : r.Reason === "Deposit" ? "deposit" : r.Reason === "Withdrawal" ? "withdrawal" : "unclassified";
    const amount = Number(r.Amount), profit = Number(r.AmountProfit);
    return {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      external_transaction_id: r.Id, reason: r.Reason, classification: cls, currency: r.Currency,
      amount, amount_profit: profit,
      op_result: cls === "trade" ? profit : cls === "performance_fee" ? amount : 0,
      capital_flow: cls === "deposit" ? amount : cls === "withdrawal" ? -Math.abs(amount) : 0,
      transaction_time: `${r.Time}-03:00`, time_raw: r.Time, local_date: r.Time.slice(0, 10), original_payload: r,
    };
  }).sort((a, b) => (a.time_raw < b.time_raw ? 1 : -1));
  const days = new Map<string, Record<string, number | string>>();
  for (const t of tx) {
    const d = days.get(t.local_date) ?? { day: t.local_date, op_result: 0, trade_result: 0, fee_result: 0, deposits: 0, withdrawals: 0, tx_count: 0, trade_count: 0, positive_trades: 0, negative_trades: 0 };
    (d.op_result as number) += t.op_result;
    if (t.classification === "trade") { (d.trade_result as number) += t.op_result; (d.trade_count as number)++; if (t.op_result > 0) (d.positive_trades as number)++; if (t.op_result < 0) (d.negative_trades as number)++; }
    if (t.classification === "performance_fee") (d.fee_result as number) += t.op_result;
    if (t.classification === "deposit") (d.deposits as number) += t.capital_flow;
    if (t.classification === "withdrawal") (d.withdrawals as number) -= t.capital_flow;
    (d.tx_count as number)++;
    days.set(t.local_date, d);
  }
  const series = [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  const history: Array<{ date: string; rate: number }> = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(Date.UTC(2026, 6, 26 + i));
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    history.push({ date: d.toISOString().slice(0, 10), rate: Math.round((5.0377 + Math.sin(i / 7) * 0.12) * 10000) / 10000 });
  }
  history[history.length - 1] = { date: "2026-10-23", rate: 5.0377 };
  const lastImport = {
    id: "11111111-1111-4111-8111-111111111111", source: "trading_csv", original_filename: "transactions.csv", file_hash: "a".repeat(64),
    status: "completed", total_rows: tx.length, inserted_rows: tx.length, existing_rows: 0, duplicate_rows: 0, rejected_rows: 0,
    conflict_rows: 0, unclassified_rows: 0, period_start: null, period_end: null, currencies: ["USD"], inserted_op_result: null,
    inserted_deposits: null, inserted_withdrawals: null, created_at: "2026-10-23T12:14:00Z", completed_at: "2026-10-23T12:14:01Z",
  };
  const token = "ddsf_" + "ab".repeat(32);
  const profile = { id: "p1", display_name: "Diogo Soares", phone: "5541991542931", is_admin: true, must_change_pin: false, last_login_at: null, created_at: "2026-10-23T12:00:00Z" };
  const settings = { opening_balance: 0, capital_base: null, currency: "USD", timezone: "America/Sao_Paulo", source_timezone: "America/Sao_Paulo", return_method: "twr" };
  const report = {
    total_rows: tx.length, new_rows: 0, existing_rows: tx.length, duplicate_rows: 0, invalid_rows: 0, conflict_rows: 0, conflict_ids: 0,
    unclassified_new_rows: 0, other_currency_new_rows: 0, trade_amount_mismatch_rows: 0, period_start: "2026-08-03T21:31:20Z",
    period_end: "2026-10-23T05:09:35Z", new_period_start: null, new_period_end: null, reference_currency: "USD",
    impact: { op_result: 0, trade_result: 0, fee_result: 0, deposits: 0, withdrawals: 0 }, currencies: ["USD"],
    reasons: { TradeResults: tx.filter((t) => t.reason === "TradeResults").length }, sample: [], errors: [], duplicates: [], conflicts: [], unclassified: [],
    already_imported_file: { import_job_id: lastImport.id, created_at: lastImport.created_at, original_filename: "transactions.csv" },
  };

  const handlers: Record<string, (body: Record<string, unknown>) => unknown> = {
    dds_finance_login: (b) => (b.p_pin === "2580"
      ? { ok: true, token, expires_at: "2026-11-22T12:00:00Z", must_change_pin: false, profile }
      : { ok: false, code: "invalid_credentials", attempts_left: 4, locked_until: null }),
    dds_finance_me: () => ({ profile, settings, session: { expires_at: "2026-11-22T12:00:00Z" }, active_sessions: 1 }),
    dds_finance_daily_series: () => series,
    dds_finance_overview: () => ({ transactions_total: tx.length, unclassified_total: 0, other_currency_total: 0, first_transaction_at: null,
      last_transaction_at: null, open_conflicts: 0, today: "2026-10-23", last_import: lastImport }),
    dds_finance_fx: () => ({
      latest: { rate: 5.0377, rate_date: "2026-10-23", source: "BCB PTAX", rate_type: "ptax_venda_fechamento", quoted_at: "2026-10-23T16:07:14Z", fetched_at: "2026-10-23T16:20:00Z" },
      latest_buy: { rate: 5.0371, rate_date: "2026-10-23", source: "BCB PTAX", rate_type: "ptax_compra_fechamento", quoted_at: "2026-10-23T16:07:14Z", fetched_at: "2026-10-23T16:20:00Z" },
      history, last_check: { checked_at: new Date().toISOString(), status: "ok", latest_rate_date: "2026-10-23", message: null },
      last_ok_check_at: new Date().toISOString(), server_now: new Date().toISOString(), today: "2026-10-23",
    }),
    dds_finance_list_transactions: (b) => {
      const lim = Number(b.p_limit ?? 50), off = Number(b.p_offset ?? 0);
      const page = tx.slice(off, off + lim);
      const dayMap: Record<string, unknown> = {};
      for (const r of page) { const d = days.get(r.local_date)!; dayMap[r.local_date] = { op_result: d.op_result, capital_flow: 0, count: d.tx_count }; }
      return { total: tx.length, limit: lim, offset: off, rows: page, days: dayMap };
    },
    dds_finance_get_transaction: (b) => ({ ...tx.find((t) => t.id === b.p_id)!, fingerprint: "f".repeat(64), rule_version: 1, source: "trading_csv",
      investment_id: "2126", manager_name: "x", source_import_id: lastImport.id, created_at: lastImport.created_at,
      import: { id: lastImport.id, original_filename: "transactions.csv", created_at: lastImport.created_at }, conflicts: [] }),
    dds_finance_list_imports: () => ({ total: 1, rows: [lastImport] }),
    dds_finance_get_import: () => ({ ...lastImport, error_summary: [], conflicts: [] }),
    dds_finance_analyze_import: () => report,
    dds_finance_admin_list_users: () => [{ ...profile, phone: profile.phone, is_active: true, locked_until: null, transactions: tx.length }],
  };

  return {
    token,
    async install(page: Page) {
      await page.route("**/rest/v1/rpc/*", async (route: Route) => {
        const fn = route.request().url().split("/rpc/")[1];
        const body = JSON.parse(route.request().postData() || "{}");
        const h = handlers[fn];
        if (!h) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "not mocked: " + fn }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(h(body)) });
      });
      await page.route("**/functions/v1/forex-ptax", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"cached":true}' }));
      await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
    },
  };
}
