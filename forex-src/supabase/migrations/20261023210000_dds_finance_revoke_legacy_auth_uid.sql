-- DDS Finance: a primeira versão (baseada em auth.uid()) foi substituída por sessões próprias.
-- Em vez de apagar (20261023130500_dds_finance_cleanup_auth_uid.sql, ainda não aplicada), só retira
-- a permissão de execução das funções antigas. Nada é removido. Aplicada em 23/10/2026.
revoke all on function public.dds_finance_change_pin(text, text) from public, anon, authenticated;
revoke all on function public.dds_finance_admin_create_user(text, text, boolean) from public, anon, authenticated;
revoke all on function public.dds_finance_admin_list_users() from public, anon, authenticated;
revoke all on function public.dds_finance_admin_reset_pin(uuid) from public, anon, authenticated;
revoke all on function public.dds_finance_admin_set_active(uuid, boolean) from public, anon, authenticated;
revoke all on function public.dds_finance_update_profile(text) from public, anon, authenticated;
revoke all on function public.dds_finance_update_settings(numeric, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.dds_finance_link_auth_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dds_finance_auth_attempt(text, text, text) from public, anon, authenticated;
revoke all on function public.dds_finance__is_admin() from public, anon, authenticated;
revoke all on function public.dds_finance_uid() from public, anon, authenticated;
