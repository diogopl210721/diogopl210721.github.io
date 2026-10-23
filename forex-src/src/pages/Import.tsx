import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Download, FileText, FileUp, ListChecks, RotateCcw } from "lucide-react";
import { PageTitle } from "../components/Layout";
import { Badge, Button, Card, CardHeader, cx, Divider, KeyValue, Notice, Sheet, Spinner } from "../components/ui";
import { api, ApiError, friendlyError } from "../lib/api";
import { CsvError, readCsvFile, type ParsedCsv } from "../lib/csv";
import { fmtDate, fmtDateTime, fmtInt, fmtNumber, fmtRawTime, fmtUSD, signClass } from "../lib/format";
import { CONFLICT_LABELS, download, ERROR_LABELS, issuesCsv } from "../lib/report";
import type { ImportReport } from "../lib/types";
import { useAuth } from "../state/auth";
import { useData } from "../state/data";
import { CLASS_LABEL } from "./Movements";

type Step = "select" | "reading" | "preview" | "committing" | "done";

function Steps({ step }: { step: Step }) {
  const idx = step === "select" || step === "reading" ? 0 : step === "done" ? 2 : 1;
  const items = ["Arquivo", "Conferência", "Resultado"];
  return (
    <ol aria-label="Etapas da importação" className="grid grid-cols-3 gap-2 text-xs font-bold">
      {items.map((t, i) => (
        <li key={t} aria-current={i === idx ? "step" : undefined} className={cx("flex flex-col gap-1.5", i === idx ? "text-white" : "text-mute")}>
          <span className={cx("h-1 rounded", i <= idx ? "bg-pos" : "bg-ink-600")} />
          {i + 1} · {t}
        </li>
      ))}
    </ol>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "pos" | "warn" | "neg" }) {
  return (
    <div className={cx("rounded-2xl border p-3.5",
      tone === "pos" ? "border-pos/30 bg-pos/10" : tone === "warn" && value > 0 ? "border-amber-400/30 bg-amber-400/10"
        : tone === "neg" && value > 0 ? "border-neg/40 bg-neg/10" : "border-ink-700 bg-ink-800")}>
      <div className="text-xs font-semibold text-mute">{label}</div>
      <div className={cx("mt-1 text-2xl font-extrabold tabular-nums", tone === "pos" && "text-pos",
        tone === "warn" && value > 0 && "text-amber-300", tone === "neg" && value > 0 && "text-neg")}>{fmtInt(value)}</div>
    </div>
  );
}

export function IssuesSheet({ open, onClose, report }: { open: boolean; onClose: () => void; report: Pick<ImportReport, "errors" | "conflicts" | "duplicates" | "unclassified"> }) {
  return (
    <Sheet open={open} onClose={onClose} title="Erros e inconsistências" wide>
      <div className="flex flex-col gap-5 text-sm">
        <section>
          <h3 className="mb-2 font-bold">Linhas inválidas ({report.errors.length})</h3>
          {report.errors.length === 0 ? <p className="text-mute">Nenhuma.</p> : (
            <ul className="flex flex-col gap-1.5">
              {report.errors.map((e, i) => (
                <li key={i} className="rounded-xl border border-ink-700 px-3 py-2">
                  <span className="font-bold">Linha {e.row}</span>{e.external_id ? ` · ID ${e.external_id}` : ""} — {ERROR_LABELS[e.code] ?? e.code}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 font-bold">Divergências ({report.conflicts.length})</h3>
          {report.conflicts.length === 0 ? <p className="text-mute">Nenhuma.</p> : (
            <ul className="flex flex-col gap-1.5">
              {report.conflicts.map((c, i) => (
                <li key={i} className="rounded-xl border border-amber-400/30 px-3 py-2">
                  <span className="font-bold">Linha {c.row} · ID {c.external_id}</span> — {CONFLICT_LABELS[c.kind] ?? c.kind}
                  <ConflictDiff incoming={c.incoming} existing={c.existing} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 font-bold">Repetidas no arquivo ({report.duplicates.length})</h3>
          {report.duplicates.length === 0 ? <p className="text-mute">Nenhuma.</p> : (
            <p className="text-mute">IDs repetidos com valores idênticos, importados uma única vez: {report.duplicates.slice(0, 50).map((d) => d.external_id).join(", ")}{report.duplicates.length > 50 ? "…" : ""}</p>
          )}
        </section>
        <section>
          <h3 className="mb-2 font-bold">Tipos sem classificação ({report.unclassified.length})</h3>
          {report.unclassified.length === 0 ? <p className="text-mute">Nenhum.</p> : (
            <p className="text-mute">Serão gravados e sinalizados, mas ficam fora dos cálculos até existir uma regra: {report.unclassified.slice(0, 30).map((u) => `${u.reason} (ID ${u.external_id})`).join(", ")}</p>
          )}
        </section>
      </div>
    </Sheet>
  );
}

export function ConflictDiff({ incoming, existing }: { incoming: unknown; existing: unknown }) {
  const inc = (incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {}) as Record<string, unknown>;
  const ex = (existing && typeof existing === "object" ? existing : {}) as Record<string, unknown>;
  const keys = Object.keys(inc).filter((k) => String(inc[k] ?? "") !== String(ex[k] ?? ""));
  if (!keys.length || !existing) return null;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-mute"><th className="py-1 pr-3 font-semibold">Campo</th><th className="py-1 pr-3 font-semibold">No banco</th><th className="py-1 font-semibold">No arquivo</th></tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}><td className="py-1 pr-3 text-mute">{k}</td><td className="py-1 pr-3 font-semibold">{String(ex[k] ?? "")}</td><td className="py-1 font-semibold text-amber-300">{String(inc[k] ?? "")}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Import() {
  const { token } = useAuth();
  const data = useData();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<ParsedCsv | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [result, setResult] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tz = data.settings.timezone;

  useEffect(() => {
    document.title = "Importar arquivo · DDS Finance";
  }, []);

  async function handleFile(f: File | undefined | null) {
    if (!f || !token) return;
    setError(null);
    setStep("reading");
    try {
      const parsed = await readCsvFile(f);
      setFile(parsed);
      const r = await api.analyzeImport(token, parsed.payload, parsed.hash);
      setReport(r);
      setStep("preview");
    } catch (e) {
      setStep("select");
      setFile(null);
      setError(e instanceof CsvError ? e.message : friendlyError(e));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function commit() {
    if (!file || !token) return;
    setError(null);
    setStep("committing");
    try {
      const r = await api.commitImport(token, file.payload, file.filename, file.hash);
      setResult(r);
      setStep("done");
      data.reload();
    } catch (e) {
      const msg = friendlyError(e);
      setError(msg);
      setStep("preview");
      if (!(e instanceof ApiError && e.isAuth)) {
        api.logFailedImport(token, file.filename, file.hash, file.totalRows, e instanceof ApiError ? e.message : String(e)).catch(() => undefined);
      }
    }
  }

  function reset() {
    setStep("select");
    setFile(null);
    setReport(null);
    setResult(null);
    setError(null);
  }

  const issues = report ? report.invalid_rows + report.conflict_rows + report.duplicate_rows + report.unclassified_new_rows : 0;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle title={step === "preview" || step === "committing" ? "Conferir importação" : step === "done" ? "Importação concluída" : "Importar arquivo"}
        sub="Exportação completa da plataforma (transactions.csv). Só os IDs que ainda não existem são gravados." />
      <Steps step={step} />

      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}

      {(step === "select" || step === "reading") && (
        <Card className="p-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
            className={cx("flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-10 text-center transition",
              dragOver ? "border-pos bg-pos/5" : "border-ink-600")}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-deep text-sky"><FileUp className="h-7 w-7" aria-hidden="true" /></div>
            {step === "reading" ? (
              <Spinner label="Lendo e conferindo o arquivo…" />
            ) : (
              <>
                <div>
                  <div className="text-base font-bold">Selecione o arquivo CSV</div>
                  <p className="mt-1 text-sm text-mute">ou arraste até aqui · até 10 MB</p>
                </div>
                <label className="inline-flex min-h-[52px] cursor-pointer items-center gap-2 rounded-2xl bg-pos px-6 text-base font-extrabold text-ink hover:brightness-105 focus-within:outline focus-within:outline-2 focus-within:outline-white">
                  <FileText className="h-5 w-5" aria-hidden="true" />Escolher arquivo
                  <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
                </label>
              </>
            )}
          </div>
          <ul className="mt-5 flex flex-col gap-2 text-sm leading-relaxed text-mute">
            <li>• Pode enviar sempre o arquivo completo, com registros antigos e novos: os já importados são reconhecidos pelo Id e ignorados.</li>
            <li>• Nada é gravado antes da sua confirmação na tela de conferência.</li>
            <li>• Se um Id já gravado vier com valores diferentes, ele não é sobrescrito: fica registrado como divergência.</li>
          </ul>
        </Card>
      )}

      {(step === "preview" || step === "committing") && report && file && (
        <>
          <Card className="flex items-center gap-3.5 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-deep text-sky"><FileText className="h-5 w-5" aria-hidden="true" /></div>
            <div className="min-w-0">
              <div className="truncate font-bold">{file.filename}</div>
              <div className="text-xs text-mute">{(file.size / 1024).toFixed(0)} KB · {file.payload.columns.length} colunas · {fmtInt(file.totalRows)} linhas</div>
            </div>
          </Card>

          {report.already_imported_file && (
            <Notice tone="info" title="Este mesmo arquivo já foi importado">
              Em {fmtDateTime(report.already_imported_file.created_at, tz)}. Importar de novo não duplica nada.
            </Notice>
          )}

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Count label="Linhas no arquivo" value={report.total_rows} />
            <Count label="IDs novos" value={report.new_rows} tone="pos" />
            <Count label="Já existentes" value={report.existing_rows} />
            <Count label="Duplicadas no arquivo" value={report.duplicate_rows} tone="warn" />
            <Count label="Inválidas" value={report.invalid_rows} tone="neg" />
            <Count label="Divergências" value={report.conflict_rows} tone="warn" />
          </div>

          <Card className="flex flex-col gap-2.5 p-4" aria-labelledby="h-impact">
            <h2 id="h-impact" className="font-bold">Impacto dos registros novos</h2>
            <KeyValue k="Resultado operacional" v={fmtUSD(report.impact.op_result, true)} vClass={signClass(report.impact.op_result)}
              sub={`Trades ${fmtUSD(report.impact.trade_result, true)} · Taxas ${fmtUSD(report.impact.fee_result, true)}`} />
            <KeyValue k="Entradas de capital" v={fmtUSD(report.impact.deposits, true)} vClass="text-sky" />
            <KeyValue k="Saídas de capital" v={fmtUSD(-report.impact.withdrawals)} vClass="text-mute-strong" />
            {report.other_currency_new_rows > 0 && <p className="text-xs text-amber-300">{report.other_currency_new_rows} registro(s) em outra moeda ficam fora dos totais em {report.reference_currency}.</p>}
          </Card>

          {(report.conflict_rows > 0 || report.unclassified_new_rows > 0 || report.trade_amount_mismatch_rows > 0 || file.parseWarnings.length > 0) && (
            <Notice tone="warn" title="Pontos para conferir">
              <ul className="flex flex-col gap-1">
                {report.conflict_rows > 0 && <li>{report.conflict_rows} linha(s) com Id já conhecido e valores diferentes: não serão sobrescritas.</li>}
                {report.unclassified_new_rows > 0 && <li>{report.unclassified_new_rows} linha(s) com tipo (Reason) sem regra: serão gravadas e ficarão fora dos cálculos.</li>}
                {report.trade_amount_mismatch_rows > 0 && <li>{report.trade_amount_mismatch_rows} TradeResults com Amount diferente de AmountProfit (o cálculo usa AmountProfit).</li>}
                {file.parseWarnings.slice(0, 5).map((w) => <li key={w}>{w}</li>)}
              </ul>
            </Notice>
          )}

          <div className="flex flex-col gap-2.5 rounded-[22px] border border-ink-700 bg-ink-850 p-3">
            <Button variant="primary" className="h-[54px] text-base" loading={step === "committing"} onClick={commit}>
              {step === "committing" ? "Gravando…" : report.new_rows > 0 ? `Confirmar importação de ${fmtInt(report.new_rows)}` : "Confirmar (nenhum registro novo)"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setIssuesOpen(true)} disabled={issues === 0}><ListChecks className="h-4 w-4" aria-hidden="true" />Ver erros ({issues})</Button>
              <Button onClick={() => download(`inconsistencias-${file.filename.replace(/\.csv$/i, "")}.csv`, issuesCsv(report))}>
                <Download className="h-4 w-4" aria-hidden="true" />Relatório
              </Button>
            </div>
            <Button variant="ghost" onClick={reset} disabled={step === "committing"}>Cancelar</Button>
          </div>

          <Card className="flex flex-col gap-3 p-4">
            <KeyValue k="Período do arquivo" v={report.period_start ? `${fmtDate(report.period_start.slice(0, 10))} → ${fmtDate(report.period_end?.slice(0, 10))}` : "—"} />
            {report.new_rows > 0 && report.new_period_start && (
              <KeyValue k="Período dos novos" v={`${fmtDateTime(report.new_period_start, tz)} → ${fmtDateTime(report.new_period_end, tz)}`} />
            )}
            <KeyValue k="Moedas" v={report.currencies.join(", ") || "—"} />
            <Divider />
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.reasons).map(([k, v]) => <Badge key={k} tone={["TradeResults", "PerformanceFee", "Deposit", "Withdrawal"].includes(k) ? "mute" : "warn"}>{k} {fmtInt(v)}</Badge>)}
            </div>
          </Card>

          {report.sample.length > 0 && (
            <section aria-labelledby="h-sample" className="flex flex-col gap-2">
              <h2 id="h-sample" className="font-bold">Amostra dos novos (primeiros e últimos)</h2>
              {report.sample.map((r) => (
                <div key={r.row} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-700 bg-ink-800 px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold">{CLASS_LABEL[r.classification as keyof typeof CLASS_LABEL] ?? r.reason}</div>
                    <div className="truncate text-xs text-mute">Linha {r.row} · ID {r.external_id} · {fmtRawTime(r.time)}</div>
                    {r.classification === "performance_fee" && <div className="text-xs text-mute">Amount {fmtNumber(r.amount)} · AmountProfit {fmtNumber(r.amount_profit)}</div>}
                  </div>
                  <span className={cx("font-extrabold tabular-nums", r.classification === "deposit" || r.classification === "withdrawal" ? "text-sky" : signClass(r.op_result))}>
                    {r.classification === "deposit" || r.classification === "withdrawal" ? fmtNumber(r.capital_flow, true) : fmtNumber(r.op_result, true)}
                  </span>
                </div>
              ))}
            </section>
          )}

          <IssuesSheet open={issuesOpen} onClose={() => setIssuesOpen(false)} report={report} />
        </>
      )}

      {step === "done" && result && (
        <>
          <Card className="flex flex-col items-center gap-3 p-6 text-center">
            {result.status === "completed"
              ? <CheckCircle2 className="h-12 w-12 text-pos" aria-hidden="true" />
              : <AlertTriangle className="h-12 w-12 text-amber-300" aria-hidden="true" />}
            <div className="text-xl font-extrabold">{fmtInt(result.inserted_rows ?? 0)} movimentação(ões) gravada(s)</div>
            <p className="max-w-md text-sm text-mute">
              {result.status === "completed" ? "Importação concluída sem pendências." : "Importação concluída com pontos para conferir. Nada foi sobrescrito."}
              {(result.race_skipped_rows ?? 0) > 0 && ` ${result.race_skipped_rows} registro(s) já tinham sido gravados por outra importação simultânea.`}
            </p>
          </Card>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Count label="Gravadas agora" value={result.inserted_rows ?? 0} tone="pos" />
            <Count label="Já existentes (ignoradas)" value={result.existing_rows + (result.race_skipped_rows ?? 0)} />
            <Count label="Duplicadas no arquivo" value={result.duplicate_rows} tone="warn" />
            <Count label="Inválidas" value={result.invalid_rows} tone="neg" />
            <Count label="Divergências" value={result.conflict_rows} tone="warn" />
            <Count label="Sem classificação" value={result.unclassified_new_rows} tone="warn" />
          </div>
          <Card className="flex flex-col gap-2.5 p-4">
            <KeyValue k="Resultado operacional adicionado" v={fmtUSD(result.impact.op_result, true)} vClass={signClass(result.impact.op_result)} />
            <KeyValue k="Depósitos adicionados" v={fmtUSD(result.impact.deposits, true)} vClass="text-sky" />
            <KeyValue k="Retiradas adicionadas" v={fmtUSD(-result.impact.withdrawals)} />
          </Card>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" className="flex-1" onClick={() => navigate("/")}>Ver dashboard</Button>
            {result.import_job_id && <Link to={`/importacoes/${result.import_job_id}`} className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-2xl border border-ink-600 bg-ink-800 px-4 text-sm font-bold">Detalhes da importação</Link>}
            <Button className="flex-1" onClick={reset}><RotateCcw className="h-4 w-4" aria-hidden="true" />Importar outro</Button>
          </div>
        </>
      )}

      {step === "select" && data.overview?.last_import && (
        <Card className="p-4">
          <CardHeader title="Última importação" right={<Link to="/importacoes" className="inline-flex min-h-[44px] items-center text-sm font-bold text-sky">Histórico ›</Link>} />
          <p className="mt-2 text-sm text-mute">
            {data.overview.last_import.original_filename} · {fmtDateTime(data.overview.last_import.created_at, tz)} · {fmtInt(data.overview.last_import.inserted_rows)} gravada(s)
          </p>
        </Card>
      )}
    </div>
  );
}
