// Situação da cotação PTAX: nunca apresenta taxa antiga como atual.
import { diffDays, minutesOfDayIn, weekday } from "./dates";
import { fmtDayShort, fmtTime } from "./format";
import type { FxData } from "./types";

export type FxTone = "ok" | "info" | "warn" | "error";
export type FxStatus = { tone: FxTone; title: string; detail?: string };

const PTAX_PUBLISH_MINUTES = 13 * 60 + 30; // PTAX de fechamento sai por volta das 13h

export function fxStatus(fx: FxData | null, now = new Date()): FxStatus {
  if (!fx?.latest) {
    return { tone: "error", title: "Cotação indisponível", detail: "Ainda não foi possível obter a PTAX do Banco Central." };
  }
  const today = fx.today;
  const rateDate = fx.latest.rate_date;
  const lastErr = fx.last_check?.status === "error" ? fx.last_check : null;
  const errNote = lastErr
    ? `A última consulta ao Banco Central falhou (${fmtTime(lastErr.checked_at)}); mantida a última cotação válida.`
    : undefined;
  const gap = diffDays(rateDate, today);

  if (gap <= 0) return { tone: lastErr ? "info" : "ok", title: `PTAX de hoje (${fmtDayShort(rateDate)})`, detail: errNote };

  const wd = weekday(today);
  if (gap > 4) {
    return {
      tone: "warn",
      title: `Cotação desatualizada: última PTAX é de ${fmtDayShort(rateDate)}`,
      detail: errNote ?? "O Banco Central não publicou cotações recentes ou a consulta falhou.",
    };
  }
  if (wd === 0 || wd === 6) {
    return { tone: "info", title: `Fim de semana: última PTAX publicada (${fmtDayShort(rateDate)})`, detail: errNote };
  }
  if (minutesOfDayIn("America/Sao_Paulo", now) < PTAX_PUBLISH_MINUTES) {
    return {
      tone: "info",
      title: `PTAX de ${fmtDayShort(rateDate)}`,
      detail: errNote ?? "A PTAX de hoje é publicada por volta das 13h (horário de Brasília).",
    };
  }
  return {
    tone: "warn",
    title: `PTAX de ${fmtDayShort(rateDate)}`,
    detail: errNote ?? "A PTAX de hoje ainda não está disponível (feriado ou atraso na publicação).",
  };
}

export const RATE_TYPE_LABEL: Record<string, string> = {
  ptax_venda_fechamento: "PTAX venda · fechamento",
  ptax_compra_fechamento: "PTAX compra · fechamento",
};
