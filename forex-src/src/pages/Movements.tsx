import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, CircleHelp, Percent, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { PageTitle } from "../components/Layout";
import { Badge, Button, Card, CardHeader, cx, EmptyState, Field, inputCls, KeyValue, Notice, Segmented, Skeleton, Spinner } from "../components/ui";
import { api, friendlyError } from "../lib/api";
import { todayIn } from "../lib/dates";
import { fmtDate, fmtDateTime, fmtDayLong, fmtInt, fmtNumber, fmtRawTime, fmtTime, fmtUSD, signClass } from "../lib/format";
import { CONFLICT_LABELS } from "../lib/report";
import type { Classification, TransactionDetail, TransactionPage, TransactionRow } from "../lib/types";
import { useAuth } from "../state/auth";
import { useData } from "../state/data";

export const CLASS_LABEL: Record<Classification, string> = {
  trade: "Trade",
  performance_fee: "Taxa de performance",
  deposit: "Depósito",
  withdrawal: "Retirada",
  unclassified: "Sem classificação",
};

export function TxIcon({ row }: { row: Pick<TransactionRow, "classification" | "op_result"> }) {
  const base = "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]";
  switch (row.classification) {
    case "trade":
      return row.op_result < 0
        ? <span className={cx(base, "bg-neg/15 text-neg")}><TrendingDown className="h-[18px] w-[18px]" aria-hidden="true" /></span>
        : <span className={cx(base, "bg-pos/15 text-pos")}><TrendingUp className="h-[18px] w-[18px]" aria-hidden="true" /></span>;
    case "performance_fee":
      return <span className={cx(base, "bg-ink-700 text-mute-strong")}><Percent className="h-[18px] w-[18px]" aria-hidden="true" /></span>;
    case "deposit":
      return <span className={cx(base, "bg-sky-deep text-sky")}><ArrowDownToLine className="h-[18px] w-[18px]" aria-hidden="true" /></span>;
    case "withdrawal":
      return <span className={cx(base, "bg-sky-deep text-sky")}><ArrowUpFromLine className="h-[18px] w-[18px]" aria-hidden="true" /></span>;
    default:
      return <span className={cx(base, "bg-amber-400/15 text-amber-300")}><CircleHelp className="h-[18px] w-[18px]" aria-hidden="true" /></span>;
  }
}

/** Valor considerado nos cálculos, com o texto certo para cada tipo. */
export function ConsideredValue({ row, className }: { row: Pick<TransactionRow, "classification" | "op_result" | "capital_flow" | "amount_profit">; className?: string }) {
  if (row.classification === "deposit") return <span className={cx("font-extrabold tabular-nums text-sky", className)}>{fmtNumber(row.capital_flow, true)}</span>;
  if (row.classification === "withdrawal") return <span className={cx("font-extrabold tabular-nums text-mute-strong", className)}>{fmtNumber(row.capital_flow)}</span>;
  if (row.classification === "unclassified") return <span className={cx("text-xs font-bold text-amber-300", className)}>fora do cálculo</span>;
  return <span className={cx("font-extrabold tabular-nums", signClass(row.op_result), className)}>{fmtNumber(row.op_result, true)}</span>;
}

function subline(r: TransactionRow, tz: string): string {
  const t = fmtTime(r.transaction_time, tz);
  if (r.classification === "deposit" || r.classification === "withdrawal") return `ID ${r.external_transaction_id} · ${t} · não é lucro/prejuízo`;
  if (r.classification === "performance_fee") return `ID ${r.external_transaction_id} · ${t} · fechamento semanal`;
  return `ID ${r.external_transaction_id} · ${t}`;
}

function MovementList({ rows, days, tz }: { rows: TransactionRow[]; days?: TransactionPage["days"]; tz: string }) {
  const groups = useMemo(() => {
    const out: Array<{ date: string; rows: TransactionRow[] }> = [];
    for (const r of rows) {
      const g = out[out.length - 1];
      if (g && g.date === r.local_date) g.rows.push(r);
      else out.push({ date: r.local_date, rows: [r] });
    }
    return out;
  }, [rows]);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const tot = days?.[g.date];
        return (
          <section key={g.date} aria-label={fmtDayLong(g.date)} className="flex flex-col gap-2">
            <div className="flex justify-between px-0.5 text-[13px] font-bold text-mute">
              <span className="capitalize">{fmtDayLong(g.date)}{tot ? ` · ${tot.count} mov.` : ""}</span>
              {tot && <span className={signClass(tot.op_result)}>{fmtUSD(tot.op_result, true)}</span>}
            </div>
            <ul className="overflow-hidden rounded-[18px] border border-ink-700 bg-ink-800">
              {g.rows.map((r, i) => (
                <li key={r.id} className={cx(i > 0 && "border-t border-ink-700")}>
                  <Link to={`/movimentacoes/${r.id}`} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2.5 hover:bg-ink-750">
                    <TxIcon row={r} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-bold">{CLASS_LABEL[r.classification]}</span>
                      <span className="truncate text-xs text-mute">{subline(r, tz)}</span>
                    </span>
                    <ConsideredValue row={r} className="text-[15px]" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MovementTable({ rows, tz }: { rows: TransactionRow[]; tz: string }) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-xs text-mute">
            {["Data e hora", "ID", "Tipo", "Amount", "AmountProfit", "Considerado"].map((h, i) => (
              <th key={h} scope="col" className={cx("border-b border-ink-600 px-2 py-2.5 font-semibold", i >= 3 && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-ink-750" onClick={() => navigate(`/movimentacoes/${r.id}`)}>
              <td className="border-b border-ink-700 px-2 py-2.5 tabular-nums">{fmtDateTime(r.transaction_time, tz)}</td>
              <td className="border-b border-ink-700 px-2 py-2.5 text-mute">
                <Link to={`/movimentacoes/${r.id}`} className="hover:text-white" onClick={(e) => e.stopPropagation()}>{r.external_transaction_id}</Link>
              </td>
              <td className="border-b border-ink-700 px-2 py-2.5">{CLASS_LABEL[r.classification]}</td>
              <td className="border-b border-ink-700 px-2 py-2.5 text-right tabular-nums">{fmtNumber(r.amount)}</td>
              <td className="border-b border-ink-700 px-2 py-2.5 text-right tabular-nums">{fmtNumber(r.amount_profit)}</td>
              <td className="border-b border-ink-700 px-2 py-2.5 text-right">
                {r.classification === "deposit" || r.classification === "withdrawal"
                  ? <span className={cx("font-bold", r.classification === "deposit" ? "text-sky" : "text-mute-strong")}>capital {fmtNumber(r.capital_flow, true)}</span>
                  : <ConsideredValue row={r} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecentMovements() {
  const { token } = useAuth();
  const { settings, overview } = useData();
  const [page, setPage] = useState<TransactionPage | null>(null);
  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();
    api.listTransactions(token, {}, 8, 0, ac.signal).then(setPage).catch(() => { /* card fica oculto */ });
    return () => ac.abort();
  }, [token, overview?.last_import?.id]);
  if (!page?.rows.length) return null;
  return (
    <Card className="p-4 lg:p-5" aria-labelledby="h-recent">
      <CardHeader id="h-recent" title="Movimentações recentes"
        right={<Link to="/movimentacoes" className="inline-flex min-h-[44px] items-center text-sm font-bold text-sky">Ver todas ›</Link>} />
      <div className="mt-2 hidden lg:block"><MovementTable rows={page.rows} tz={settings.timezone} /></div>
      <div className="mt-3 lg:hidden"><MovementList rows={page.rows.slice(0, 5)} tz={settings.timezone} /></div>
    </Card>
  );
}

type TypeFilter = "" | "trade" | "performance_fee" | "capital" | "deposit" | "withdrawal" | "unclassified";
const PAGE = 50;

export default function Movements() {
  const { token } = useAuth();
  const { settings, period, overview } = useData();
  const [type, setType] = useState<TypeFilter>("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<TransactionPage | null>(null);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    document.title = "Movimentações · DDS Finance";
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (type) f.classification = type;
    if (qDebounced) f.q = qDebounced;
    if (from) f.date_from = from;
    if (to) f.date_to = to;
    return f;
  }, [type, qDebounced, from, to]);

  const load = useCallback(async (offset: number) => {
    if (!token) return;
    const id = ++reqId.current;
    offset ? setMore(true) : setLoading(true);
    setError(null);
    try {
      const page = await api.listTransactions(token, filters, PAGE, offset);
      if (id !== reqId.current) return;
      setData(page);
      setRows((prev) => (offset ? [...prev, ...page.rows] : page.rows));
    } catch (e) {
      if (id === reqId.current) setError(friendlyError(e));
    } finally {
      if (id === reqId.current) { setLoading(false); setMore(false); }
    }
  }, [token, filters]);

  useEffect(() => { load(0); }, [load]);

  const hasFilters = !!(type || qDebounced || from || to);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Movimentações" sub={`${fmtInt(overview?.transactions_total ?? 0)} no total${data && hasFilters ? ` · ${fmtInt(data.total)} no filtro` : ""}`} />

      <div className="flex flex-col gap-3">
        <div className="flex h-12 items-center gap-2.5 rounded-2xl border border-ink-700 bg-ink-800 px-3.5 focus-within:border-sky">
          <Search className="h-[18px] w-[18px] text-mute" aria-hidden="true" />
          <label htmlFor="mv-q" className="sr-only">Buscar por ID ou tipo</label>
          <input id="mv-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ID ou tipo (ex.: Deposit)"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-400" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Limpar busca" className="-mr-2 flex h-11 w-11 items-center justify-center text-mute"><X className="h-4 w-4" /></button>}
        </div>
        <Segmented<TypeFilter> label="Tipo de movimentação" value={type} onChange={setType} options={[
          { value: "", label: "Todas" },
          { value: "trade", label: "Trades" },
          { value: "performance_fee", label: "Taxas" },
          { value: "deposit", label: "Depósitos" },
          { value: "withdrawal", label: "Retiradas" },
          { value: "unclassified", label: "Sem classificação" },
        ]} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[calc(50%-6px)] sm:w-44"><Field label="De" htmlFor="mv-from"><input id="mv-from" type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field></div>
          <div className="w-[calc(50%-6px)] sm:w-44"><Field label="Até" htmlFor="mv-to"><input id="mv-to" type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
          <Button onClick={() => { setFrom(period.from); setTo(period.to); }}>Usar período do painel</Button>
          {hasFilters && <Button variant="ghost" onClick={() => { setType(""); setQ(""); setFrom(""); setTo(""); }}>Limpar filtros</Button>}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <div className="flex flex-col gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : !rows.length ? (
        <Card><EmptyState title={hasFilters ? "Nada encontrado com esses filtros" : "Nenhuma movimentação ainda"}>
          {hasFilters ? "Ajuste a busca ou limpe os filtros." : <Link to="/importar" className="text-sky underline">Importe o arquivo da plataforma</Link>}
        </EmptyState></Card>
      ) : (
        <>
          <Card className="hidden p-4 lg:block"><MovementTable rows={rows} tz={settings.timezone} /></Card>
          <div className="lg:hidden"><MovementList rows={rows} days={data?.days} tz={settings.timezone} /></div>
          {data && rows.length < data.total && (
            <Button onClick={() => load(rows.length)} loading={more} className="self-center">
              Carregar mais ({fmtInt(data.total - rows.length)} restantes)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

const RULES: Record<Classification, string> = {
  trade: "Resultado operacional = AmountProfit.",
  performance_fee: "Resultado operacional = Amount (a taxa debitada). O AmountProfit desta linha é o lucro da semana liquidado no fechamento e fica só para auditoria.",
  deposit: "Entrada de capital = Amount. Não conta como lucro.",
  withdrawal: "Saída de capital = |Amount|. Não conta como prejuízo.",
  unclassified: "Tipo (Reason) sem regra documentada: guardado e sinalizado, fora de todos os cálculos.",
};

export function MovementDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const { settings } = useData();
  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.title = "Detalhe da movimentação · DDS Finance";
    if (!token || !id) return;
    api.getTransaction(token, id).then(setTx).catch((e) => setError(friendlyError(e)));
  }, [token, id]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link to="/movimentacoes" className="-ml-2 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl px-2 text-sm font-semibold text-sky">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Movimentações
      </Link>
      {error && <Notice tone="error">{error}</Notice>}
      {!tx && !error && <Spinner />}
      {tx && (
        <>
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <TxIcon row={tx} />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-extrabold">{CLASS_LABEL[tx.classification]}</h1>
                <p className="text-sm text-mute">ID {tx.external_transaction_id} · {fmtDateTime(tx.transaction_time, settings.timezone, true)}</p>
              </div>
              <ConsideredValue row={tx} className="text-xl" />
            </div>
            <Notice tone={tx.classification === "unclassified" ? "warn" : "info"} title="Como entra nos cálculos">{RULES[tx.classification]}</Notice>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <KeyValue k="Reason (original)" v={tx.reason} />
              <KeyValue k="Moeda" v={tx.currency} />
              <KeyValue k="Amount" v={fmtNumber(tx.amount)} />
              <KeyValue k="AmountProfit" v={fmtNumber(tx.amount_profit)} />
              <KeyValue k="Resultado operacional" v={fmtUSD(tx.op_result, true)} vClass={signClass(tx.op_result)} />
              <KeyValue k="Fluxo de capital" v={fmtUSD(tx.capital_flow, true)} />
              <KeyValue k="Horário no arquivo" v={fmtRawTime(tx.time_raw)} />
              <KeyValue k="Dia considerado" v={fmtDate(todayIn(settings.timezone, new Date(tx.transaction_time)))} sub={`fuso ${settings.timezone}`} />
              <KeyValue k="Importado em" v={tx.import ? fmtDateTime(tx.import.created_at, settings.timezone) : "—"}
                sub={tx.import ? <Link to={`/importacoes/${tx.import.id}`} className="text-sky underline">{tx.import.original_filename}</Link> : undefined} />
              <KeyValue k="Regra de classificação" v={`versão ${tx.rule_version}`} />
            </div>
          </Card>

          {tx.conflicts.length > 0 && (
            <Card className="flex flex-col gap-3 p-5">
              <CardHeader title="Divergências registradas" sub="Importações posteriores trouxeram este ID com valores diferentes. O registro acima foi mantido." />
              {tx.conflicts.map((c) => (
                <div key={c.id} className="rounded-2xl border border-ink-600 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{CONFLICT_LABELS[c.kind] ?? c.kind}</span>
                    {c.resolved_at ? <Badge tone="pos">conferida</Badge> : <Badge tone="warn">pendente</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-mute">{fmtDateTime(c.created_at, settings.timezone)}</p>
                </div>
              ))}
            </Card>
          )}

          <Card className="p-5" aria-labelledby="h-orig">
            <CardHeader id="h-orig" title="Dados originais da planilha" sub="Valores brutos preservados para auditoria" />
            <dl className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {Object.entries(tx.original_payload).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-ink-700 py-2 text-[13px]">
                  <dt className="text-mute">{k}</dt>
                  <dd className="break-all text-right font-semibold">{v === "" || v == null ? <span className="text-ink-400">vazio</span> : String(v)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 break-all text-[11px] text-mute">Impressão digital: {tx.fingerprint}</p>
          </Card>
        </>
      )}
    </div>
  );
}
