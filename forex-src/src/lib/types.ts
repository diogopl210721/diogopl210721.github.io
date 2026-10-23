// Tipos das respostas do banco. Números chegam como number (numeric do Postgres → JSON).
export type Profile = {
  id: string;
  display_name: string;
  phone: string;
  is_admin: boolean;
  must_change_pin: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type Settings = {
  opening_balance: number;
  capital_base: number | null;
  currency: string;
  timezone: string;
  source_timezone: string;
  return_method: "twr" | "simple";
  updated_at?: string;
};

export type Me = {
  profile: Profile;
  settings: Settings;
  session: { expires_at: string };
  active_sessions: number;
};

export type LoginResult = {
  ok: boolean;
  code?: "invalid_credentials" | "locked" | "too_many_attempts";
  token?: string;
  expires_at?: string;
  must_change_pin?: boolean;
  profile?: Profile;
  attempts_left?: number | null;
  locked_until?: string | null;
};

export type DailyRow = {
  day: string; // YYYY-MM-DD no fuso do usuário
  op_result: number;
  trade_result: number;
  fee_result: number;
  deposits: number;
  withdrawals: number; // valor positivo
  tx_count: number;
  trade_count: number;
  positive_trades: number;
  negative_trades: number;
};

export type ImportJob = {
  id: string;
  source: string;
  original_filename: string;
  file_hash: string;
  status: "processing" | "completed" | "completed_with_issues" | "failed";
  total_rows: number;
  inserted_rows: number;
  existing_rows: number;
  duplicate_rows: number;
  rejected_rows: number;
  conflict_rows: number;
  unclassified_rows: number;
  period_start: string | null;
  period_end: string | null;
  currencies: string[];
  inserted_op_result: number | null;
  inserted_deposits: number | null;
  inserted_withdrawals: number | null;
  created_at: string;
  completed_at: string | null;
  error_count?: number;
};

export type ImportConflict = {
  id: string;
  external_transaction_id: string;
  kind: "existing_mismatch" | "in_file_mismatch";
  file_row: number | null;
  existing: Record<string, unknown> | null;
  incoming: Record<string, unknown> | unknown[];
  resolved_at: string | null;
};

export type ImportJobDetail = ImportJob & {
  error_summary: ImportError[];
  conflicts: ImportConflict[];
};

export type ImportError = { row?: number; external_id?: string | null; code: string; payload?: unknown; message?: string };

export type ImportReport = {
  total_rows: number;
  new_rows: number;
  existing_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  conflict_rows: number;
  conflict_ids: number;
  unclassified_new_rows: number;
  other_currency_new_rows: number;
  trade_amount_mismatch_rows: number;
  period_start: string | null;
  period_end: string | null;
  new_period_start: string | null;
  new_period_end: string | null;
  reference_currency: string;
  impact: { op_result: number; trade_result: number; fee_result: number; deposits: number; withdrawals: number };
  currencies: string[];
  reasons: Record<string, number>;
  sample: Array<{
    row: number; external_id: string; reason: string; classification: string; currency: string;
    amount: number; amount_profit: number; op_result: number; capital_flow: number; time: string;
  }>;
  errors: ImportError[];
  duplicates: Array<{ row: number; external_id: string }>;
  conflicts: Array<{ row: number; external_id: string; kind: string; incoming: unknown; existing: unknown }>;
  unclassified: Array<{ row: number; external_id: string; reason: string }>;
  already_imported_file: { import_job_id: string; created_at: string; original_filename: string } | null;
  // só na importação confirmada
  import_job_id?: string;
  inserted_rows?: number;
  status?: ImportJob["status"];
  race_skipped_rows?: number;
};

export type Classification = "trade" | "performance_fee" | "deposit" | "withdrawal" | "unclassified";

export type TransactionRow = {
  id: string;
  external_transaction_id: string;
  reason: string;
  classification: Classification;
  currency: string;
  amount: number;
  amount_profit: number;
  op_result: number;
  capital_flow: number;
  transaction_time: string;
  time_raw: string;
  local_date: string;
};

export type TransactionPage = {
  total: number;
  limit: number;
  offset: number;
  rows: TransactionRow[];
  days: Record<string, { op_result: number; capital_flow: number; count: number }>;
};

export type TransactionDetail = TransactionRow & {
  source: string;
  investment_id: string | null;
  manager_name: string | null;
  original_payload: Record<string, unknown>;
  fingerprint: string;
  rule_version: number;
  source_import_id: string | null;
  created_at: string;
  import: { id: string; original_filename: string; created_at: string } | null;
  conflicts: Array<{ id: string; kind: string; created_at: string; resolved_at: string | null; incoming: unknown }>;
};

export type Overview = {
  transactions_total: number;
  unclassified_total: number;
  other_currency_total: number;
  first_transaction_at: string | null;
  last_transaction_at: string | null;
  open_conflicts: number;
  today: string;
  last_import: ImportJob | null;
};

export type FxRate = {
  rate: number;
  rate_date: string;
  source: string;
  rate_type: string;
  quoted_at: string | null;
  fetched_at: string;
};

export type FxData = {
  latest: FxRate | null;
  latest_buy: FxRate | null;
  history: Array<{ date: string; rate: number }>;
  last_check: { checked_at: string; status: "ok" | "error"; latest_rate_date: string | null; message: string | null } | null;
  last_ok_check_at: string | null;
  server_now: string;
  today: string;
};

export type AdminUser = {
  id: string;
  display_name: string;
  phone: string;
  is_admin: boolean;
  is_active: boolean;
  must_change_pin: boolean;
  last_login_at: string | null;
  created_at: string;
  locked_until: string | null;
  transactions: number;
};
