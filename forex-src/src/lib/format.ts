// Formatação em pt-BR. Negativos usam o sinal de menos tipográfico (−).
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf4 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const MINUS = "−";

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function prefix(cur: string): string {
  return cur === "USD" ? "US$ " : cur === "BRL" ? "R$ " : cur + " ";
}

/** "US$ 1.234,56"; com sign=true → "+US$ 12,50" / "−US$ 98,76". Zero sem sinal. */
export function fmtMoney(v: number | null | undefined, cur = "USD", opts: { sign?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = round2(v);
  const abs = nf2.format(Math.abs(r));
  if (r < 0) return `${MINUS}${prefix(cur)}${abs}`;
  if (opts.sign && r > 0) return `+${prefix(cur)}${abs}`;
  return `${prefix(cur)}${abs}`;
}

export const fmtUSD = (v: number | null | undefined, sign = false) => fmtMoney(v, "USD", { sign });
export const fmtBRL = (v: number | null | undefined, sign = false) => fmtMoney(v, "BRL", { sign });

export function fmtNumber(v: number | null | undefined, sign = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = round2(v);
  if (r < 0) return MINUS + nf2.format(Math.abs(r));
  return (sign && r > 0 ? "+" : "") + nf2.format(r);
}

export function fmtPct(v: number | null | undefined, sign = true, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const f = digits === 1 ? nf1 : nf2;
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  if (r < 0) return `${MINUS}${f.format(Math.abs(r))}%`;
  return `${sign && r > 0 ? "+" : ""}${f.format(r)}%`;
}

export const fmtRate = (v: number | null | undefined) => (v == null ? "—" : nf4.format(v));
export const fmtInt = (v: number | null | undefined) => (v == null ? "—" : nf0.format(v));

/** Eixo dos gráficos: valores compactos ("1,2 mil"). */
export function fmtAxis(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return (v < 0 ? MINUS : "") + nf1.format(a / 1000).replace(",0", "") + " mil";
  return (v < 0 ? MINUS : "") + nf0.format(a);
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-10-23" → "23/10/2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
/** "2026-10-23" → "23/10" */
export function fmtDayShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
/** "2026-10-23" → "sex, 23 out" */
export function fmtDayLong(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${d} ${MONTHS[m - 1]}`;
}
export function fmtMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]}/${y}`;
}

/** Timestamp (ISO com fuso) → "23/10/2026 09:14" no fuso informado. */
export function fmtDateTime(ts: string | null | undefined, tz = "America/Sao_Paulo", withSeconds = false): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined, hour12: false,
  }).format(d);
  return parts.replace(",", "");
}
export function fmtTime(ts: string, tz = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));
}

/** Horário bruto do arquivo "2026-10-23T02:09:35" → "23/10/2026 02:09:35" (sem conversão de fuso). */
export function fmtRawTime(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/.exec(raw);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : raw;
}

export function relativeFromNow(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export const signClass = (v: number | null | undefined) =>
  v == null || round2(v) === 0 ? "text-white" : v > 0 ? "text-pos" : "text-neg";
