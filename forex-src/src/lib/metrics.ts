// Cálculos do dashboard a partir da série diária gravada no banco (dds_finance_daily_series).
// Nenhum valor é inventado: dias sem movimentação entram com zero e marcados como "sem dados".
//
// Regras (versão 2, documentadas também na tela de Capital e rentabilidade):
//   lucro das operações   = TradeResults (AmountProfit)                       → trade_result
//   comissão PAMM         = PerformanceFee (Amount, a comissão debitada)       → fee_result (≤ 0)
//                           é uma SAÍDA de dinheiro para o gestor da conta PAMM, não prejuízo das operações
//   capital estimado      = capital inicial + depósitos − retiradas − comissões + lucro das operações
//   rentabilidade simples = lucro das operações ÷ capital-base × 100 (só com capital-base > 0)
//   TWR das operações     = Π(1 + lucro do dia ÷ capital no início do dia) − 1,
//                           com aportes, retiradas e comissões no início do dia em que ocorreram
//   TWR líquida           = o mesmo, mas com a comissão descontada do resultado do dia
// Lucro e comissão vêm de trade_result e fee_result (nunca de op_result), então a conta é a mesma
// antes e depois da migração do banco para a regra 2.
import { addDays } from "./dates";
import type { DailyRow } from "./types";

export type TimelinePoint = {
  day: string;
  hasData: boolean;
  op: number; // lucro das operações do dia (trades)
  trades: number; // = op (mantido por compatibilidade)
  fees: number; // comissão PAMM do dia (≤ 0)
  deposits: number;
  withdrawals: number;
  txCount: number;
  tradeCount: number;
  posTrades: number;
  negTrades: number;
  cumOp: number;
  cumFees: number;
  cumDeposits: number;
  cumWithdrawals: number;
  netContrib: number; // capital inicial + depósitos − retiradas (acumulados)
  capital: number; // netContrib + lucro acumulado + comissões acumuladas
  startCapital: number; // capital no início do dia (após aportes, retiradas e comissão do dia)
  twrIndex: number; // TWR das operações; 1 = início
  twrPct: number;
  twrNetIndex: number; // TWR líquida de comissões
  twrNetPct: number;
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
  let cumOp = 0, cumFees = 0, cumDep = 0, cumWd = 0, idx = 1, idxNet = 1;
  let prevCapital = n(openingBalance);
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const r = byDay.get(day);
    const op = r?.trade_result ?? 0;
    const fee = r?.fee_result ?? 0;
    const dep = r?.deposits ?? 0;
    const wd = r?.withdrawals ?? 0;
    const beforeFee = prevCapital + dep - wd;
    const start = beforeFee + fee;
    if (start > 0 && op !== 0) idx *= 1 + op / start;
    if (beforeFee > 0 && op + fee !== 0) idxNet *= 1 + (op + fee) / beforeFee;
    cumOp += op;
    cumFees += fee;
    cumDep += dep;
    cumWd += wd;
    const netContrib = n(openingBalance) + cumDep - cumWd;
    const capital = netContrib + cumOp + cumFees;
    out.push({
      day,
      hasData: !!r,
      op,
      trades: op,
      fees: fee,
      deposits: dep,
      withdrawals: wd,
      txCount: r?.tx_count ?? 0,
      tradeCount: r?.trade_count ?? 0,
      posTrades: r?.positive_trades ?? 0,
      negTrades: r?.negative_trades ?? 0,
      cumOp,
      cumFees,
      cumDeposits: cumDep,
      cumWithdrawals: cumWd,
      netContrib,
      capital,
      startCapital: start,
      twrIndex: idx,
      twrPct: (idx - 1) * 100,
      twrNetIndex: idxNet,
      twrNetPct: (idxNet - 1) * 100,
    });
    prevCapital = capital;
  }
  return out;
}

export type Totals = {
  op: number; // lucro das operações
  trades: number;
  fees: number; // comissões PAMM (≤ 0)
  net: number; // lucro depois das comissões
  deposits: number;
  withdrawals: number;
  netContrib: number;
  capital: number;
  twrPct: number | null;
  twrNetPct: number | null;
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
  const op = last?.cumOp ?? 0;
  const fees = last?.cumFees ?? 0;
  return {
    op,
    trades: op,
    fees,
    net: op + fees,
    deposits: last?.cumDeposits ?? 0,
    withdrawals: last?.cumWithdrawals ?? 0,
    netContrib: last?.netContrib ?? n(openingBalance),
    capital: last?.capital ?? n(openingBalance),
    twrPct: last ? last.twrPct : null,
    twrNetPct: last ? last.twrNetPct : null,
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
  net: number;
  deposits: number;
  withdrawals: number;
  txCount: number;
  tradeCount: number;
  posTrades: number;
  best: { day: string; op: number } | null;
  worst: { day: string; op: number } | null;
  daysWithData: number;
  tradeDays: number; // dias com pelo menos um trade
  positiveDays: number;
  negativeDays: number;
  zeroDays: number;
  twrPct: number | null;
  twrNetPct: number | null;
  capitalStart: number | null;
  capitalEnd: number | null;
};

export function periodStats(tl: TimelinePoint[], from: string, to: string): PeriodStats {
  const points = tl.filter((p) => p.day >= from && p.day <= to);
  const withData = points.filter((p) => p.hasData);
  const sum = (f: (p: TimelinePoint) => number) => points.reduce((s, p) => s + f(p), 0);
  let best: PeriodStats["best"] = null;
  let worst: PeriodStats["worst"] = null;
  // melhor e pior dia só entre dias com operação (um dia só com depósito ou comissão não conta)
  for (const p of withData) {
    if (p.tradeCount === 0) continue;
    if (!best || p.op > best.op) best = { day: p.day, op: p.op };
    if (!worst || p.op < worst.op) worst = { day: p.day, op: p.op };
  }
  const before = [...tl].reverse().find((p) => p.day < from);
  const endPoint = points[points.length - 1];
  const startIdx = before ? before.twrIndex : 1;
  const startNetIdx = before ? before.twrNetIndex : 1;
  const op = sum((p) => p.op);
  const fees = sum((p) => p.fees);
  const first = points[0];
  return {
    from,
    to,
    points,
    op,
    trades: op,
    fees,
    net: op + fees,
    deposits: sum((p) => p.deposits),
    withdrawals: sum((p) => p.withdrawals),
    txCount: sum((p) => p.txCount),
    tradeCount: sum((p) => p.tradeCount),
    posTrades: sum((p) => p.posTrades),
    best,
    worst,
    daysWithData: withData.length,
    tradeDays: withData.filter((p) => p.tradeCount > 0).length,
    positiveDays: withData.filter((p) => p.op > 0.004).length,
    negativeDays: withData.filter((p) => p.op < -0.004).length,
    zeroDays: withData.filter((p) => Math.abs(p.op) <= 0.004).length,
    twrPct: endPoint ? (endPoint.twrIndex / startIdx - 1) * 100 : null,
    twrNetPct: endPoint ? (endPoint.twrNetIndex / startNetIdx - 1) * 100 : null,
    capitalStart: before ? before.capital : first ? first.capital - first.op - first.fees - first.deposits + first.withdrawals : null,
    capitalEnd: endPoint ? endPoint.capital : null,
  };
}

export function simpleReturn(op: number, capitalBase: number | null | undefined): number | null {
  if (capitalBase == null || !(capitalBase > 0)) return null;
  return (op / capitalBase) * 100;
}

/** Lucro das operações do dia e do dia anterior com movimentação. */
export function dayStats(tl: TimelinePoint[], day: string): {
  day: string; op: number; fees: number; hasData: boolean; txCount: number; prev: { day: string; op: number } | null;
} {
  const p = tl.find((x) => x.day === day);
  const prev = [...tl].reverse().find((x) => x.day < day && x.hasData);
  return {
    day,
    op: p?.op ?? 0,
    fees: p?.fees ?? 0,
    hasData: !!p?.hasData,
    txCount: p?.txCount ?? 0,
    prev: prev ? { day: prev.day, op: prev.op } : null,
  };
}

/** Resultado por mês (para a tabela de Capital e rentabilidade). */
export function monthly(tl: TimelinePoint[]): Array<{
  month: string; op: number; trades: number; fees: number; net: number; deposits: number; withdrawals: number;
  twrPct: number; twrNetPct: number; capitalEnd: number;
}> {
  const map = new Map<string, TimelinePoint[]>();
  for (const p of tl) {
    const k = p.day.slice(0, 7);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  const out: ReturnType<typeof monthly> = [];
  let prevIdx = 1, prevNetIdx = 1;
  for (const [month, pts] of map) {
    const last = pts[pts.length - 1];
    const op = pts.reduce((s, p) => s + p.op, 0);
    const fees = pts.reduce((s, p) => s + p.fees, 0);
    out.push({
      month,
      op,
      trades: op,
      fees,
      net: op + fees,
      deposits: pts.reduce((s, p) => s + p.deposits, 0),
      withdrawals: pts.reduce((s, p) => s + p.withdrawals, 0),
      twrPct: (last.twrIndex / prevIdx - 1) * 100,
      twrNetPct: (last.twrNetIndex / prevNetIdx - 1) * 100,
      capitalEnd: last.capital,
    });
    prevIdx = last.twrIndex;
    prevNetIdx = last.twrNetIndex;
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
