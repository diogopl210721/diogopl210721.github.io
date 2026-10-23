-- DDS Finance — limpeza (opcional) do que dependia de auth.uid().
-- Só objetos do DDS Finance criados em 23/10/2026, vazios e sem uso depois da migração de sessões.
-- Precisa de aprovação por conter DROP.
-- ---------------------------------------------------------------------------
-- 1) Desfaz o que dependia de auth.uid() (tabelas vazias, nada em produção ainda)
-- ---------------------------------------------------------------------------
drop policy if exists dds_finance_profiles_select_own on public.dds_finance_profiles;
drop policy if exists dds_finance_settings_select_own on public.dds_finance_settings;
drop policy if exists dds_finance_import_jobs_select_own on public.dds_finance_import_jobs;
drop policy if exists dds_finance_transactions_select_own on public.dds_finance_transactions;
drop policy if exists dds_finance_import_conflicts_select_own on public.dds_finance_import_conflicts;
drop policy if exists dds_finance_audit_log_select_own on public.dds_finance_audit_log;
drop policy if exists dds_finance_exchange_rates_select on public.dds_finance_exchange_rates;
drop policy if exists dds_finance_rate_fetch_log_select on public.dds_finance_rate_fetch_log;

drop function if exists public.dds_finance_change_pin(text, text);
drop function if exists public.dds_finance_admin_create_user(text, text, boolean);
drop function if exists public.dds_finance_admin_list_users();
drop function if exists public.dds_finance_admin_reset_pin(uuid);
drop function if exists public.dds_finance_admin_set_active(uuid, boolean);
drop function if exists public.dds_finance_update_profile(text);
drop function if exists public.dds_finance_update_settings(numeric, numeric, text, text, text);
drop function if exists public.dds_finance_link_auth_user(uuid, uuid);
drop function if exists public.dds_finance_auth_attempt(text, text, text);
drop function if exists public.dds_finance__is_admin();
drop function if exists public.dds_finance_uid();

alter table public.dds_finance_profiles drop column if exists auth_user_id;

