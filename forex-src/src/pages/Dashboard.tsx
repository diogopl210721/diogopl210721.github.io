import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCw, Upload } from "lucide-react";
import { CapitalChart, CumulativeChart, DailyProfitChart, FxEquityChart, ReturnChart } from "../components/charts/Charts";
import { LastImport, PeriodSelector } from "../components/Layout";
import { Badge, Button, Card, CardHeader, cx, Divider, EmptyState, KeyValue, Notice, Segmented, Skeleton } from "../components/ui";
import { addDays, PERIOD_LABELS } from "../lib/dates";
import {
  fmtBRL, fmtDate, fmtDateTime, fmtDayLong, fmtDayShort, fmtInt, fmtPct, fmtRate, fmtUSD, signClass,
} from "../lib/format";
import { fxStatus } from "../lib/fx";
import { dayStats, simpleReturn } from "../lib/metrics";
import { useAuth } from "../state/auth";
import { useData } from "../state/data";
import { RecentMovements } from "./Movements";

function Stat({ label, value, valueClass, sub, badge, className, small }: {
  label: string; value: React.ReactNode; valueClass?: string; sub?: React.ReactNode; badge?: React.ReactNode; className?: string; small?: boolean;
}) {
  return (
    <Card as="div" className={cx("flex flex-col gap-1 p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-mute">{label}</span>
        {badge}
      </div>
      <span className={cx("font-extrabold leading-tight tracking-tight tabular-nums", small ? "text-[19px] lg:text-[19px] xl:text-[20px]" : "text-[22px] lg:text-[24px]", valueClass)}>{value}</span>
      {sub && <span className="text-xs leading-snug text-mute">{sub}</span>}
    </Card>
  );
}

type Tab = "cum" | "capital" | "return" | "brl";

export default function Dashboard() {
  const { me } = useAuth();
  const d = useData();
  const [tab, setTab] = useState<Tab>("cum");
  useEffect(() => {
    document.title = "Visão geral · DDS Finance";
  }, []);

  const name = me?.profile.display_name?.split(" ")[0] ?? "";
  const s = d.settings;
  const day = dayStats(d.timeline, d.selectedDay);
  const status = fxStatus(d.fx);
  const twrAll = d.totals.twrPct;
  const simpleAll = simpleReturn(d.totals.op, s.capital_base);
  const beforeIdx = useMemo(() => [...d.timeline].reverse().find((p) => p.day < d.period.from)?.twrIndex ?? 1, [d.timeline, d.period.from]);
  const capitalBRL = d.rate ? d.totals.capital * d.rate.value : null;
  const hasData = (d.series?.length ?? 0) > 0;
  const firstDay = d.totals.firstDay;

  if (d.loading && !d.series) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (d.error && !d.series) {
    return (
      <Card className="p-2">
        <EmptyState title="Não foi possível carregar seus dados" action={<Button onClick={d.reload}><RefreshCw className="h-4 w-4" aria-hidden="true" />Tentar de novo</Button>}>
          {d.error}
        </EmptyState>
      </Card>
    );
  }

  const greeting = (
    <div className="mb-3 lg:hidden">
      <h1 className="text-2xl font-extrabold tracking-tight">Olá, {name}</h1>
      <div className="mt-1"><LastImport /></div>
    </div>
  );

  if (!hasData) {
    return (
      <>
        {greeting}
        <h1 className="mb-4 hidden text-[26px] font-extrabold tracking-tight lg:block">Visão geral</h1>
        <Card>
          <EmptyState
            icon={<Upload className="h-6 w-6" aria-hidden="true" />}
            title="Nenhuma movimentação ainda"
            action={<Link to="/importar" className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-pos px-5 font-extrabold text-ink"><Upload className="h-4 w-4" aria-hidden="true" />Importar transactions.csv</Link>}
          >
            Envie a exportação completa da plataforma. O sistema grava só o que ainda não existe e monta o dashboard com os seus dados.
          </EmptyState>
        </Card>
      </>
    );
  }

  const prevDay = addDays(d.selectedDay, -1);
  const nextDay = addDays(d.selectedDay, 1);
  const canPrev = !!firstDay && prevDay >= firstDay;
  const canNext = nextDay <= d.today;
  const periodLabel = d.period.key === "custom" || d.period.key === "all"
    ? `${fmtDate(d.period.from)} a ${fmtDate(d.period.to)}`
    : `${PERIOD_LABELS[d.period.key]} · ${fmtDayShort(d.period.from)}${d.period.from !== d.period.to ? ` a ${fmtDayShort(d.period.to)}` : ""}`;
  const winRate = d.stats.tradeCount ? (d.stats.posTrades / d.stats.tradeCount) * 100 : null;

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      {greeting}
      <div className="hidden items-end justify-between gap-3 lg:flex">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">Visão geral</h1>
          <div className="mt-1"><LastImport /></div>
        </div>
      </div>
      <div className="-mx-4 px-4 lg:hidden"><PeriodSelector /></div>

      {d.overview && d.overview.open_conflicts > 0 && (
        <Notice tone="warn" title={`${d.overview.open_conflicts} divergência(s) aguardando conferência`}>
          Algumas movimentações vieram com valores diferentes dos já gravados e não foram sobrescritas.{" "}
          <Link to="/importacoes" className="font-bold text-white underline">Conferir</Link>
        </Notice>
      )}
      {d.overview && d.overview.unclassified_total > 0 && (
        <Notice tone="info">
          {d.overview.unclassified_total} movimentação(ões) com tipo (Reason) sem regra de classificação estão fora dos cálculos.
        </Notice>
      )}

      {/* Patrimônio + indicadores principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-12 lg:gap-4">
        <Card className="col-span-2 flex flex-col gap-1 p-5 lg:col-span-4 lg:row-span-2" aria-label="Patrimônio estimado">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-mute">Patrimônio estimado</span>
            <Badge>ESTIMATIVA</Badge>
          </div>
          <div className="mt-1 text-[34px] font-extrabold leading-tight tracking-tight tabular-nums lg:text-[38px]">{fmtUSD(d.totals.capital)}</div>
          <div className="text-base font-semibold text-mute-strong tabular-nums">≈ {capitalBRL != null ? fmtBRL(capitalBRL) : "—"}</div>
          <div className="my-3"><Divider /></div>
          <div className="flex items-center justify-between text-[13px] text-mute">
            <span>{d.rate?.simulated ? "Cotação simulada" : `PTAX venda${d.rate?.date ? ` · ${fmtDate(d.rate.date)}` : ""}`}</span>
            <span className="font-bold text-white tabular-nums">{d.rate ? `R$ ${fmtRate(d.rate.value)}` : "—"}</span>
          </div>
          {d.rate?.simulated ? (
            <p className="mt-1 text-xs text-amber-300">Simulação manual ativa. <Link to="/cambio" className="underline">Alterar</Link></p>
          ) : (
            <p className={cx("mt-1 text-xs leading-relaxed", status.tone === "warn" || status.tone === "error" ? "text-amber-300" : "text-mute")}>
              {status.title}. Fonte: Banco Central. Conversão indicativa, sem spread, taxas ou impostos de saque.
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-mute">Calculado pelas movimentações importadas; não é o saldo confirmado pela plataforma.</p>
        </Card>

        <Card as="div" className="col-span-1 flex flex-col gap-1 p-4 lg:col-span-4">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-mute">Lucro do dia</span>
            <div className="-mr-2 -mt-2 flex">
              <button type="button" aria-label="Dia anterior" disabled={!canPrev} onClick={() => d.setSelectedDay(prevDay)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-mute hover:bg-ink-750 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" aria-label="Próximo dia" disabled={!canNext} onClick={() => d.setSelectedDay(nextDay)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-mute hover:bg-ink-750 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          <span className={cx("text-[22px] font-extrabold leading-tight tracking-tight tabular-nums lg:text-[24px]", signClass(day.op))}>{fmtUSD(day.op, true)}</span>
          <span className="text-xs leading-snug text-mute">
            {d.selectedDay === d.today ? "Hoje" : fmtDayLong(d.selectedDay)}
            {day.hasData ? ` · ${day.txCount} mov.` : " · sem movimentações"}
          </span>
          {day.prev && (
            <span className="text-xs text-mute">
              Anterior ({fmtDayShort(day.prev.day)}): <span className={signClass(day.prev.op)}>{fmtUSD(day.prev.op, true)}</span>
            </span>
          )}
        </Card>

        <Stat className="lg:col-span-4" label="Lucro total" value={fmtUSD(d.totals.op, true)} valueClass={signClass(d.totals.op)}
          sub={`Todo o histórico · desde ${fmtDate(firstDay)}`} />

        <Stat className="lg:col-span-4" label="Lucro do período" value={fmtUSD(d.stats.op, true)} valueClass={signClass(d.stats.op)} sub={periodLabel} />

        <Stat
          className="lg:col-span-4"
          label={s.return_method === "twr" ? "Rentabilidade · TWR" : "Rentabilidade · simples"}
          value={s.return_method === "twr" ? fmtPct(twrAll) : simpleAll != null ? fmtPct(simpleAll) : "—"}
          valueClass={signClass(s.return_method === "twr" ? twrAll : simpleAll)}
          sub={s.return_method === "twr"
            ? <>Ponderada pelo tempo, todo o histórico · {simpleAll != null ? <>simples: {fmtPct(simpleAll)}</> : <Link to="/capital" className="text-sky underline">definir capital-base</Link>}</>
            : simpleAll != null ? <>Sobre capital-base de {fmtUSD(s.capital_base)} · TWR: {fmtPct(twrAll)}</> : <Link to="/capital" className="text-sky underline">Configure o capital-base</Link>}
        />
      </div>

      {/* Lucro diário */}
      <Card className="p-4 lg:p-5" aria-labelledby="h-daily">
        <CardHeader id="h-daily" title="Lucro diário" sub={`${periodLabel} · USD · toque em uma barra para ver o dia`}
          right={
            <div className="flex flex-wrap gap-3 text-xs text-mute">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-pos" />Positivo</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-neg" />Negativo</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-2.5 bg-ink-400" />Sem movimento</span>
            </div>
          } />
        <div className="mt-4">
          {d.stats.points.length ? (
            <DailyProfitChart points={d.stats.points} selectedDay={d.selectedDay} onSelect={d.setSelectedDay} height={230} />
          ) : (
            <p className="py-10 text-center text-sm text-mute">Sem dados neste período.</p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        {/* Evolução */}
        <Card className="flex flex-col gap-3 p-4 lg:col-span-7 lg:p-5" aria-labelledby="h-evol">
          <h2 id="h-evol" className="sr-only">Evolução</h2>
          <Segmented<Tab> label="Gráfico de evolução" size="sm" wrap value={tab} onChange={setTab} options={[
            { value: "cum", label: "Lucro acumulado" },
            { value: "capital", label: "Capital" },
            { value: "return", label: "Rentabilidade" },
            { value: "brl", label: "Em reais" },
          ]} />
          {tab === "cum" && (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-mute">Soma do resultado operacional no período (líquido de taxas)</span>
                <span className={cx("text-lg font-extrabold tabular-nums", signClass(d.stats.op))}>{fmtUSD(d.stats.op, true)}</span>
              </div>
              <CumulativeChart points={d.stats.points} height={220} />
            </>
          )}
          {tab === "capital" && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex flex-wrap gap-3 text-xs text-mute">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-pos" />Capital estimado</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-3 bg-sky/30" />Aportes − retiradas</span>
                </span>
                <span className="text-lg font-extrabold tabular-nums">{fmtUSD(d.stats.capitalEnd)}</span>
              </div>
              <CapitalChart points={d.stats.points} height={220} />
              <p className="text-xs text-mute">A distância entre a linha verde e a área azul é o resultado operacional acumulado.</p>
            </>
          )}
          {tab === "return" && (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-mute">{s.return_method === "twr" ? "Ponderada pelo tempo (neutraliza aportes e retiradas)" : `Simples sobre capital-base de ${fmtUSD(s.capital_base)}`}</span>
                <span className={cx("text-lg font-extrabold tabular-nums", signClass(d.stats.twrPct))}>
                  {s.return_method === "twr" ? fmtPct(d.stats.twrPct) : fmtPct(simpleReturn(d.stats.op, s.capital_base))}
                </span>
              </div>
              {s.return_method === "simple" && !s.capital_base ? (
                <p className="py-10 text-center text-sm text-mute">Defina o capital-base em <Link to="/capital" className="text-sky underline">Capital e rentabilidade</Link>.</p>
              ) : (
                <ReturnChart points={d.stats.points} mode={s.return_method} capitalBase={s.capital_base} beforeIndex={beforeIdx} height={220} />
              )}
            </>
          )}
          {tab === "brl" && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex flex-wrap gap-3 text-xs text-mute">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-white" />Patrimônio em R$</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 border-t border-dashed border-sky" />PTAX (eixo direito)</span>
                </span>
              </div>
              <FxEquityChart points={d.stats.points} history={d.fx?.history ?? []} height={220} />
              <p className="text-xs leading-relaxed text-amber-300/90">Mudanças nesta linha também vêm da variação do dólar, não só do resultado das operações.</p>
            </>
          )}
        </Card>

        {/* Capital estimado */}
        <Card className="flex flex-col gap-3 p-4 lg:col-span-5 lg:p-5" aria-labelledby="h-cap">
          <CardHeader id="h-cap" title="Capital estimado" right={<Badge>ESTIMATIVA</Badge>} />
          <KeyValue k={<>Capital inicial <span className="text-xs text-mute">(configurável)</span></>} v={fmtUSD(s.opening_balance)} />
          <KeyValue k="Depósitos" v={fmtUSD(d.totals.deposits, true)} vClass="text-sky" />
          <KeyValue k="Retiradas" v={fmtUSD(-d.totals.withdrawals)} vClass="text-mute-strong" />
          <KeyValue k="Resultado operacional" v={fmtUSD(d.totals.op, true)} vClass={signClass(d.totals.op)}
            sub={`Trades ${fmtUSD(d.totals.trades, true)} · Taxas de performance ${fmtUSD(d.totals.fees, true)}`} />
          <Divider />
          <div className="flex items-baseline justify-between">
            <span className="font-bold">Capital estimado</span>
            <span className="text-xl font-extrabold tabular-nums">{fmtUSD(d.totals.capital)}</span>
          </div>
          <Link to="/capital" className="mt-auto inline-flex min-h-[44px] items-center text-sm font-bold text-sky">Capital e rentabilidade ›</Link>
        </Card>
      </div>

      {/* Indicadores complementares */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
        <Stat small label="Entradas de capital" value={fmtUSD(d.stats.deposits)} valueClass="text-sky" sub="no período" />
        <Stat small label="Saídas de capital" value={fmtUSD(d.stats.withdrawals)} sub="no período" />
        <Stat small label="Melhor dia" value={d.stats.best ? fmtUSD(d.stats.best.op, true) : "—"} valueClass={signClass(d.stats.best?.op)}
          sub={d.stats.best ? fmtDate(d.stats.best.day) : "sem dados"} />
        <Stat small label="Pior dia" value={d.stats.worst ? fmtUSD(d.stats.worst.op, true) : "—"} valueClass={signClass(d.stats.worst?.op)}
          sub={d.stats.worst ? fmtDate(d.stats.worst.day) : "sem dados"} />
        <Stat small label="Movimentações" value={fmtInt(d.stats.txCount)}
          sub={`${d.stats.daysWithData} dia(s) com operação · ${winRate != null ? `${fmtPct(winRate, false, 1)} trades positivos` : "sem trades"}`} />
        <Stat small label="Última importação" value={d.overview?.last_import ? fmtDate((d.overview.last_import.completed_at ?? d.overview.last_import.created_at).slice(0, 10)) : "—"}
          sub={d.overview?.last_import ? `${fmtDateTime(d.overview.last_import.completed_at ?? d.overview.last_import.created_at, s.timezone).slice(11)} · ${d.overview.last_import.inserted_rows} nova(s)` : "nenhuma"} />
      </div>

      <RecentMovements />
    </div>
  );
}
