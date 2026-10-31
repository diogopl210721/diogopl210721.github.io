-- DDS Finance — cadastro aberto (31/10/2026, pedido do Diogo): a própria pessoa cria a conta com
-- nome, telefone e PIN. O app pede telefone e PIN duas vezes (contra erro de digitação) e a pessoa
-- pode trocar o PIN depois em Configurações. PIN esquecido continua sendo redefinido pelo administrador.
--
-- Proteções:
--   * o mesmo bloqueio por IP do login (30 erros em 15 min) vale aqui, e tentar um telefone que já tem
--     conta conta como erro, para dificultar descobrir quais telefones estão cadastrados;
--   * no máximo 5 contas novas por IP a cada hora;
--   * PIN fácil (1234, 1111…) é recusado; o PIN é guardado como bcrypt de um HMAC com segredo do Vault;
--   * a conta nasce sem privilégio de administrador.
create or replace function public.dds_finance_register(
  p_display_name text,
  p_phone text,
  p_pin text,
  p_remember boolean default true,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.dds_finance_normalize_phone(p_phone);
  v_name text := btrim(coalesce(p_display_name, ''));
  v_ip text := public.dds_finance__client_ip();
  v_ip_key text := case when v_ip is not null then 'ip:' || left(public.dds_finance__sha256('ip|' || v_ip), 32) end;
  v_reg_key text := case when v_ip is not null then 'reg:' || left(public.dds_finance__sha256('reg|' || v_ip), 32) end;
  g public.dds_finance_login_guard;
  v_until timestamptz;
  v_id uuid;
  v_token text;
  v_exp timestamptz;
begin
  if v_ip_key is not null then
    v_until := public.dds_finance__guard_locked_until(v_ip_key);
    if v_until is not null then
      return jsonb_build_object('ok', false, 'code', 'too_many_attempts', 'locked_until', v_until);
    end if;
  end if;

  -- limite de contas novas por IP (janela de 1 hora)
  if v_reg_key is not null then
    insert into public.dds_finance_login_guard (key) values (v_reg_key) on conflict (key) do nothing;
    select * into g from public.dds_finance_login_guard where key = v_reg_key for update;
    if g.window_started_at < now() - interval '1 hour' then
      update public.dds_finance_login_guard
        set failed_count = 0, window_started_at = now(), updated_at = now()
        where key = v_reg_key;
      g.failed_count := 0;
      g.window_started_at := now();
    end if;
    if g.failed_count >= 5 then
      return jsonb_build_object('ok', false, 'code', 'too_many_attempts', 'locked_until', g.window_started_at + interval '1 hour');
    end if;
  end if;

  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_phone');
  end if;
  if not public.dds_finance__pin_is_acceptable(p_pin) then
    return jsonb_build_object('ok', false, 'code', 'weak_pin');
  end if;
  if exists (select 1 from public.dds_finance_profiles where phone_normalized = v_phone) then
    if v_ip_key is not null then
      perform public.dds_finance__guard_fail(v_ip_key, 'window');
    end if;
    return jsonb_build_object('ok', false, 'code', 'phone_in_use');
  end if;

  begin
    insert into public.dds_finance_profiles (phone_normalized, display_name, is_admin, must_change_pin)
      values (v_phone, v_name, false, false)
      returning id into v_id;
  exception when unique_violation then
    -- dois cadastros simultâneos com o mesmo telefone
    return jsonb_build_object('ok', false, 'code', 'phone_in_use');
  end;
  insert into public.dds_finance_credentials (profile_id, pin_hash)
    values (v_id, public.dds_finance__hash_pin(v_id, p_pin));
  perform public.dds_finance__ensure_settings(v_id);

  if v_reg_key is not null then
    update public.dds_finance_login_guard
      set failed_count = failed_count + 1, updated_at = now()
      where key = v_reg_key;
  end if;

  -- já entra: mesma sessão do login (token aleatório; o banco guarda só o SHA-256)
  v_token := 'ddsf_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + case when coalesce(p_remember, true) then interval '30 days' else interval '12 hours' end;
  insert into public.dds_finance_sessions (profile_id, token_hash, remember, expires_at, user_agent)
    values (v_id, public.dds_finance__sha256(v_token), coalesce(p_remember, true), v_exp, left(p_user_agent, 300));
  update public.dds_finance_profiles set last_login_at = now() where id = v_id;
  perform public.dds_finance__audit(v_id, 'user_registered', jsonb_build_object('phone', public.dds_finance__mask_phone(v_phone)));

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_exp,
    'must_change_pin', false,
    'profile', public.dds_finance__profile_json(v_id));
end $$;

revoke all on function public.dds_finance_register(text, text, text, boolean, text) from public;
grant execute on function public.dds_finance_register(text, text, text, boolean, text) to anon, authenticated;
