// Guarda o token de sessão. "Manter conectado" → localStorage; senão → sessionStorage (some ao fechar a aba).
// O token é opaco; o banco guarda só o SHA-256 dele.
const KEY = "dds-finance.session.v1";

export type StoredSession = { token: string; expiresAt: string; remember: boolean };

function safeGet(storage: Storage | undefined): StoredSession | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredSession;
    if (!v?.token || !/^ddsf_[0-9a-f]{64}$/.test(v.token)) return null;
    if (v.expiresAt && new Date(v.expiresAt).getTime() < Date.now()) return null;
    return v;
  } catch {
    return null;
  }
}

function storages(): { local?: Storage; session?: Storage } {
  const out: { local?: Storage; session?: Storage } = {};
  try { out.local = window.localStorage; } catch { /* bloqueado */ }
  try { out.session = window.sessionStorage; } catch { /* bloqueado */ }
  return out;
}

let memory: StoredSession | null = null; // reserva quando o navegador bloqueia o armazenamento

export function loadSession(): StoredSession | null {
  const { local, session } = storages();
  return safeGet(session) ?? safeGet(local) ?? memory;
}

export function saveSession(s: StoredSession): void {
  memory = s;
  const { local, session } = storages();
  try {
    (s.remember ? local : session)?.setItem(KEY, JSON.stringify(s));
    (s.remember ? session : local)?.removeItem(KEY);
  } catch { /* fica só em memória */ }
}

export function clearSession(): void {
  memory = null;
  const { local, session } = storages();
  try { local?.removeItem(KEY); } catch { /* ignore */ }
  try { session?.removeItem(KEY); } catch { /* ignore */ }
}

// Preferências leves por aparelho (não financeiras).
export function getPref<T>(name: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem("dds-finance.pref." + name);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
export function setPref(name: string, value: unknown): void {
  try {
    if (value === undefined || value === null) window.localStorage.removeItem("dds-finance.pref." + name);
    else window.localStorage.setItem("dds-finance.pref." + name, JSON.stringify(value));
  } catch { /* ignore */ }
}
