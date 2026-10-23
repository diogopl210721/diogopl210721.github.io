import { useEffect, useState } from "react";
import { FlaskConical, RefreshCw } from "lucide-react";
import { FxEquityChart, RateChart } from "../components/charts/Charts";
import { PageTitle } from "../components/Layout";
import { Badge, Button, Card, CardHeader, cx, Divider, Field, inputCls, KeyValue, Notice } from "../components/ui";
import { fmtBRL, fmtDate, fmtDateTime, fmtDayLong, fmtRate, fmtUSD } from "../lib/format";
import { fxStatus, RATE_TYPE_LABEL } from "../lib/fx";
import { useData } from "../state/data";

export default function Fx() {
  const d = useData();
  const [manual, setManual] = useState(d.manualRate ? String(d.manualRate).replace(".", ",") : "");
  const [manualErr, setManualErr] = useState<string | null>(null);
  useEffect(() => {
    document.title = "Cotação cambial · DDS Finance";
  }, []);

  const fx = d.fx;
  const status = fxStatus(fx);
  const official = fx?.latest ? Number(fx.latest.rate) : null;
  const rate = d.rate?.value ?? null;
  const capital = d.totals.capital;
  const recent = [...(fx?.history ?? [])].reverse().slice(0, 15);

  function applyManual() {
    const v = Number(manual.replace(",", "."));
    if (!(v > 0.5 && v < 50)) return setManualErr("Informe uma cotação entre 0,50 e 50,00.");
    setManualErr(null);
    d.setManualRate(Math.round(v * 10000) / 10000);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Cotação cambial" sub="Dólar comercial (USD/BRL) pela PTAX oficial do Banco Central do Brasil" />

      {d.rate?.simulated && (
        <Notice tone="warn" title={`Simulação ativa: R$ ${fmtRate(d.rate.value)}`} onClose={() => { d.setManualRate(null); setManual(""); }}>
          Os valores em reais do app usam esta cotação manual. Feche este aviso para voltar à PTAX oficial.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <Card className="flex flex-col gap-3 p-5 lg:col-span-5" aria-labelledby="h-ptax">
          <CardHeader id="h-ptax" title="PTAX oficial" right={<Badge tone={status.tone === "ok" ? "pos" : status.tone === "info" ? "sky" : "warn"}>{status.tone === "ok" ? "atual" : status.tone === "info" ? "última publicada" : "atenção"}</Badge>} />
          <div className="flex items-baseline gap-3">
            <span className="text-[34px] font-extrabold tabular-nums">{official != null ? `R$ ${fmtRate(official)}` : "—"}</span>
            {fx?.latest && <span className="text-sm text-mute">{fmtDate(fx.latest.rate_date)}</span>}
          </div>
          <Notice tone={status.tone === "ok" ? "ok" : status.tone === "info" ? "info" : status.tone === "warn" ? "warn" : "error"} title={status.title}>{status.detail}</Notice>
          <div className="flex flex-col gap-2">
            <KeyValue k="Tipo" v={fx?.latest ? RATE_TYPE_LABEL[fx.latest.rate_type] ?? fx.latest.rate_type : "—"} />
            <KeyValue k="PTAX compra" v={fx?.latest_buy ? `R$ ${fmtRate(Number(fx.latest_buy.rate))}` : "—"} />
            <KeyValue k="Fonte" v="Banco Central do Brasil" sub="API Olinda · CotacaoDolarPeriodo" />
            <KeyValue k="Boletim publicado" v={fx?.latest?.quoted_at ? fmtDateTime(fx.latest.quoted_at) : "—"} />
            <KeyValue k="Última consulta" v={fx?.last_check ? fmtDateTime(fx.last_check.checked_at) : "—"}
              sub={fx?.last_check?.status === "error" ? `falhou: ${fx.last_check.message ?? ""}` : undefined} />
          </div>
          <Button onClick={() => d.reloadFx(true)} loading={d.fxRefreshing} className="self-start">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />Verificar agora
          </Button>
          <p className="text-xs leading-relaxed text-mute">
            A cotação é atualizada automaticamente nos dias úteis depois das 13h. Em fins de semana e feriados vale a última PTAX publicada.
            O servidor consulta o Banco Central no máximo a cada 10 minutos.
          </p>
        </Card>

        <Card className="flex flex-col gap-3 p-5 lg:col-span-7" aria-labelledby="h-conv">
          <CardHeader id="h-conv" title="Seu patrimônio em reais" right={d.rate?.simulated ? <Badge tone="warn">SIMULAÇÃO</Badge> : <Badge>INDICATIVO</Badge>} />
          <KeyValue k="Capital aportado líquido (USD)" v={fmtUSD(d.totals.netContrib)} sub="capital inicial + depósitos − retiradas" />
          <KeyValue k="Lucro acumulado (USD)" v={fmtUSD(d.totals.op, true)} vClass={d.totals.op >= 0 ? "text-pos" : "text-neg"} />
          <KeyValue k="Patrimônio estimado (USD)" v={fmtUSD(capital)} sub="capital estimado = aportado + lucro" />
          <Divider />
          <div className="flex items-baseline justify-between">
            <span className="font-bold">Equivalente em BRL</span>
            <span className="text-2xl font-extrabold tabular-nums">{rate != null ? fmtBRL(capital * rate) : "—"}</span>
          </div>
          <KeyValue k="Lucro acumulado em BRL" v={rate != null ? fmtBRL(d.totals.op * rate, true) : "—"} />
          <p className="text-xs leading-relaxed text-mute">
            Patrimônio em BRL = patrimônio em USD × {d.rate?.simulated ? "cotação simulada" : "PTAX de venda"} ({rate != null ? fmtRate(rate) : "—"}
            {d.rate?.date ? ` de ${fmtDate(d.rate.date)}` : ""}). É uma conversão indicativa: o valor líquido de um saque depende de spread, taxas e impostos.
            A variação do dólar não conta como lucro de trading.
          </p>

          <form className="mt-1 flex flex-col gap-2 rounded-2xl border border-ink-600 p-3.5" onSubmit={(e) => { e.preventDefault(); applyManual(); }}>
            <div className="flex items-center gap-2 text-sm font-bold"><FlaskConical className="h-4 w-4 text-amber-300" aria-hidden="true" />Simular outra cotação</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40">
                <Field label="R$ por US$" htmlFor="fx-manual" error={manualErr}>
                  <input id="fx-manual" inputMode="decimal" className={inputCls} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="5,2000" />
                </Field>
              </div>
              <Button type="submit">Aplicar simulação</Button>
              {d.manualRate && <Button variant="ghost" onClick={() => { d.setManualRate(null); setManual(""); }}>Voltar à PTAX</Button>}
            </div>
            <p className="text-xs text-mute">A simulação vale só neste aparelho e fica marcada como tal em todas as telas.</p>
          </form>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <Card className="flex flex-col gap-3 p-5" aria-labelledby="h-eqbrl">
          <CardHeader id="h-eqbrl" title="Patrimônio convertido ao longo do tempo" sub="Cada dia usa a PTAX válida naquele dia" />
          <FxEquityChart points={d.timeline} history={fx?.history ?? []} height={240} />
          <p className="text-xs text-amber-300/90">Parte da variação desta linha vem do câmbio, não do resultado das operações.</p>
        </Card>
        <Card className="flex flex-col gap-3 p-5" aria-labelledby="h-hist">
          <CardHeader id="h-hist" title="Histórico da PTAX de venda" />
          <RateChart history={fx?.history ?? []} height={180} />
          <ul className="flex flex-col">
            {recent.map((h, i) => (
              <li key={h.date} className={cx("flex justify-between py-1.5 text-[13px]", i > 0 && "border-t border-ink-700")}>
                <span className="capitalize text-mute-strong">{fmtDayLong(h.date)}</span>
                <span className="font-bold tabular-nums">{fmtRate(Number(h.rate))}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
