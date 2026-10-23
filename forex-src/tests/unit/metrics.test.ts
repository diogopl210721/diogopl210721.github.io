// Testes dos cálculos (F, G, H, I, N) com dados sintéticos e, se disponível, com o CSV real.
// O CSV real não fica no repositório (é dado financeiro). Para rodar com ele:
//   DDS_CSV=/caminho/transactions.csv npm test
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvText } from "../../src/lib/csv";
import { buildTimeline, dayStats, monthly, periodStats, rateOn, simpleReturn, totals } from "../../src/lib/metrics";
import type { DailyRow } from "../../src/lib/types";

/** Mesmas regras do banco (dds_finance__analyze + dds_finance_daily_series). */
function dailyFromCsv(text: string): DailyRow[] {
  const { payload } = parseCsvText(text);
  const ix = Object.fromEntries(payload.columns.map((c, i) => [c, i]));
  const map = new Map<string, DailyRow>();
  for (const r of payload.rows) {
    const reason = r[ix.Reason];
    const amount = Number(r[ix.Amount]);
    const profit = Number(r[ix.AmountProfit]);
    const day = r[ix.Time].slice(0, 10); // horário do arquivo já está em Brasília (confirmado)
    const d = map.get(day) ?? {
      day, op_result: 0, trade_result: 0, fee_result: 0, deposits: 0, withdrawals: 0,
      tx_count: 0, trade_count: 0, positive_trades: 0, negative_trades: 0,
    };
    d.tx_count++;
    if (reason === "TradeResults") {
      d.op_result += profit; d.trade_result += profit; d.trade_count++;
      if (profit > 0) d.positive_trades++;
      if (profit < 0) d.negative_trades++;
    } else if (reason === "PerformanceFee") {
      d.op_result += amount; d.fee_result += amount;
    } else if (reason === "Deposit") d.deposits += amount;
    else if (reason === "Withdrawal") d.withdrawals += Math.abs(amount);
    map.set(day, d);
  }
  return [...map.values()];
}

const row = (day: string, p: Partial<DailyRow>): DailyRow => ({
  day, op_result: 0, trade_result: 0, fee_result: 0, deposits: 0, withdrawals: 0,
  tx_count: 1, trade_count: 0, positive_trades: 0, negative_trades: 0, ...p,
});

describe("regras de capital (sintético)", () => {
  const rows = [
    row("2026-01-01", { deposits: 1000 }),
    row("2026-01-02", { op_result: 100, trade_result: 100 }),
    row("2026-01-04", { withdrawals: 500 }),
    row("2026-01-05", { op_result: -60, trade_result: -40, fee_result: -20 }),
  ];
  const tl = buildTimeline(rows, 0, "2026-01-06");
  const t = totals(tl, 0);

  it("F: depósito aumenta o capital mas não o lucro", () => {
    expect(t.deposits).toBe(1000);
    expect(t.op).toBe(40);
  });
  it("G: retirada reduz o capital e não é prejuízo", () => {
    expect(t.withdrawals).toBe(500);
    expect(t.capital).toBe(1000 - 500 + 40);
    expect(tl.find((p) => p.day === "2026-01-04")!.op).toBe(0);
  });
  it("dias sem movimentação entram como sem dados", () => {
    expect(tl.map((p) => p.day)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"]);
    expect(tl.find((p) => p.day === "2026-01-03")!.hasData).toBe(false);
  });
  it("TWR encadeia o retorno diário sobre o capital do início do dia", () => {
    // +100/1000 = +10%; depois -60/(1100-500) = -10%  →  1,1 × 0,9 − 1 = −1%
    expect(t.twrPct!).toBeCloseTo(-1, 10);
  });
  it("rentabilidade simples só existe com capital-base > 0", () => {
    expect(simpleReturn(40, null)).toBeNull();
    expect(simpleReturn(40, 0)).toBeNull();
    expect(simpleReturn(40, 500)).toBeCloseTo(8, 10);
  });
  it("capital inicial configurado entra no capital estimado", () => {
    const t2 = totals(buildTimeline(rows, 250, "2026-01-06"), 250);
    expect(t2.capital).toBe(250 + 1000 - 500 + 40);
    expect(t2.op).toBe(40);
  });
  it("lucro do dia compara com o dia anterior com movimentação", () => {
    const s = dayStats(tl, "2026-01-05");
    expect(s.op).toBe(-60);
    expect(s.prev).toEqual({ day: "2026-01-04", op: 0 });
    expect(dayStats(tl, "2026-01-03").hasData).toBe(false);
  });
  it("I: conversão cambial muda com a cotação sem mudar o lucro em USD", () => {
    const h = [{ date: "2026-01-02", rate: 5 }, { date: "2026-01-05", rate: 5.5 }];
    expect(rateOn(h, "2026-01-01")).toBeNull();
    expect(rateOn(h, "2026-01-04")).toBe(5);
    expect(rateOn(h, "2026-01-06")).toBe(5.5);
    expect(t.capital * 5.5).not.toBe(t.capital * 5);
    expect(t.op).toBe(40);
  });
});

// Valores de referência do arquivo real ficam em tests/.local/expected.json (fora do Git: são dados financeiros).
const csvPath = process.env.DDS_CSV ?? "";
const expPath = new URL("../.local/expected.json", import.meta.url);
const hasReal = !!csvPath && existsSync(csvPath) && existsSync(expPath);
describe.skipIf(!hasReal)("N: totais do transactions.csv real conferem com a referência", () => {
  const text = hasReal ? readFileSync(csvPath, "utf8") : "";
  const E = hasReal ? JSON.parse(readFileSync(expPath, "utf8")) : {};
  const rows = text ? dailyFromCsv(text) : [];
  const tl = buildTimeline(rows, 0, E.today);
  const t = totals(tl, 0);

  it("lê todas as linhas e colunas", () => {
    const { payload } = parseCsvText(text);
    expect(payload.rows.length).toBe(E.rows);
    expect(payload.columns.length).toBe(E.cols);
  });
  it("resultado operacional = trades + taxas (Amount)", () => {
    expect(t.op).toBeCloseTo(E.op, 2);
    expect(t.trades).toBeCloseTo(E.trades, 2);
    expect(t.fees).toBeCloseTo(E.fees, 2);
  });
  it("depósitos, retiradas e capital estimado (= saldo confirmado na plataforma)", () => {
    expect(t.deposits).toBeCloseTo(E.deposits, 2);
    expect(t.withdrawals).toBeCloseTo(E.withdrawals, 2);
    expect(t.capital).toBeCloseTo(E.capital, 2);
  });
  it("TWR e rentabilidade simples sobre depósitos líquidos", () => {
    expect(t.twrPct!).toBeCloseTo(E.twr, 1);
    expect(simpleReturn(t.op, E.simple_base)!).toBeCloseTo(E.simple, 2);
  });
  it("melhor e pior dia", () => {
    const s = periodStats(tl, E.range_from, E.today);
    expect(s.best).toEqual({ day: E.best_day, op: expect.closeTo(E.best, 2) });
    expect(s.worst).toEqual({ day: E.worst_day, op: expect.closeTo(E.worst, 2) });
    expect(s.daysWithData).toBe(E.days_with_data);
  });
  it("lucro do mês, do dia e do dia anterior", () => {
    expect(periodStats(tl, E.period_from, E.today).op).toBeCloseTo(E.period_op, 2);
    const d = dayStats(tl, E.today);
    expect(d.op).toBeCloseTo(E.day_op, 2);
    expect(d.prev!.op).toBeCloseTo(E.prev_op, 2);
  });
  it("H: com AmountProfit na taxa o resultado seria outro (regra rejeitada)", () => {
    const { payload } = parseCsvText(text);
    const ix = Object.fromEntries(payload.columns.map((c, i) => [c, i]));
    const wrong = payload.rows.reduce((s, r) => s + (["TradeResults", "PerformanceFee"].includes(r[ix.Reason]) ? Number(r[ix.AmountProfit]) : 0), 0);
    expect(wrong).toBeCloseTo(E.wrong_fee_op, 2);
    expect(wrong).not.toBeCloseTo(t.op, 0);
  });
  it("resultado mensal soma o total", () => {
    const m = monthly(tl);
    expect(m.map((x) => x.month)).toEqual(E.months);
    expect(m.reduce((s, x) => s + x.op, 0)).toBeCloseTo(E.op, 2);
  });
});
