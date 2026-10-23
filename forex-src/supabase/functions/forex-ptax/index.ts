// DDS Finance — atualização da PTAX (Banco Central do Brasil, API Olinda).
// Busca a PTAX de fechamento (compra e venda) e grava em dds_finance_exchange_rates.
// Não consulta o BCB se a última consulta (com sucesso ou erro) tiver menos de 10 minutos.
// Pode ser chamada pelo agendamento (pg_cron + pg_net) ou pelo app; não recebe dados do usuário.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_INTERVAL_MS = 10 * 60 * 1000;
const BCB = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Data de hoje em Brasília (YYYY-MM-DD).
function spToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function addDays(iso: string, n: number): string {
  const t = new Date(iso + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
// O BCB usa MM-DD-AAAA.
const bcbDate = (iso: string) => `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`;

type Ptax = { cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: status, error: statusError } = await db.rpc("dds_finance_ptax_status");
  if (statusError) return json({ ok: false, error: "status_unavailable" }, 500);

  const last = status?.last_check as { checked_at: string } | null;
  if (last && Date.now() - new Date(last.checked_at).getTime() < MIN_INTERVAL_MS) {
    return json({ ok: true, cached: true, latest_rate_date: status.latest_rate_date, last_check: last });
  }

  const today = spToday();
  const start = status?.latest_rate_date ? addDays(status.latest_rate_date, -7) : addDays(today, -400);
  const url = `${BCB}CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${bcbDate(start)}'&@dataFinalCotacao='${bcbDate(today)}'` +
    `&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`BCB respondeu HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body?.value)) throw new Error("resposta do BCB sem a lista de cotações");

    // uma cotação por dia (a última publicada no dia)
    const byDay = new Map<string, Ptax>();
    for (const v of body.value as Ptax[]) {
      if (typeof v?.dataHoraCotacao !== "string") continue;
      if (!(v.cotacaoVenda > 0.5 && v.cotacaoVenda < 50 && v.cotacaoCompra > 0.5 && v.cotacaoCompra < 50)) continue;
      const day = v.dataHoraCotacao.slice(0, 10);
      const prev = byDay.get(day);
      if (!prev || prev.dataHoraCotacao < v.dataHoraCotacao) byDay.set(day, v);
    }
    const rates = [...byDay.entries()].map(([date, v]) => ({
      date,
      venda: String(v.cotacaoVenda),
      compra: String(v.cotacaoCompra),
      quoted_at: v.dataHoraCotacao.slice(0, 19),
    }));

    const { data, error } = await db.rpc("dds_finance_store_ptax", {
      p_rates: rates,
      p_status: "ok",
      p_message: `${rates.length} dia(s) entre ${start} e ${today}`,
    });
    if (error) throw new Error("falha ao gravar: " + error.message);
    return json({ ok: true, cached: false, received: rates.length, ...data });
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "BCB não respondeu em 15 s" : e.message) : String(e);
    await db.rpc("dds_finance_store_ptax", { p_rates: [], p_status: "error", p_message: msg.slice(0, 300) });
    return json({ ok: false, error: msg }, 502);
  }
});
