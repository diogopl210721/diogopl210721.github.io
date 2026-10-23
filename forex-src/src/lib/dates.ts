// Datas como texto "AAAA-MM-DD" (dia civil no fuso do usuário). Aritmética em UTC ao meio-dia.
export function toDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
export function fromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}
export function diffDays(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
}
export function weekday(iso: string): number {
  return toDate(iso).getUTCDay();
}
export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}
export function endOfMonth(iso: string): string {
  const d = toDate(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromDate(d);
}
export function startOfYear(iso: string): string {
  return iso.slice(0, 4) + "-01-01";
}
export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}
export function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && fromDate(toDate(v)) === v;
}

/** Hoje (AAAA-MM-DD) no fuso indicado. */
export function todayIn(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
/** Hora e minuto atuais (minutos desde 0h) no fuso indicado. */
export function minutesOfDayIn(tz: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export type PeriodKey = "today" | "7d" | "month" | "prev_month" | "year" | "all" | "custom";
export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  "7d": "7 dias",
  month: "Mês atual",
  prev_month: "Mês anterior",
  year: "Ano",
  all: "Tudo",
  custom: "Período",
};

export type Period = { key: PeriodKey; from: string; to: string };

export function resolvePeriod(key: PeriodKey, today: string, firstDay: string | null, custom?: { from: string; to: string }): Period {
  switch (key) {
    case "today":
      return { key, from: today, to: today };
    case "7d":
      return { key, from: addDays(today, -6), to: today };
    case "month":
      return { key, from: startOfMonth(today), to: today };
    case "prev_month": {
      const prev = addDays(startOfMonth(today), -1);
      return { key, from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "year":
      return { key, from: startOfYear(today), to: today };
    case "custom":
      if (custom && isIsoDate(custom.from) && isIsoDate(custom.to)) {
        return { key, from: minDate(custom.from, custom.to), to: maxDate(custom.from, custom.to) };
      }
      return { key: "month", from: startOfMonth(today), to: today };
    case "all":
    default:
      return { key: "all", from: firstDay && firstDay < today ? firstDay : today, to: today };
  }
}
