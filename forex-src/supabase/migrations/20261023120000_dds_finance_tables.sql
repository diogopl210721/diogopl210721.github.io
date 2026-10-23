-- DDS Finance — tabelas, índices e RLS.
-- Instância compartilhada: todos os objetos usam o prefixo dds_finance_.
-- Nenhuma tabela existente é alterada.

-- Usuários do DDS Finance (independentes do auth.users; o vínculo é criado no primeiro login).
create table public.dds_finance_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  phone_normalized text not null unique check (phone_normalized ~ '^[0-9]{10,15}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  must_change_pin boolean not null default true,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hash do PIN fica separado e inacessível a clientes (sem políticas RLS).
create table public.dds_finance_credentials (
  profile_id uuid primary key references public.dds_finance_profiles(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

-- Controle de tentativas (por telefone, por IP e por troca de PIN).
create table public.dds_finance_login_guard (
  key text primary key,
  failed_count int not null default 0,
  lock_level int not null default 0,
  locked_until timestamptz,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dds_finance_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.dds_finance_profiles(id) on delete cascade,
  opening_balance numeric(20,2) not null default 0,
  capital_base numeric(20,2) check (capital_base is null or capital_base > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'America/Sao_Paulo',
  source_timezone text not null default 'America/Sao_Paulo',
  return_method text not null default 'twr' check (return_method in ('twr', 'simple')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dds_finance_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.dds_finance_profiles(id) on delete cascade,
  source text not null default 'trading_csv',
  original_filename text not null check (char_length(original_filename) <= 255),
  file_hash text not null,
  status text not null check (status in ('processing', 'completed', 'completed_with_issues', 'failed')),
  total_rows int not null default 0,
  inserted_rows int not null default 0,
  existing_rows int not null default 0,
  duplicate_rows int not null default 0,
  rejected_rows int not null default 0,
  conflict_rows int not null default 0,
  unclassified_rows int not null default 0,
  period_start timestamptz,
  period_end timestamptz,
  currencies text[] not null default '{}',
  inserted_op_result numeric(20,6),
  inserted_deposits numeric(20,6),
  inserted_withdrawals numeric(20,6),
  error_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index dds_finance_import_jobs_user_idx on public.dds_finance_import_jobs (user_id, created_at desc);

create table public.dds_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.dds_finance_profiles(id) on delete cascade,
  source text not null default 'trading_csv',
  external_transaction_id text not null,
  reason text not null,
  classification text not null check (classification in ('trade', 'performance_fee', 'deposit', 'withdrawal', 'unclassified')),
  investment_id text,
  manager_name text,
  currency text not null,
  amount numeric(20,6) not null,
  amount_profit numeric(20,6) not null,
  op_result numeric(20,6) not null default 0,
  capital_flow numeric(20,6) not null default 0,
  transaction_time timestamptz not null,
  time_raw text not null,
  original_payload jsonb not null,
  fingerprint text not null,
  rule_version int not null default 1,
  source_import_id uuid references public.dds_finance_import_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dds_finance_transactions_unique_external unique (user_id, source, external_transaction_id)
);
create index dds_finance_transactions_user_time_idx on public.dds_finance_transactions (user_id, transaction_time desc);
create index dds_finance_transactions_user_class_idx on public.dds_finance_transactions (user_id, classification);
create index dds_finance_transactions_import_idx on public.dds_finance_transactions (source_import_id);

create table public.dds_finance_import_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.dds_finance_profiles(id) on delete cascade,
  import_job_id uuid not null references public.dds_finance_import_jobs(id) on delete cascade,
  external_transaction_id text not null,
  kind text not null check (kind in ('existing_mismatch', 'in_file_mismatch')),
  file_row int,
  existing_payload jsonb,
  incoming_payload jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index dds_finance_import_conflicts_user_idx on public.dds_finance_import_conflicts (user_id, created_at desc);
create index dds_finance_import_conflicts_job_idx on public.dds_finance_import_conflicts (import_job_id);

create table public.dds_finance_exchange_rates (
  id bigint generated always as identity primary key,
  base_currency text not null,
  quote_currency text not null,
  rate numeric(14,6) not null check (rate > 0),
  rate_date date not null,
  source text not null,
  rate_type text not null,
  quoted_at timestamptz,
  fetched_at timestamptz not null default now(),
  constraint dds_finance_exchange_rates_unique unique (base_currency, quote_currency, rate_date, source, rate_type)
);
create index dds_finance_exchange_rates_lookup_idx on public.dds_finance_exchange_rates (base_currency, quote_currency, rate_type, rate_date desc);

create table public.dds_finance_rate_fetch_log (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'error')),
  latest_rate_date date,
  rows_received int,
  message text
);
create index dds_finance_rate_fetch_log_idx on public.dds_finance_rate_fetch_log (checked_at desc);

create table public.dds_finance_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.dds_finance_profiles(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index dds_finance_audit_log_user_idx on public.dds_finance_audit_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS e privilégios
-- ---------------------------------------------------------------------------
alter table public.dds_finance_profiles enable row level security;
alter table public.dds_finance_credentials enable row level security;
alter table public.dds_finance_login_guard enable row level security;
alter table public.dds_finance_settings enable row level security;
alter table public.dds_finance_import_jobs enable row level security;
alter table public.dds_finance_transactions enable row level security;
alter table public.dds_finance_import_conflicts enable row level security;
alter table public.dds_finance_exchange_rates enable row level security;
alter table public.dds_finance_rate_fetch_log enable row level security;
alter table public.dds_finance_audit_log enable row level security;

-- Visitantes não autenticados não acessam nada; usuários só leem (gravações passam por funções).
revoke all on public.dds_finance_profiles, public.dds_finance_credentials, public.dds_finance_login_guard,
  public.dds_finance_settings, public.dds_finance_import_jobs, public.dds_finance_transactions,
  public.dds_finance_import_conflicts, public.dds_finance_exchange_rates, public.dds_finance_rate_fetch_log,
  public.dds_finance_audit_log
  from anon, authenticated;

grant select on public.dds_finance_profiles, public.dds_finance_settings, public.dds_finance_import_jobs,
  public.dds_finance_transactions, public.dds_finance_import_conflicts, public.dds_finance_exchange_rates,
  public.dds_finance_rate_fetch_log, public.dds_finance_audit_log
  to authenticated;

-- Perfil do usuário logado → id do DDS Finance (somente perfis ativos).
create or replace function public.dds_finance_uid()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.dds_finance_profiles p
  where p.auth_user_id = auth.uid() and p.is_active
$$;
revoke all on function public.dds_finance_uid() from public, anon;
grant execute on function public.dds_finance_uid() to authenticated, service_role;

create policy dds_finance_profiles_select_own on public.dds_finance_profiles
  for select to authenticated using (auth_user_id = (select auth.uid()) and is_active);

create policy dds_finance_settings_select_own on public.dds_finance_settings
  for select to authenticated using (user_id = (select public.dds_finance_uid()));

create policy dds_finance_import_jobs_select_own on public.dds_finance_import_jobs
  for select to authenticated using (user_id = (select public.dds_finance_uid()));

create policy dds_finance_transactions_select_own on public.dds_finance_transactions
  for select to authenticated using (user_id = (select public.dds_finance_uid()));

create policy dds_finance_import_conflicts_select_own on public.dds_finance_import_conflicts
  for select to authenticated using (user_id = (select public.dds_finance_uid()));

create policy dds_finance_audit_log_select_own on public.dds_finance_audit_log
  for select to authenticated using (user_id = (select public.dds_finance_uid()));

-- Cotações oficiais são públicas para quem tem conta no DDS Finance.
create policy dds_finance_exchange_rates_select on public.dds_finance_exchange_rates
  for select to authenticated using ((select public.dds_finance_uid()) is not null);

create policy dds_finance_rate_fetch_log_select on public.dds_finance_rate_fetch_log
  for select to authenticated using ((select public.dds_finance_uid()) is not null);

-- credentials e login_guard: RLS ativo e nenhuma política → só funções do servidor acessam.
