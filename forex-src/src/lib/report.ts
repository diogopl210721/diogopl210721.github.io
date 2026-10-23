// Geração de CSV para download (relatório de inconsistências e exportação de dados).
// Separador ";" e BOM UTF-8 para abrir direto no Excel em português.
// Proteção contra injeção de fórmulas: texto que começa com = + - @ ganha um apóstrofo.
import type { ImportConflict, ImportError, ImportReport } from "./types";

const NUMERIC = /^[-+]?\d+([.,]\d+)?$/;

export function csvCell(v: unknown): string {
  let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s)) s = "'" + s;
  if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export function download(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const ERROR_LABELS: Record<string, string> = {
  row_not_object: "Linha ilegível",
  column_count_mismatch: "Quantidade de colunas diferente do cabeçalho",
  missing_id: "Id vazio",
  invalid_id: "Id não numérico",
  missing_reason: "Reason vazio",
  invalid_currency: "Moeda inválida (esperado código de 3 letras, ex.: USD)",
  invalid_amount: "Amount não é um número válido (use ponto como separador decimal)",
  invalid_amount_profit: "AmountProfit não é um número válido",
  missing_time: "Time vazio",
  invalid_time: "Data/hora inválida ou futura",
  import_failed: "Falha na importação",
};

export const CONFLICT_LABELS: Record<string, string> = {
  existing_mismatch: "Id já importado com valores diferentes — o registro do banco foi mantido",
  in_file_mismatch: "Id repetido no arquivo com valores diferentes — nenhuma das linhas foi importada",
};

type ReportLike = Pick<ImportReport, "errors" | "duplicates" | "unclassified"> & {
  conflicts: Array<{ row?: number; file_row?: number | null; external_id?: string; external_transaction_id?: string; kind: string; incoming: unknown; existing: unknown }>;
};

export function issuesCsv(r: ReportLike): string {
  const rows: unknown[][] = [];
  for (const e of r.errors as ImportError[]) {
    rows.push(["Inválido", e.row ?? "", e.external_id ?? "", e.code, ERROR_LABELS[e.code] ?? e.message ?? e.code, e.payload ?? e.message ?? ""]);
  }
  for (const c of r.conflicts as Array<ImportConflict & { row?: number; external_id?: string }>) {
    rows.push(["Divergência", c.row ?? c.file_row ?? "", c.external_id ?? c.external_transaction_id ?? "", c.kind,
      CONFLICT_LABELS[c.kind] ?? c.kind, { arquivo: c.incoming, banco: c.existing }]);
  }
  for (const d of r.duplicates ?? []) {
    rows.push(["Duplicado no arquivo", d.row, d.external_id, "duplicate_in_file", "Mesmo Id e mesmos valores repetidos no arquivo — importado uma vez", ""]);
  }
  for (const u of r.unclassified ?? []) {
    rows.push(["Sem classificação", u.row, u.external_id, "unclassified", `Reason "${u.reason}" sem regra documentada — fora dos cálculos`, ""]);
  }
  return toCsv(["Tipo", "Linha", "Id", "Código", "Descrição", "Detalhe"], rows);
}
