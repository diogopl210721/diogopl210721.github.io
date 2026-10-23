// Mesma regra de dds_finance_normalize_phone (banco): só dígitos, sem zeros à esquerda,
// número brasileiro com DDD ganha o 55. Ex.: "(41) 99154-2931" → "5541991542931".
export function normalizePhone(input: string): string | null {
  const intl = input.trim().startsWith("+");
  const v = input.replace(/\D/g, "").replace(/^0+/, "");
  if (!v) return null;
  if ((v.length === 10 || v.length === 11) && !intl) return "55" + v;
  if ((v.length === 12 || v.length === 13) && v.startsWith("55")) return v;
  if (intl && v.length >= 10 && v.length <= 15) return v;
  return null;
}

/** "5541991542931" → "+55 (41) 99154-2931" */
export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized) return "—";
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(normalized);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : "+" + normalized;
}

/** Máscara enquanto digita (só números brasileiros sem DDI). */
export function maskBrPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Espelha dds_finance__pin_is_acceptable. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "O PIN tem 4 números.";
  if (/^(\d)\1{3}$/.test(pin)) return "Evite números repetidos (ex.: 1111).";
  const seq = ["0123", "1234", "2345", "3456", "4567", "5678", "6789", "9876", "8765", "7654", "6543", "5432", "4321", "3210"];
  if (seq.includes(pin)) return "Evite sequências (ex.: 1234).";
  return null;
}
