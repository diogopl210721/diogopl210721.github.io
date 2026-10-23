import { describe, expect, it } from "vitest";
import { CsvError, parseCsvText } from "../../src/lib/csv";
import { resolvePeriod } from "../../src/lib/dates";
import { fmtBRL, fmtPct, fmtUSD } from "../../src/lib/format";
import { fxStatus } from "../../src/lib/fx";
import { formatPhone, normalizePhone, pinProblem } from "../../src/lib/phone";
import { csvCell, issuesCsv } from "../../src/lib/report";
import type { FxData } from "../../src/lib/types";

describe("telefone", () => {
  it("normaliza formatos diferentes para o mesmo número", () => {
    const forms = ["(41) 99154-2931", "41991542931", "+55 41 99154-2931", "5541991542931", "041 99154 2931", "+55 (41) 9 9154-2931"];
    for (const f of forms) expect(normalizePhone(f)).toBe("5541991542931");
  });
  it("rejeita números curtos ou vazios", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("1234")).toBeNull();
  });
  it("formata para exibição", () => {
    expect(formatPhone("5541991542931")).toBe("+55 (41) 99154-2931");
  });
});

describe("PIN", () => {
  it("aceita 4 dígitos não triviais", () => expect(pinProblem("2580")).toBeNull());
  it("recusa sequências, repetidos e formato errado", () => {
    expect(pinProblem("1234")).not.toBeNull();
    expect(pinProblem("4321")).not.toBeNull();
    expect(pinProblem("7777")).not.toBeNull();
    expect(pinProblem("12a4")).not.toBeNull();
    expect(pinProblem("123")).not.toBeNull();
  });
});

describe("leitura do CSV", () => {
  const header = "Id,Reason,InvestmentId,Currency,Amount,AmountProfit,Time,Comment";
  it("preserva valores brutos e ignora linhas vazias", () => {
    const { payload } = parseCsvText(`﻿${header}\n1,Deposit,2126,USD,499.090000000000,0.000000000000,2026-08-03T18:31:20,"TRA, 334162"\n\n`);
    expect(payload.columns).toEqual(header.split(","));
    expect(payload.rows).toEqual([["1", "Deposit", "2126", "USD", "499.090000000000", "0.000000000000", "2026-08-03T18:31:20", "TRA, 334162"]]);
  });
  it("O: exige as colunas obrigatórias", () => {
    expect(() => parseCsvText("Id,Foo\n1,2")).toThrow(CsvError);
  });
  it("recusa arquivo só com cabeçalho, vazio ou binário", () => {
    expect(() => parseCsvText(header)).toThrow(/sem movimentações/);
    expect(() => parseCsvText("")).toThrow(CsvError);
    expect(() => parseCsvText("Id\u0000,x")).toThrow(/texto/);
  });
  it("recusa cabeçalho com colunas repetidas", () => {
    expect(() => parseCsvText(`${header},Id\n1,a,b,c,d,e,f,g,h`)).toThrow(/repetidas/);
  });
});

describe("relatório CSV", () => {
  it("neutraliza fórmulas e mantém números negativos", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-152.44")).toBe("-152.44");
    expect(csvCell("a;b")).toBe('"a;b"');
  });
  it("gera linhas para erros, divergências, duplicados e sem classificação", () => {
    const csv = issuesCsv({
      errors: [{ row: 3, external_id: null, code: "missing_id" }],
      conflicts: [{ row: 5, external_id: "9", kind: "existing_mismatch", incoming: { Amount: "1" }, existing: { Amount: "2" } }],
      duplicates: [{ row: 7, external_id: "8" }],
      unclassified: [{ row: 9, external_id: "10", reason: "Bonus" }],
    });
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("Tipo;Linha;Id");
    expect(csv.startsWith("﻿")).toBe(true);
  });
});

describe("formatação", () => {
  it("usa padrão brasileiro com sinal", () => {
    expect(fmtUSD(1234.56)).toBe("US$ 1.234,56");
    expect(fmtUSD(12.5, true)).toBe("+US$ 12,50");
    expect(fmtUSD(-98.76, true)).toBe("−US$ 98,76");
    expect(fmtBRL(10000.5)).toBe("R$ 10.000,50");
    expect(fmtPct(12.344)).toBe("+12,34%");
    expect(fmtUSD(0, true)).toBe("US$ 0,00");
  });
});

describe("períodos", () => {
  const today = "2026-10-23";
  it("calcula os filtros do briefing", () => {
    expect(resolvePeriod("today", today, "2026-08-03")).toMatchObject({ from: today, to: today });
    expect(resolvePeriod("7d", today, null)).toMatchObject({ from: "2026-10-17", to: today });
    expect(resolvePeriod("month", today, null)).toMatchObject({ from: "2026-10-01", to: today });
    expect(resolvePeriod("prev_month", today, null)).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod("year", today, null)).toMatchObject({ from: "2026-01-01", to: today });
    expect(resolvePeriod("all", today, "2026-08-03")).toMatchObject({ from: "2026-08-03", to: today });
    expect(resolvePeriod("custom", today, null, { from: "2026-10-10", to: "2026-09-01" })).toMatchObject({ from: "2026-09-01", to: "2026-10-10" });
  });
});

describe("J: situação da cotação", () => {
  const base = (rateDate: string, today: string, err = false): FxData => ({
    latest: { rate: 5.0377, rate_date: rateDate, source: "BCB PTAX", rate_type: "ptax_venda_fechamento", quoted_at: null, fetched_at: "" },
    latest_buy: null, history: [], last_ok_check_at: null, server_now: "", today,
    last_check: err ? { checked_at: "2026-10-23T16:00:00Z", status: "error", latest_rate_date: rateDate, message: "x" } : null,
  });
  it("PTAX do dia", () => expect(fxStatus(base("2026-10-23", "2026-10-23")).tone).toBe("ok"));
  it("fim de semana usa a última publicada", () => {
    const s = fxStatus(base("2026-10-23", "2026-10-25"));
    expect(s.tone).toBe("info");
    expect(s.title).toMatch(/Fim de semana/);
  });
  it("antes das 13h30 em dia útil é informativo", () => {
    const s = fxStatus(base("2026-10-22", "2026-10-23"), new Date("2026-10-23T12:00:00Z")); // 09h em Brasília
    expect(s.tone).toBe("info");
  });
  it("depois das 13h30 sem a PTAX do dia vira alerta", () => {
    expect(fxStatus(base("2026-10-22", "2026-10-23"), new Date("2026-10-23T19:00:00Z")).tone).toBe("warn");
  });
  it("cotação antiga nunca aparece como atual", () => {
    const s = fxStatus(base("2026-10-10", "2026-10-23"));
    expect(s.tone).toBe("warn");
    expect(s.title).toMatch(/desatualizada/);
  });
  it("sem cotação mostra indisponível e falha de consulta é informada", () => {
    expect(fxStatus(null).tone).toBe("error");
    expect(fxStatus(base("2026-10-23", "2026-10-23", true)).detail).toMatch(/falhou/);
  });
});
