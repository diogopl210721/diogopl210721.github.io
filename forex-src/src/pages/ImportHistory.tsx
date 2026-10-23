import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCheck, Download, FileClock, Upload } from "lucide-react";
import { PageTitle } from "../components/Layout";
import { Badge, Button, Card, CardHeader, EmptyState, KeyValue, Notice, Skeleton, Spinner } from "../components/ui";
import { api, friendlyError } from "../lib/api";
import { fmtDate, fmtDateTime, fmtInt, fmtUSD, signClass } from "../lib/format";
import { CONFLICT_LABELS, download, ERROR_LABELS, issuesCsv } from "../lib/report";
import type { ImportJob, ImportJobDetail } from "../lib/types";
import { useAuth } from "../state/auth";
import { useData } from "../state/data";
import { ConflictDiff } from "./Import";

export function StatusBadge({ status }: { status: ImportJob["status"] }) {
  if (status === "completed") return <Badge tone="pos">concluída</Badge>;
  if (status === "completed_with_issues") return <Badge tone="warn">com pendências</Badge>;
  if (status === "failed") return <Badge tone="neg">falhou</Badge>;
  return <Badge tone="mute">processando</Badge>;
}

export default function ImportHistory() {
  const { token } = useAuth();
  const { settings } = useData();
  const [rows, setRows] = useState<ImportJob[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    document.title = "Histórico de importações · DDS Finance";
    if (!token) return;
    api.listImports(token, 30, 0).then((r) => { setRows(r.rows); setTotal(r.total); }).catch((e) => setError(friendlyError(e)));
  }, [token]);

  async function loadMore() {
    if (!token || !rows) return;
    setMore(true);
    try {
      const r = await api.listImports(token, 30, rows.length);
      setRows([...rows, ...r.rows]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setMore(false);
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageTitle title="Histórico de importações" sub={`${fmtInt(total)} importação(ões)`}
        right={<Link to="/importar" className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-pos px-4 text-sm font-extrabold text-ink"><Upload className="h-4 w-4" aria-hidden="true" />Nova importação</Link>} />
      {error && <Notice tone="error">{error}</Notice>}
      {!rows && !error && <div className="flex flex-col gap-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {rows && rows.length === 0 && (
        <Card><EmptyState icon={<FileClock className="h-6 w-6" aria-hidden="true" />} title="Nenhuma importação ainda">As importações confirmadas aparecem aqui com o resultado de cada uma.</EmptyState></Card>
      )}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {rows.map((j) => (
            <li key={j.id}>
              <Link to={`/importacoes/${j.id}`} className="block rounded-[18px] border border-ink-700 bg-ink-800 p-4 hover:bg-ink-750">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{j.original_filename}</div>
                    <div className="text-xs text-mute">{fmtDateTime(j.created_at, settings.timezone)}</div>
                  </div>
                  <StatusBadge status={j.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                  <div><div className="text-mute">Linhas</div><div className="font-bold tabular-nums">{fmtInt(j.total_rows)}</div></div>
                  <div><div className="text-mute">Gravadas</div><div className="font-bold tabular-nums text-pos">{fmtInt(j.inserted_rows)}</div></div>
                  <div><div className="text-mute">Existentes</div><div className="font-bold tabular-nums">{fmtInt(j.existing_rows)}</div></div>
                  <div><div className="text-mute">Duplicadas</div><div className="font-bold tabular-nums">{fmtInt(j.duplicate_rows)}</div></div>
                  <div><div className="text-mute">Inválidas</div><div className={`font-bold tabular-nums ${j.rejected_rows ? "text-neg" : ""}`}>{fmtInt(j.rejected_rows)}</div></div>
                  <div><div className="text-mute">Divergências</div><div className={`font-bold tabular-nums ${j.conflict_rows ? "text-amber-300" : ""}`}>{fmtInt(j.conflict_rows)}</div></div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length < total && <Button className="self-center" onClick={loadMore} loading={more}>Carregar mais</Button>}
    </div>
  );
}

export function ImportDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const { settings, reload } = useData();
  const [job, setJob] = useState<ImportJobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    if (!token || !id) return;
    api.getImport(token, id).then(setJob).catch((e) => setError(friendlyError(e)));
  };
  useEffect(() => {
    document.title = "Detalhe da importação · DDS Finance";
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function resolve(cid: string) {
    if (!token) return;
    try {
      await api.resolveConflict(token, cid);
      load();
      reload();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Link to="/importacoes" className="-ml-2 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl px-2 text-sm font-semibold text-sky">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Histórico de importações
      </Link>
      {error && <Notice tone="error">{error}</Notice>}
      {!job && !error && <Spinner />}
      {job && (
        <>
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-extrabold">{job.original_filename}</h1>
                <p className="text-sm text-mute">Importado em {fmtDateTime(job.created_at, settings.timezone)}</p>
              </div>
              <StatusBadge status={job.status} />
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <KeyValue k="Linhas no arquivo" v={fmtInt(job.total_rows)} />
              <KeyValue k="Gravadas" v={fmtInt(job.inserted_rows)} vClass="text-pos" />
              <KeyValue k="Já existentes" v={fmtInt(job.existing_rows)} />
              <KeyValue k="Duplicadas no arquivo" v={fmtInt(job.duplicate_rows)} />
              <KeyValue k="Inválidas" v={fmtInt(job.rejected_rows)} vClass={job.rejected_rows ? "text-neg" : undefined} />
              <KeyValue k="Divergências" v={fmtInt(job.conflict_rows)} vClass={job.conflict_rows ? "text-amber-300" : undefined} />
              <KeyValue k="Sem classificação" v={fmtInt(job.unclassified_rows)} />
              <KeyValue k="Período do arquivo" v={job.period_start ? `${fmtDate(job.period_start.slice(0, 10))} → ${fmtDate(job.period_end?.slice(0, 10))}` : "—"} />
              {job.inserted_op_result != null && <KeyValue k="Resultado adicionado" v={fmtUSD(job.inserted_op_result, true)} vClass={signClass(job.inserted_op_result)} />}
              {job.inserted_deposits != null && <KeyValue k="Depósitos adicionados" v={fmtUSD(job.inserted_deposits, true)} vClass="text-sky" />}
              <KeyValue k="Moedas" v={job.currencies?.join(", ") || "—"} />
              <KeyValue k="Hash SHA-256" v={<span className="text-xs">{job.file_hash.slice(0, 16)}…</span>} />
            </div>
            <Button className="self-start" onClick={() => download(`inconsistencias-${job.original_filename.replace(/\.csv$/i, "")}.csv`, issuesCsv({
              errors: job.error_summary ?? [], conflicts: job.conflicts as never, duplicates: [], unclassified: [],
            }))}>
              <Download className="h-4 w-4" aria-hidden="true" />Baixar relatório de inconsistências
            </Button>
          </Card>

          <Card className="p-5">
            <CardHeader title={`Linhas inválidas (${job.error_summary?.length ?? 0})`} sub="Não foram gravadas. Corrija na origem e envie de novo." />
            {(job.error_summary?.length ?? 0) === 0 ? <p className="mt-2 text-sm text-mute">Nenhuma.</p> : (
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {job.error_summary.map((e, i) => (
                  <li key={i} className="rounded-xl border border-ink-700 px-3 py-2">
                    {e.row ? <span className="font-bold">Linha {e.row}</span> : null}{e.external_id ? ` · ID ${e.external_id}` : ""}{e.row || e.external_id ? " — " : ""}
                    {ERROR_LABELS[e.code] ?? e.code}{e.message ? `: ${e.message}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <CardHeader title={`Divergências (${job.conflicts.length})`} sub="O valor do banco foi mantido. Marque como conferida depois de verificar na plataforma." />
            {job.conflicts.length === 0 ? <p className="mt-2 text-sm text-mute">Nenhuma.</p> : (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {job.conflicts.map((c) => (
                  <li key={c.id} className="rounded-xl border border-amber-400/30 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-bold">ID {c.external_transaction_id}</span>{c.file_row ? ` · linha ${c.file_row}` : ""}</span>
                      {c.resolved_at ? <Badge tone="pos">conferida</Badge> : (
                        <Button className="min-h-[40px]" onClick={() => resolve(c.id)}><CheckCheck className="h-4 w-4" aria-hidden="true" />Marcar como conferida</Button>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-mute">{CONFLICT_LABELS[c.kind] ?? c.kind}</p>
                    <ConflictDiff incoming={c.incoming} existing={c.existing} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
