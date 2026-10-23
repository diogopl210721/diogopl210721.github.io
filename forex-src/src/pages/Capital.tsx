import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { CapitalChart, ReturnChart } from "../components/charts/Charts";
import { PageTitle, PeriodSelector } from "../components/Layout";
import { Badge, Button, Card, CardHeader, cx, Divider, Field, inputCls, KeyValue, Notice, Segmented } from "../components/ui";
import { api, friendlyError } from "../lib/api";
import { fmtMonth, fmtPct, fmtUSD, signClass } from "../lib/format";
import { monthly, simpleReturn } from "../lib/metrics";
import { useAuth } from "../state/auth";
import { useData } from "../state/data";

function parseMoney(v: string): number | null {
  const t = v.trim().replace(/\s/g, "");
  if (!t) return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}
const toInput = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

export default function Capital() {
  const { token, setSettings } = useAuth();
  const d = useData();
  const s = d.settings;
  const [opening, setOpening] = useState(toInput(s.opening_balance));
  const [base, setBase] = useState(toInput(s.capital_base));
  const [method, setMethod] = useState<"twr" | "simple">(s.return_method);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    document.title = "Capital e rentabilidade · DDS Finance";
  }, []);
  useEffect(() => {
    setOpening(toInput(s.opening_balance));
    setBase(toInput(s.capital_base));
    setMethod(s.return_method);
  }, [s.opening_balance, s.capital_base, s.return_method]);

  const months = useMemo(() => monthly(d.timeline).reverse(), [d.timeline]);
  const beforeIdx = useMemo(() => [...d.timeline].reverse().find((p) => p.day < d.period.from)?.twrIndex ?? 1, [d.timeline, d.period.from]);
  const netDeposits = d.totals.deposits - d.totals.withdrawals;
  const simpleAll = simpleReturn(d.totals.op, s.capital_base);

  async function save() {
    setMsg(null);
    const o = parseMoney(opening);
    const b = parseMoney(base);
    if (o == null || Number.isNaN(o) || o < 0) return setMsg({ tone: "error", text: "Capital inicial inválido (use 0 se começou pelo primeiro depósito)." });
    if (b != null && (Number.isNaN(b) || b <= 0)) return setMsg({ tone: "error", text: "Capital-base deve ser maior que zero, ou deixe em branco." });
    setBusy(true);
    try {
      const ns = await api.updateSettings(token!, { opening_balance: o, capital_base: b, timezone: s.timezone, source_timezone: s.source_timezone, return_method: method });
      setSettings(ns);
      setMsg({ tone: "ok", text: "Configuração salva. Indicadores recalculados." });
    } catch (e) {
      setMsg({ tone: "error", text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Capital e rentabilidade" sub="Como o capital estimado e a rentabilidade são calculados" />
      <div className="-mx-4 px-4 lg:hidden"><PeriodSelector /></div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <Card className="flex flex-col gap-3 p-5 lg:col-span-5" aria-labelledby="h-comp">
          <CardHeader id="h-comp" title="Composição do capital" right={<Badge>ESTIMATIVA</Badge>} />
          <KeyValue k="Capital inicial configurado" v={fmtUSD(s.opening_balance)} />
          <KeyValue k="Total de depósitos" v={fmtUSD(d.totals.deposits, true)} vClass="text-sky" />
          <KeyValue k="Total de retiradas" v={fmtUSD(-d.totals.withdrawals)} vClass="text-mute-strong" />
          <KeyValue k="Resultado operacional acumulado" v={fmtUSD(d.totals.op, true)} vClass={signClass(d.totals.op)}
            sub={`Trades ${fmtUSD(d.totals.trades, true)} · Taxas de performance ${fmtUSD(d.totals.fees, true)}`} />
          <Divider />
          <div className="flex items-baseline justify-between">
            <span className="font-bold">Capital estimado atual</span>
            <span className="text-2xl font-extrabold tabular-nums">{fmtUSD(d.totals.capital)}</span>
          </div>
          <p className="text-xs leading-relaxed text-mute">
            Capital estimado = capital inicial + depósitos − retiradas + resultado operacional. Não é o saldo confirmado pela plataforma;
            se houver diferença, confira o capital inicial e se o arquivo está completo.
          </p>
        </Card>

        <Card className="flex flex-col gap-4 p-5 lg:col-span-7" aria-labelledby="h-ret">
          <CardHeader id="h-ret" title="Rentabilidade" />
          <div className="grid grid-cols-2 gap-3">
            <div className={cx("rounded-2xl border p-3.5", s.return_method === "twr" ? "border-pos/40 bg-pos/5" : "border-ink-700")}>
              <div className="text-xs font-semibold text-mute">Ponderada pelo tempo (TWR)</div>
              <div className={cx("mt-1 text-2xl font-extrabold tabular-nums", signClass(d.totals.twrPct))}>{fmtPct(d.totals.twrPct)}</div>
              <div className="text-xs text-mute">todo o histórico</div>
            </div>
            <div className={cx("rounded-2xl border p-3.5", s.return_method === "simple" ? "border-pos/40 bg-pos/5" : "border-ink-700")}>
              <div className="text-xs font-semibold text-mute">Simples sobre capital-base</div>
              <div className={cx("mt-1 text-2xl font-extrabold tabular-nums", signClass(simpleAll))}>{simpleAll != null ? fmtPct(simpleAll) : "—"}</div>
              <div className="text-xs text-mute">{s.capital_base ? `base ${fmtUSD(s.capital_base)}` : "defina o capital-base"}</div>
            </div>
          </div>
          <div className="text-sm leading-relaxed text-mute-strong">
            <p><strong className="text-white">TWR</strong>: encadeia o resultado de cada dia sobre o capital do início do dia, então aportes e retiradas não distorcem o percentual. Aportes e retiradas são considerados no início do dia em que ocorreram.</p>
            <p className="mt-2"><strong className="text-white">Simples</strong>: resultado acumulado ÷ capital-base × 100. Fácil de ler, mas não se ajusta a aportes e retiradas ao longo do tempo.</p>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-4 p-5" aria-labelledby="h-cfg">
        <CardHeader id="h-cfg" title="Configuração" sub="Usada nos cálculos do dashboard" />
        <form className="grid grid-cols-1 gap-4 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label="Capital inicial (USD)" htmlFor="cap-open" hint="Saldo antes do primeiro registro do arquivo. Use 0 se a conta começou pelo primeiro depósito.">
            <input id="cap-open" inputMode="decimal" className={inputCls} value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Capital-base (USD)" htmlFor="cap-base" hint={<>Base da rentabilidade simples. Depósitos − retiradas hoje: <button type="button" className="font-bold text-sky underline" onClick={() => setBase(toInput(Math.round(netDeposits * 100) / 100))}>{fmtUSD(netDeposits)}</button></>}>
            <input id="cap-base" inputMode="decimal" className={inputCls} value={base} onChange={(e) => setBase(e.target.value)} placeholder="em branco = não calcular" />
          </Field>
          <Field label="Metodologia principal" htmlFor="cap-method">
            <Segmented<"twr" | "simple"> label="Metodologia principal" value={method} onChange={setMethod}
              options={[{ value: "twr", label: "TWR" }, { value: "simple", label: "Simples" }]} />
          </Field>
          <div className="flex flex-col gap-3 md:col-span-3">
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <Button type="submit" variant="primary" loading={busy} className="self-start"><Save className="h-4 w-4" aria-hidden="true" />Salvar</Button>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <Card className="flex flex-col gap-3 p-5" aria-labelledby="h-capchart">
          <CardHeader id="h-capchart" title="Evolução do capital estimado" sub="Linha verde: capital · área azul: aportes − retiradas" />
          <CapitalChart points={d.stats.points} height={240} />
        </Card>
        <Card className="flex flex-col gap-3 p-5" aria-labelledby="h-retchart">
          <CardHeader id="h-retchart" title={`Rentabilidade no período · ${s.return_method === "twr" ? "TWR" : "simples"}`}
            right={<span className={cx("text-lg font-extrabold tabular-nums", signClass(s.return_method === "twr" ? d.stats.twrPct : simpleReturn(d.stats.op, s.capital_base)))}>
              {s.return_method === "twr" ? fmtPct(d.stats.twrPct) : fmtPct(simpleReturn(d.stats.op, s.capital_base))}</span>} />
          {s.return_method === "simple" && !s.capital_base
            ? <p className="py-10 text-center text-sm text-mute">Defina o capital-base acima.</p>
            : <ReturnChart points={d.stats.points} mode={s.return_method} capitalBase={s.capital_base} beforeIndex={beforeIdx} height={240} />}
        </Card>
      </div>

      <Card className="p-5" aria-labelledby="h-months">
        <CardHeader id="h-months" title="Resultado por mês" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-xs text-mute">
                {["Mês", "Trades", "Taxas", "Resultado", "Depósitos", "Retiradas", "TWR do mês", "Capital no fim"].map((h, i) => (
                  <th key={h} scope="col" className={cx("border-b border-ink-600 px-2 py-2 font-semibold", i > 0 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="border-b border-ink-700 px-2 py-2.5 font-semibold capitalize">{fmtMonth(m.month)}</td>
                  <td className={cx("border-b border-ink-700 px-2 py-2.5 text-right tabular-nums", signClass(m.trades))}>{fmtUSD(m.trades, true)}</td>
                  <td className="border-b border-ink-700 px-2 py-2.5 text-right tabular-nums text-mute-strong">{fmtUSD(m.fees, true)}</td>
                  <td className={cx("border-b border-ink-700 px-2 py-2.5 text-right font-bold tabular-nums", signClass(m.op))}>{fmtUSD(m.op, true)}</td>
                  <td className="border-b border-ink-700 px-2 py-2.5 text-right tabular-nums text-sky">{m.deposits ? fmtUSD(m.deposits) : "—"}</td>
                  <td className="border-b border-ink-700 px-2 py-2.5 text-right tabular-nums">{m.withdrawals ? fmtUSD(m.withdrawals) : "—"}</td>
                  <td className={cx("border-b border-ink-700 px-2 py-2.5 text-right tabular-nums", signClass(m.twrPct))}>{fmtPct(m.twrPct)}</td>
                  <td className="border-b border-ink-700 px-2 py-2.5 text-right tabular-nums">{fmtUSD(m.capitalEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 text-sm leading-relaxed text-mute-strong" aria-labelledby="h-rules">
        <CardHeader id="h-rules" title="Regras de classificação do arquivo" />
        <ul className="mt-3 flex flex-col gap-1.5">
          <li><strong className="text-white">TradeResults</strong>: resultado operacional = AmountProfit.</li>
          <li><strong className="text-white">PerformanceFee</strong>: resultado operacional = Amount (a taxa efetivamente debitada). Nessas linhas o AmountProfit é o lucro da semana que foi liquidado no fechamento, não dinheiro saindo da conta; fica guardado só para auditoria. Regra confirmada com o saldo da plataforma.</li>
          <li><strong className="text-white">Deposit</strong>: entrada de capital (Amount). Não é lucro.</li>
          <li><strong className="text-white">Withdrawal</strong>: saída de capital (|Amount|). Não é prejuízo.</li>
          <li><strong className="text-white">Outros tipos</strong>: gravados e sinalizados, fora dos cálculos até existir uma regra documentada.</li>
          <li>Variação cambial nunca entra como lucro: a conversão para reais é só uma visualização.</li>
        </ul>
      </Card>
    </div>
  );
}
