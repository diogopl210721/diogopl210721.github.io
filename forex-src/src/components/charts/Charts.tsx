import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps,
} from "recharts";
import { fmtAxis, fmtBRL, fmtDayLong, fmtDayShort, fmtPct, fmtRate, fmtUSD, round2 } from "../../lib/format";
import { rateOn, type TimelinePoint } from "../../lib/metrics";

export const C = {
  pos: "#54E6C1",
  neg: "#FF8290",
  sky: "#9CC8FF",
  grid: "#1C2A40",
  axis: "#8A9BB5",
  gap: "#3A4D6B",
  white: "#FFFFFF",
};

const axisProps = {
  stroke: C.axis,
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function Box({ children, label, height }: { children: React.ReactNode; label: string; height: number }) {
  return (
    <div role="img" aria-label={label} style={{ width: "100%", height }} className="select-none">
      <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
    </div>
  );
}

function TipBox({ title, rows }: { title: string; rows: Array<{ k: string; v: string; cls?: string }> }) {
  return (
    <div className="min-w-[170px] rounded-xl border border-ink-600 bg-ink-850/95 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-bold text-white">{title}</div>
      {rows.map((r) => (
        <div key={r.k} className="flex justify-between gap-4">
          <span className="text-mute">{r.k}</span>
          <span className={`font-bold tabular-nums ${r.cls ?? "text-white"}`}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

const sgn = (v: number) => (round2(v) > 0 ? "text-pos" : round2(v) < 0 ? "text-neg" : "text-white");

// ---------------------------------------------------------------------------
// 1. Lucro diário
export function DailyProfitChart({ points, height = 220, selectedDay, onSelect }: {
  points: TimelinePoint[]; height?: number; selectedDay?: string; onSelect?: (day: string) => void;
}) {
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.op)));
  const gap = maxAbs * 0.025;
  const data = points.map((p) => ({
    day: p.day,
    value: p.hasData && round2(p.op) !== 0 ? round2(p.op) : null,
    gap: !p.hasData || round2(p.op) === 0 ? gap : null,
    hasData: p.hasData,
    txCount: p.txCount,
    op: p.op,
  }));
  const best = points.reduce<TimelinePoint | null>((b, p) => (p.hasData && (!b || p.op > b.op) ? p : b), null);
  const label = points.length
    ? `Lucro diário de ${fmtDayShort(points[0].day)} a ${fmtDayShort(points[points.length - 1].day)}` +
      (best ? `; melhor dia ${fmtDayShort(best.day)} com ${fmtUSD(best.op)}` : "")
    : "Sem dados no período";
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as (typeof data)[number];
    return (
      <TipBox title={fmtDayLong(d.day)} rows={d.hasData
        ? [{ k: "Resultado", v: fmtUSD(d.op, true), cls: sgn(d.op) }, { k: "Movimentações", v: String(d.txCount) }]
        : [{ k: "Sem movimentação", v: "—" }]} />
    );
  };
  return (
    <Box label={label} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%" accessibilityLayer
        onClick={(s) => {
          const d = (s as { activePayload?: Array<{ payload: { day: string } }> })?.activePayload?.[0]?.payload?.day;
          if (d && onSelect) onSelect(d);
        }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="day" tickFormatter={fmtDayShort} {...axisProps} minTickGap={22} />
        <YAxis {...axisProps} width={44} tickFormatter={fmtAxis} />
        <ReferenceLine y={0} stroke="#2A3A55" />
        <Tooltip content={<Tip />} cursor={{ fill: "rgba(156,200,255,0.08)" }} />
        <Bar dataKey="value" stackId="a" radius={[3, 3, 3, 3]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.day} fill={(d.value ?? 0) >= 0 ? C.pos : C.neg}
              fillOpacity={selectedDay && selectedDay !== d.day ? 0.75 : 1}
              stroke={selectedDay === d.day ? C.white : "none"} strokeWidth={selectedDay === d.day ? 1.5 : 0} />
          ))}
        </Bar>
        <Bar dataKey="gap" stackId="a" fill={C.gap} isAnimationActive={false} />
      </BarChart>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 2. Lucro acumulado (no período)
export function CumulativeChart({ points, height = 200 }: { points: TimelinePoint[]; height?: number }) {
  let acc = 0;
  const data = points.map((p) => ({ day: p.day, value: round2((acc += p.op)) }));
  const last = data[data.length - 1]?.value ?? 0;
  const color = last >= 0 ? C.pos : C.neg;
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as (typeof data)[number];
    return <TipBox title={fmtDayLong(d.day)} rows={[{ k: "Acumulado no período", v: fmtUSD(d.value, true), cls: sgn(d.value) }]} />;
  };
  return (
    <Box label={`Lucro acumulado no período, terminando em ${fmtUSD(last, true)}`} height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} accessibilityLayer>
        <defs>
          <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="day" tickFormatter={fmtDayShort} {...axisProps} minTickGap={28} />
        <YAxis {...axisProps} width={44} tickFormatter={fmtAxis} />
        <ReferenceLine y={0} stroke="#3A4D6B" strokeDasharray="3 4" />
        <Tooltip content={<Tip />} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#cumFill)" isAnimationActive={false} />
      </AreaChart>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 3. Rentabilidade
export function ReturnChart({ points, mode, capitalBase, beforeIndex, height = 200 }: {
  points: TimelinePoint[]; mode: "twr" | "simple"; capitalBase: number | null; beforeIndex: number; height?: number;
}) {
  let acc = 0;
  const data = points.map((p) => {
    acc += p.op;
    const v = mode === "twr" ? (p.twrIndex / beforeIndex - 1) * 100 : capitalBase ? (acc / capitalBase) * 100 : null;
    return { day: p.day, value: v == null ? null : Math.round(v * 100) / 100 };
  });
  const last = data[data.length - 1]?.value ?? 0;
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as (typeof data)[number];
    return <TipBox title={fmtDayLong(d.day)} rows={[{ k: mode === "twr" ? "TWR no período" : "Simples no período", v: fmtPct(d.value), cls: sgn(d.value ?? 0) }]} />;
  };
  return (
    <Box label={`Rentabilidade ${mode === "twr" ? "ponderada pelo tempo" : "simples"} no período: ${fmtPct(last)}`} height={height}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="day" tickFormatter={fmtDayShort} {...axisProps} minTickGap={28} />
        <YAxis {...axisProps} width={48} tickFormatter={(v) => `${Math.round(v)}%`} />
        <ReferenceLine y={0} stroke="#3A4D6B" strokeDasharray="3 4" />
        <Tooltip content={<Tip />} />
        <Line type="monotone" dataKey="value" stroke={(last ?? 0) >= 0 ? C.pos : C.neg} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 4. Capital estimado (aportes líquidos x resultado)
export function CapitalChart({ points, height = 220 }: { points: TimelinePoint[]; height?: number }) {
  const data = points.map((p) => ({
    day: p.day, capital: round2(p.capital), contrib: round2(p.netContrib), result: round2(p.cumOp),
    deposits: p.deposits, withdrawals: p.withdrawals,
  }));
  const last = data[data.length - 1];
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as (typeof data)[number];
    const rows = [
      { k: "Capital estimado", v: fmtUSD(d.capital) },
      { k: "Aportes − retiradas", v: fmtUSD(d.contrib), cls: "text-sky" },
      { k: "Resultado acumulado", v: fmtUSD(d.result, true), cls: sgn(d.result) },
    ];
    if (d.deposits) rows.push({ k: "Depósito no dia", v: fmtUSD(d.deposits, true), cls: "text-sky" });
    if (d.withdrawals) rows.push({ k: "Retirada no dia", v: fmtUSD(-d.withdrawals), cls: "text-mute-strong" });
    return <TipBox title={fmtDayLong(d.day)} rows={rows} />;
  };
  return (
    <Box label={`Capital estimado${last ? `, terminando em ${fmtUSD(last.capital)}` : ""}; a área azul mostra aportes menos retiradas`} height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="day" tickFormatter={fmtDayShort} {...axisProps} minTickGap={28} />
        <YAxis {...axisProps} width={48} tickFormatter={fmtAxis} />
        <Tooltip content={<Tip />} />
        <Area type="stepAfter" dataKey="contrib" stroke={C.sky} strokeWidth={1.5} fill={C.sky} fillOpacity={0.12} isAnimationActive={false} />
        <Line type="monotone" dataKey="capital" stroke={C.pos} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 5. Patrimônio em reais (efeito do câmbio incluído)
export function FxEquityChart({ points, history, height = 220 }: {
  points: TimelinePoint[]; history: Array<{ date: string; rate: number }>; height?: number;
}) {
  const data = points
    .map((p) => {
      const r = rateOn(history, p.day);
      return r == null ? null : { day: p.day, brl: round2(p.capital * r), usd: round2(p.capital), rate: r };
    })
    .filter(Boolean) as Array<{ day: string; brl: number; usd: number; rate: number }>;
  if (!data.length) return <p className="py-8 text-center text-sm text-mute">Sem cotações para o período.</p>;
  const last = data[data.length - 1];
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as (typeof data)[number];
    return (
      <TipBox title={fmtDayLong(d.day)} rows={[
        { k: "Patrimônio em R$", v: fmtBRL(d.brl) },
        { k: "Patrimônio em US$", v: fmtUSD(d.usd) },
        { k: "PTAX usada", v: fmtRate(d.rate), cls: "text-sky" },
      ]} />
    );
  };
  return (
    <Box label={`Patrimônio estimado convertido para reais, terminando em ${fmtBRL(last.brl)} com PTAX ${fmtRate(last.rate)}`} height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="day" tickFormatter={fmtDayShort} {...axisProps} minTickGap={28} />
        <YAxis yAxisId="brl" {...axisProps} width={48} tickFormatter={fmtAxis} />
        <YAxis yAxisId="rate" orientation="right" {...axisProps} width={40} domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toFixed(2).replace(".", ",")} />
        <Tooltip content={<Tip />} />
        <Line yAxisId="brl" type="monotone" dataKey="brl" stroke={C.white} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line yAxisId="rate" type="stepAfter" dataKey="rate" stroke={C.sky} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
      </ComposedChart>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Histórico da PTAX
export function RateChart({ history, height = 200 }: { history: Array<{ date: string; rate: number }>; height?: number }) {
  const data = history.map((h) => ({ day: h.date, rate: Number(h.rate) }));
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as (typeof data)[number];
    return <TipBox title={fmtDayLong(d.day)} rows={[{ k: "PTAX venda", v: fmtRate(d.rate), cls: "text-sky" }]} />;
  };
  return (
    <Box label="Histórico da PTAX de venda" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="day" tickFormatter={fmtDayShort} {...axisProps} minTickGap={28} />
        <YAxis {...axisProps} width={44} domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toFixed(2).replace(".", ",")} />
        <Tooltip content={<Tip />} />
        <Line type="stepAfter" dataKey="rate" stroke={C.sky} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </Box>
  );
}
