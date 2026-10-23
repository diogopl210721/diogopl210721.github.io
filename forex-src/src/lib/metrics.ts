// Cálculos do dashboard a partir da série diária gravada no banco (dds_finance_daily_series).
// Nenhum valor é inventado: dias sem movimentação entram com zero e marcados como "sem dados".
//
// Regras (documentadas também na tela de Capital e rentabilidade):
//   resultado operacional = TradeResults (AmountProfit) + PerformanceFee (Amount)  — calculado no banco
//   capital estimado      = capital inicial + depósitos − retiradas + resultado operacional acumulado
//   rentabilidade simples = resultado acumulado ÷ capital-base × 100 (só com capital-base > 0)
//   TWR (ponderada pelo tempo) = Π(1 + resultado do dia ÷ capital no início do dia) − 1,
//       com aportes e retiradas considerados no início do dia em que ocorreram.
import { addDays } from "./dates";
import type { DailyRow } from "./types";

export type TimelinePoint = {
  day: string;
  hasData: boolean;
  op: number;
  trades: number;
  fees: number;
  deposits: number;
  withdrawals: number;
  txCount: number;
  tradeCount: number;
  posTrades: number;
  negTrades: number;
  cumOp: number;
  cumDeposits: number;
  cumWithdrawals: number;
  netContrib: number; // capital inicial + depósitos − retiradas (acumulados)
  capital: number; // netContrib + cumOp
  startCapital: number; // capital no início do dia (após fluxos do dia)
  twrIndex: number; // 1 = início
  twrPct: number;
};

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function normalizeRows(rows: DailyRow[]): DailyRow[] {
  return rows
    .map((r) => ({
      day: String(r.day).slice(0, 10),
      op_result: n(r.op_result),
      trade_result: n(r.trade_result),
      fee_result: n(r.fee_result),
      deposits: n(r.deposits),
      withdrawals: Math.abs(n(r.withdrawals)),
      tx_count: n(r.tx_count),
      trade_count: n(r.trade_count),
      positive_trades: n(r.positive_trades),
      negative_trades: n(r.negative_trades),
    }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Linha do tempo diária contínua, do primeiro dia com dados até `endDay` (ou o último dia com dados). */
export function buildTimeline(rowsIn: DailyRow[], openingBalance: number, endDay?: string): TimelinePoint[] {
  const rows = normalizeRows(rowsIn);
  if (!rows.length) return [];
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const first = rows[0].day;
  const lastData = rows[rows.length - 1].day;
  const last = endDay && endDay > lastData ? endDay : lastData;

  const out: TimelinePoint[] = [];
  let cumOp = 0, cumDep = 0, cumWd = 0, idx = 1;
  let prevCapital = n(openingBalance);
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const r = byDay.get(day);
    const op = r?.op_result ?? 0;
    const dep = r?.deposits ?? 0;
    const wd = r?.withdrawals ?? 0;
    const start = prevCapital + dep - wd;
    if (start > 0 && op !== 0) idx *= 1 + op / start;
    cumOp += op;
    cumDep += dep;
    cumWd += wd;
    const netContrib = n(openingBalance) + cumDep - cumWd;
    const capital = netContrib + cumOp;
    out.push({
      day,
      hasData: !!r,
      op,
      trades: r?.trade_result ?? 0,
      fees: r?.fee_result ?? 0,
      deposits: dep,
      withdrawals: wd,
      txCount: r?.tx_count ?? 0,
      tradeCount: r?.trade_count ?? 0,
      posTrades: r?.positive_trades ?? 0,
      negTrades: r?.negative_trades ?? 0,
      cumOp,
      cumDeposits: cumDep,
      cumWithdrawals: cumWd,
      netContrib,
      capital,
      startCapital: start,
      twrIndex: idx,
      twrPct: (idx - 1) * 100,
    });
    prevCapital = capital;
  }
  return out;
}

export type Totals = {
  op: number;
  trades: number;
  fees: number;
  deposits: number;
  withdrawals: number;
  netContrib: number;
  capital: number;
  twrPct: number | null;
  txCount: number;
  tradeCount: number;
  posTrades: number;
  negTrades: number;
  firstDay: string | null;
  lastDataDay: string | null;
};

export function totals(tl: TimelinePoint[], openingBalance: number): Totals {
  const last = tl[tl.length - 1];
  const sum = (f: (p: TimelinePoint) => number) => tl.reduce((s, p) => s + f(p), 0);
  const lastData = [...tl].reverse().find((p) => p.hasData);
  return {
    op: last?.cumOp ?? 0,
    trades: sum((p) => p.trades),
    fees: sum((p) => p.fees),
    deposits: last?.cumDeposits ?? 0,
    withdrawals: last?.cumWithdrawals ?? 0,
    netContrib: last?.netContrib ?? n(openingBalance),
    capital: last?.capital ?? n(openingBalance),
    twrPct: last ? last.twrPct : null,
    txCount: sum((p) => p.txCount),
    tradeCount: sum((p) => p.tradeCount),
    posTrades: sum((p) => p.posTrades),
    negTrades: sum((p) => p.negTrades),
    firstDay: tl[0]?.day ?? null,
    lastDataDay: lastData?.day ?? null,
  };
}

export type PeriodStats = {
  from: string;
  to: string;
  points: TimelinePoint[];
  op: number;
  trades: number;
  fees: number;
  deposits: number;
  withdrawals: number;
  txCount: number;
  tradeCount: number;
  posTrades: number;
  best: { day: string; op: number } | null;
  worst: { day: string; op: number } | null;
  daysWithData: number;
  positiveDays: number;
  negativeDays: number;
  zeroDays: number;
  twrPct: number | null;
  capitalStart: number | null;
  capitalEnd: number | null;
};

export function periodStats(tl: TimelinePoint[], from: string, to: string): PeriodStats {
  const points = tl.filter((p) => p.day >= from && p.day <= to);
  const withData = points.filter((p) => p.hasData);
  const sum = (f: (p: TimelinePoint) => number) => points.reduce((s, p) => s + f(p), 0);
  let best: PeriodStats["best"] = null;
  let worst: PeriodStats["worst"] = null;
  for (const p of withData) {
    if (!best || p.op > best.op) best = { day: p.day, op: p.op };
    if (!worst || p.op < worst.op) worst = { day: p.day, op: p.op };
  }
  const before = [...tl].reverse().find((p) => p.day < from);
  const endPoint = points[points.length - 1];
  const startIdx = before ? before.twrIndex : 1;
  return {
    from,
    to,
    points,
    op: sum((p) => p.op),
    trades: sum((p) => p.trades),
    fees: sum((p) => p.fees),
    deposits: sum((p) => p.deposits),
    withdrawals: sum((p) => p.withdrawals),
    txCount: sum((p) => p.txCount),
    tradeCount: sum((p) => p.tradeCount),
    posTrades: sum((p) => p.posTrades),
    best,
    worst,
    daysWithData: withData.length,
    positiveDays: withData.filter((p) => p.op > 0.004).length,
    negativeDays: withData.filter((p) => p.op < -0.004).length,
    zeroDays: withData.filter((p) => Math.abs(p.op) <= 0.004).length,
    twrPct: endPoint ? (endPoint.twrIndex / startIdx - 1) * 100 : null,
    capitalStart: before ? before.capital : points[0] ? points[0].netContrib - points[0].deposits + points[0].withdrawals : null,
    capitalEnd: endPoint ? endPoint.capital : null,
  };
}

export function simpleReturn(op: number, capitalBase: number | null | undefined): number | null {
  if (capitalBase == null || !(capitalBase > 0)) return null;
  return (op / capitalBase) * 100;
}

/** Resultado do dia e do dia anterior com movimentação. */
export function dayStats(tl: TimelinePoint[], day: string): {
  day: string; op: number; hasData: boolean; txCount: number; prev: { day: string; op: number } | null;
} {
  const p = tl.find((x) => x.day === day);
  const prev = [...tl].reverse().find((x) => x.day < day && x.hasData);
  return {
    day,
    op: p?.op ?? 0,
    hasData: !!p?.hasData,
    txCount: p?.txCount ?? 0,
    prev: prev ? { day: prev.day, op: prev.op } : null,
  };
}

/** Resultado por mês (para a tabela de Capital e rentabilidade). */
export function monthly(tl: TimelinePoint[]): Array<{
  month: string; op: number; trades: number; fees: number; deposits: number; withdrawals: number; twrPct: number; capitalEnd: number;
}> {
  const map = new Map<string, TimelinePoint[]>();
  for (const p of tl) {
    const k = p.day.slice(0, 7);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  const out: ReturnType<typeof monthly> = [];
  let prevIdx = 1;
  for (const [month, pts] of map) {
    const last = pts[pts.length - 1];
    out.push({
      month,
      op: pts.reduce((s, p) => s + p.op, 0),
      trades: pts.reduce((s, p) => s + p.trades, 0),
      fees: pts.reduce((s, p) => s + p.fees, 0),
      deposits: pts.reduce((s, p) => s + p.deposits, 0),
      withdrawals: pts.reduce((s, p) => s + p.withdrawals, 0),
      twrPct: (last.twrIndex / prevIdx - 1) * 100,
      capitalEnd: last.capital,
    });
    prevIdx = last.twrIndex;
  }
  return out;
}

/** Cotação válida em um dia: a última publicada até aquele dia. */
export function rateOn(history: Array<{ date: string; rate: number }>, day: string): number | null {
  let lo = 0, hi = history.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (history[mid].date <= day) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? Number(history[ans].rate) : null;
}
