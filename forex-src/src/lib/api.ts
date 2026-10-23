// Chamadas às funções do banco (PostgREST /rpc). Sem Supabase Auth: o token próprio vai como parâmetro.
import { PTAX_FUNCTION_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import type {
  AdminUser, DailyRow, FxData, ImportJob, ImportJobDetail, ImportReport, LoginResult, Me, Overview,
  Profile, Settings, TransactionDetail, TransactionPage,
} from "./types";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  get isAuth(): boolean {
    return this.message === "not_authenticated";
  }
}

type Listener = () => void;
const authListeners = new Set<Listener>();
export function onAuthExpired(fn: Listener): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export async function rpc<T>(fn: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(args),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError("network_error", 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const b = body as { message?: string; code?: string } | null;
    const err = new ApiError(b?.message || `http_${res.status}`, res.status, b?.code);
    if (err.isAuth) authListeners.forEach((l) => l());
    throw err;
  }
  return body as T;
}

// ---- sessão e conta ----
export const api = {
  login: (phone: string, pin: string, remember: boolean) =>
    rpc<LoginResult>("dds_finance_login", {
      p_phone: phone, p_pin: pin, p_remember: remember, p_user_agent: navigator.userAgent.slice(0, 300),
    }),
  logout: (token: string, all = false) => rpc<{ ok: boolean; revoked: number }>("dds_finance_logout", { p_token: token, p_all: all }),
  me: (token: string) => rpc<Me>("dds_finance_me", { p_token: token }),
  changePin: (token: string, current: string, next: string) =>
    rpc<{ ok: boolean; code?: string; attempts_left?: number; locked_until?: string; other_sessions_revoked?: number }>(
      "dds_finance_change_pin", { p_token: token, p_current_pin: current, p_new_pin: next }),
  updateProfile: (token: string, name: string) => rpc<Profile>("dds_finance_update_profile", { p_token: token, p_display_name: name }),
  updateSettings: (token: string, s: Pick<Settings, "opening_balance" | "capital_base" | "timezone" | "source_timezone" | "return_method">) =>
    rpc<Settings>("dds_finance_update_settings", {
      p_token: token, p_opening_balance: s.opening_balance, p_capital_base: s.capital_base,
      p_timezone: s.timezone, p_source_timezone: s.source_timezone, p_return_method: s.return_method,
    }),

  // ---- dados ----
  dailySeries: (token: string, signal?: AbortSignal) => rpc<DailyRow[]>("dds_finance_daily_series", { p_token: token }, signal),
  overview: (token: string, signal?: AbortSignal) => rpc<Overview>("dds_finance_overview", { p_token: token }, signal),
  fx: (token: string, signal?: AbortSignal) => rpc<FxData>("dds_finance_fx", { p_token: token }, signal),
  listTransactions: (token: string, filters: Record<string, string>, limit: number, offset: number, signal?: AbortSignal) =>
    rpc<TransactionPage>("dds_finance_list_transactions", { p_token: token, p_filters: filters, p_limit: limit, p_offset: offset }, signal),
  getTransaction: (token: string, id: string) => rpc<TransactionDetail>("dds_finance_get_transaction", { p_token: token, p_id: id }),
  listImports: (token: string, limit = 30, offset = 0) =>
    rpc<{ total: number; rows: ImportJob[] }>("dds_finance_list_imports", { p_token: token, p_limit: limit, p_offset: offset }),
  getImport: (token: string, id: string) => rpc<ImportJobDetail>("dds_finance_get_import", { p_token: token, p_id: id }),
  resolveConflict: (token: string, id: string) => rpc<{ ok: boolean }>("dds_finance_resolve_conflict", { p_token: token, p_conflict_id: id }),

  // ---- importação ----
  analyzeImport: (token: string, payload: unknown, fileHash: string) =>
    rpc<ImportReport>("dds_finance_analyze_import", { p_token: token, p_rows: payload, p_file_hash: fileHash }),
  commitImport: (token: string, payload: unknown, filename: string, fileHash: string) =>
    rpc<ImportReport>("dds_finance_commit_import", { p_token: token, p_rows: payload, p_filename: filename, p_file_hash: fileHash }),
  logFailedImport: (token: string, filename: string, fileHash: string, totalRows: number, message: string) =>
    rpc<string>("dds_finance_log_failed_import", {
      p_token: token, p_filename: filename, p_file_hash: fileHash, p_total_rows: totalRows, p_message: message,
    }),

  // ---- LGPD ----
  exportMyData: (token: string) => rpc<Record<string, unknown>>("dds_finance_export_my_data", { p_token: token }),
  deleteFinancialData: (token: string) =>
    rpc<{ transactions_deleted: number; import_jobs_deleted: number }>("dds_finance_delete_my_financial_data", { p_token: token, p_confirm: "EXCLUIR" }),
  deleteAccount: (token: string, pin: string) =>
    rpc<{ ok: boolean; code?: string; attempts_left?: number }>("dds_finance_delete_account", { p_token: token, p_pin: pin }),

  // ---- administração ----
  adminListUsers: (token: string) => rpc<AdminUser[]>("dds_finance_admin_list_users", { p_token: token }),
  adminCreateUser: (token: string, name: string, phone: string, isAdmin: boolean) =>
    rpc<{ profile_id: string; phone_normalized: string; temp_pin: string }>("dds_finance_admin_create_user", {
      p_token: token, p_display_name: name, p_phone: phone, p_is_admin: isAdmin,
    }),
  adminResetPin: (token: string, id: string) =>
    rpc<{ profile_id: string; temp_pin: string }>("dds_finance_admin_reset_pin", { p_token: token, p_profile_id: id }),
  adminSetActive: (token: string, id: string, active: boolean) =>
    rpc<{ ok: boolean }>("dds_finance_admin_set_active", { p_token: token, p_profile_id: id, p_active: active }),
};

// Pede ao servidor para atualizar a PTAX (a função ignora se consultou há menos de 10 min).
export async function requestPtaxRefresh(): Promise<boolean> {
  try {
    const res = await fetch(PTAX_FUNCTION_URL, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "app" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Mensagens amigáveis para os códigos de erro do servidor.
const MESSAGES: Record<string, string> = {
  network_error: "Sem conexão com o servidor. Confira a internet e tente de novo.",
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  forbidden: "Você não tem permissão para isso.",
  not_found: "Registro não encontrado.",
  invalid_payload: "O arquivo não pôde ser lido.",
  invalid_columns: "O cabeçalho do arquivo é inválido.",
  duplicate_columns: "O cabeçalho do arquivo tem colunas repetidas.",
  missing_columns: "O arquivo não tem as colunas obrigatórias (Id, Reason, Currency, Amount, AmountProfit, Time).",
  empty_file: "O arquivo não tem linhas de dados.",
  too_many_rows: "O arquivo tem mais de 50.000 linhas.",
  invalid_filename: "Nome de arquivo inválido.",
  invalid_file_hash: "Não foi possível identificar o arquivo.",
  invalid_phone: "Telefone inválido.",
  invalid_name: "Informe um nome com até 80 caracteres.",
  phone_in_use: "Já existe um acesso com esse telefone.",
  invalid_opening_balance: "Capital inicial inválido.",
  invalid_capital_base: "Capital-base inválido (deve ser maior que zero).",
  invalid_timezone: "Fuso horário inválido.",
  invalid_return_method: "Metodologia inválida.",
  invalid_filter: "Filtro inválido.",
  use_change_pin: "Para o seu próprio PIN, use Configurações › Trocar PIN.",
  cannot_change_self: "Você não pode desativar a si mesmo.",
  confirmation_required: "Confirmação obrigatória.",
};
export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (MESSAGES[e.message]) return MESSAGES[e.message];
    if (e.status === 0) return MESSAGES.network_error;
    if (e.message.includes("statement timeout")) return "O servidor demorou demais para responder. Tente de novo.";
    return "Não foi possível concluir a operação. Tente de novo em instantes.";
  }
  if ((e as Error)?.name === "AbortError") return "Operação cancelada.";
  return "Algo deu errado. Tente de novo.";
}
