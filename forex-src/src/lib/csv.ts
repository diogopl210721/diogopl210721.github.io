// Leitura do CSV no navegador: só transporta os valores brutos.
// Toda a validação financeira (tipos, datas, deduplicação) acontece no banco.
import Papa from "papaparse";
import { MAX_FILE_BYTES, MAX_ROWS, REQUIRED_COLUMNS } from "../config";

export type CsvPayload = { columns: string[]; rows: string[][] };
export type ParsedCsv = {
  filename: string;
  size: number;
  hash: string; // SHA-256 hex do arquivo como enviado
  payload: CsvPayload;
  totalRows: number;
  parseWarnings: string[];
};

export class CsvError extends Error {}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function cleanFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_").slice(0, 255) || "arquivo.csv";
}

/** Converte o texto do CSV em {columns, rows}. Exportado para testes. */
export function parseCsvText(text: string): { payload: CsvPayload; warnings: string[] } {
  const clean = text.replace(/^﻿/, "");
  if (/\u0000/.test(clean)) throw new CsvError("O arquivo não parece ser um CSV de texto.");
  const res = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  const data = res.data.filter((r) => Array.isArray(r));
  if (!data.length) throw new CsvError("O arquivo está vazio.");
  const columns = data[0].map((c) => String(c ?? "").trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) {
    throw new CsvError(`Faltam colunas obrigatórias: ${missing.join(", ")}. Envie a exportação completa da plataforma.`);
  }
  const dupes = columns.filter((c, i) => columns.indexOf(c) !== i);
  if (dupes.length) throw new CsvError(`Colunas repetidas no cabeçalho: ${[...new Set(dupes)].join(", ")}.`);
  const rows = data.slice(1).map((r) => r.map((v) => (v == null ? "" : String(v))));
  if (!rows.length) throw new CsvError("O arquivo só tem o cabeçalho, sem movimentações.");
  if (rows.length > MAX_ROWS) throw new CsvError(`O arquivo tem ${rows.length} linhas; o limite é ${MAX_ROWS}.`);
  const warnings = res.errors
    .filter((e) => e.type !== "Delimiter")
    .slice(0, 20)
    .map((e) => `Linha ${(e.row ?? 0) + 2}: ${e.message}`);
  return { payload: { columns, rows }, warnings };
}

export async function readCsvFile(file: File): Promise<ParsedCsv> {
  if (!/\.csv$/i.test(file.name)) throw new CsvError("Envie o arquivo no formato .csv exportado da plataforma.");
  if (file.size === 0) throw new CsvError("O arquivo está vazio.");
  if (file.size > MAX_FILE_BYTES) throw new CsvError("O arquivo passa de 10 MB.");
  const okTypes = ["", "text/csv", "application/vnd.ms-excel", "text/plain", "application/csv", "text/comma-separated-values"];
  if (file.type && !okTypes.includes(file.type)) throw new CsvError("Tipo de arquivo não suportado. Envie um .csv.");
  const buf = await file.arrayBuffer();
  const hash = await sha256Hex(buf);
  const text = new TextDecoder("utf-8").decode(buf);
  const { payload, warnings } = parseCsvText(text);
  return { filename: cleanFilename(file.name), size: file.size, hash, payload, totalRows: payload.rows.length, parseWarnings: warnings };
}
