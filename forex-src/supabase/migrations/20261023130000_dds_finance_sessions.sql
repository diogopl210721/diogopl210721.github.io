-- DDS Finance — sessões próprias, sem auth.users.
--
-- Por quê: a instância é compartilhada e tem um gatilho em auth.users (dds_flow.handle_new_user)
-- que cria perfis em outro sistema para todo usuário novo do Auth. Para não misturar as bases,
-- o DDS Finance usa sessões próprias (mesmo padrão do Tarefa Diária):
--   * o login devolve um token aleatório de 256 bits (prefixo ddsf_);
--   * o banco guarda só o SHA-256 do token;
--   * toda função pública recebe o token e descobre o usuário a partir dele;
--   * as tabelas não têm leitura direta: tudo passa por funções que filtram pelo dono.
-- Aplicada em 5 partes (dds_finance_sessions_a_table … _e_admin) em 23/10/2026.
-- A limpeza dos objetos antigos baseados em auth.uid() está em 20261023130500 (precisa de aprovação).

-- Tabelas sem leitura direta (tudo passa pelas funções abaixo).
revoke all on public.dds_finance_profiles, public.dds_finance_credentials, public.dds_finance_login_guard,
  public.dds_finance_settings, public.dds_finance_import_jobs, public.dds_finance_transactions,
  public.dds_finance_import_conflicts, public.dds_finance_exchange_rates, public.dds_finance_rate_fetch_log,
  public.dds_finance_audit_log
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Sessões
-- ---------------------------------------------------------------------------
create table public.dds_finance_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.dds_finance_profiles(id) on delete cascade,
  token_hash text not null unique,
  remember boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);
create index dds_finance_sessions_profile_idx on public.dds_finance_sessions (profile_id) where revoked_at is null;
alter table public.dds_finance_sessions enable row level security;
revoke all on public.dds_finance_sessions from anon, authenticated;

create or replace function public.dds_finance__sha256(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(coalesce(p, ''), 'UTF8'), 'sha256'), 'hex')
$$;

-- Usuário dono do token (null se inválido, vencido, revogado ou usuário desativado).
create or replace function public.dds_finance__session_uid(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.profile_id
  from public.dds_finance_sessions s
  join public.dds_finance_profiles p on p.id = s.profile_id and p.is_active
  where coalesce(p_token, '') ~ '^ddsf_[0-9a-f]{64}$'
    and s.token_hash = public.dds_finance__sha256(p_token)
    and s.revoked_at is null
    and s.expires_at > now()
$$;

create or replace function public.dds_finance__require(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid := public.dds_finance__session_uid(p_token);
begin
  if v is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v;
end $$;

create or replace function public.dds_finance__require_admin(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid := public.dds_finance__require(p_token);
begin
  if not exists (select 1 from public.dds_finance_profiles where id = v and is_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v;
end $$;

-- IP de quem chamou (cabeçalhos repassados pela API). Null se não houver.
create or replace function public.dds_finance__client_ip()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  h json;
  v text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is null then
    return null;
  end if;
  v := coalesce(nullif(btrim(h->>'cf-connecting-ip'), ''),
                nullif(btrim(h->>'x-real-ip'), ''),
                nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''));
  if v is null or length(v) > 64 then
    return null;
  end if;
  return v;
end $$;

create or replace function public.dds_finance__revoke_sessions(p_profile_id uuid, p_except_hash text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.dds_finance_sessions
    set revoked_at = now()
    where profile_id = p_profile_id and revoked_at is null
      and (p_except_hash is null or token_hash <> p_except_hash);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.dds_finance__profile_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'phone', p.phone_normalized,
    'is_admin', p.is_admin, 'must_change_pin', p.must_change_pin,
    'last_login_at', p.last_login_at, 'created_at', p.created_at)
  from public.dds_finance_profiles p where p.id = p_id
$$;

create or replace function public.dds_finance__settings_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'opening_balance', s.opening_balance, 'capital_base', s.capital_base, 'currency', s.currency,
    'timezone', s.timezone, 'source_timezone', s.source_timezone, 'return_method', s.return_method,
    'updated_at', s.updated_at)
  from public.dds_finance_settings s where s.user_id = p_id
$$;

-- ---------------------------------------------------------------------------
-- 3) Login, sessão e PIN
-- ---------------------------------------------------------------------------
create or replace function public.dds_finance_login(p_phone text, p_pin text, p_remember boolean default true, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.dds_finance_normalize_phone(p_phone);
  v_ip text := public.dds_finance__client_ip();
  v_ip_key text := case when v_ip is not null then 'ip:' || left(public.dds_finance__sha256('ip|' || v_ip), 32) end;
  v_phone_key text;
  v_until timestamptz;
  v_prof public.dds_finance_profiles;
  v_ok boolean;
  v_fail jsonb;
  v_token text;
  v_exp timestamptz;
begin
  if v_ip_key is not null then
    v_until := public.dds_finance__guard_locked_until(v_ip_key);
    if v_until is not null then
      return jsonb_build_object('ok', false, 'code', 'too_many_attempts', 'locked_until', v_until);
    end if;
  end if;

  if v_phone is null or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    if v_ip_key is not null then
      perform public.dds_finance__guard_fail(v_ip_key, 'window');
    end if;
    return jsonb_build_object('ok', false, 'code', 'invalid_credentials');
  end if;

  v_phone_key := 'phone:' || v_phone;
  v_until := public.dds_finance__guard_locked_until(v_phone_key);
  if v_until is not null then
    return jsonb_build_object('ok', false, 'code', 'locked', 'locked_until', v_until);
  end if;

  select * into v_prof from public.dds_finance_profiles where phone_normalized = v_phone;
  v_ok := coalesce(public.dds_finance__check_pin(coalesce(v_prof.id, gen_random_uuid()), p_pin)
          and v_prof.id is not null and v_prof.is_active, false);

  if not v_ok then
    v_fail := public.dds_finance__guard_fail(v_phone_key, 'progressive');
    if v_ip_key is not null then
      perform public.dds_finance__guard_fail(v_ip_key, 'window');
    end if;
    perform public.dds_finance__audit(v_prof.id,
      case when v_fail->>'locked_until' is not null then 'login_locked' else 'login_failed' end,
      jsonb_build_object('phone', public.dds_finance__mask_phone(v_phone)));
    return jsonb_build_object(
      'ok', false,
      'code', case when v_fail->>'locked_until' is not null then 'locked' else 'invalid_credentials' end,
      'locked_until', v_fail->'locked_until',
      'attempts_left', v_fail->'attempts_left');
  end if;

  perform public.dds_finance__guard_reset(v_phone_key);
  perform public.dds_finance__ensure_settings(v_prof.id);

  v_token := 'ddsf_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + case when coalesce(p_remember, true) then interval '30 days' else interval '12 hours' end;
  insert into public.dds_finance_sessions (profile_id, token_hash, remember, expires_at, user_agent)
    values (v_prof.id, public.dds_finance__sha256(v_token), coalesce(p_remember, true), v_exp, left(p_user_agent, 300));
  -- sessões vencidas são apagadas pela rotina diária (dds_finance_guard_cleanup)

  update public.dds_finance_profiles set last_login_at = now(), updated_at = now() where id = v_prof.id;
  perform public.dds_finance__audit(v_prof.id, 'login_success', jsonb_build_object('remember', coalesce(p_remember, true)));

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_exp,
    'must_change_pin', v_prof.must_change_pin,
    'profile', public.dds_finance__profile_json(v_prof.id));
end $$;

create or replace function public.dds_finance_logout(p_token text, p_all boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__session_uid(p_token);
  n int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', true, 'revoked', 0);
  end if;
  if coalesce(p_all, false) then
    n := public.dds_finance__revoke_sessions(v_uid);
  else
    update public.dds_finance_sessions set revoked_at = now()
      where token_hash = public.dds_finance__sha256(p_token) and revoked_at is null;
    get diagnostics n = row_count;
  end if;
  perform public.dds_finance__audit(v_uid, case when coalesce(p_all, false) then 'logout_all' else 'logout' end,
    jsonb_build_object('revoked', n));
  return jsonb_build_object('ok', true, 'revoked', n);
end $$;

-- Dados da sessão atual; renova a validade das sessões "manter conectado".
create or replace function public.dds_finance_me(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v_hash text := public.dds_finance__sha256(p_token);
  v_exp timestamptz;
begin
  update public.dds_finance_sessions
    set last_seen_at = now(),
        expires_at = case when remember then greatest(expires_at, now() + interval '30 days') else expires_at end
    where token_hash = v_hash and last_seen_at < now() - interval '5 minutes';
  select expires_at into v_exp from public.dds_finance_sessions where token_hash = v_hash;
  perform public.dds_finance__ensure_settings(v_uid);
  return jsonb_build_object(
    'profile', public.dds_finance__profile_json(v_uid),
    'settings', public.dds_finance__settings_json(v_uid),
    'session', jsonb_build_object('expires_at', v_exp),
    'active_sessions', (select count(*) from public.dds_finance_sessions
                        where profile_id = v_uid and revoked_at is null and expires_at > now()));
end $$;

create or replace function public.dds_finance_change_pin(p_token text, p_current_pin text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v_key text := 'chg:' || v_uid::text;
  v_until timestamptz;
  v_fail jsonb;
  v_others int;
begin
  v_until := public.dds_finance__guard_locked_until(v_key);
  if v_until is not null then
    return jsonb_build_object('ok', false, 'code', 'locked', 'locked_until', v_until);
  end if;
  if not public.dds_finance__check_pin(v_uid, p_current_pin) then
    v_fail := public.dds_finance__guard_fail(v_key, 'progressive');
    perform public.dds_finance__audit(v_uid, 'pin_change_failed', '{}'::jsonb);
    return jsonb_build_object('ok', false,
      'code', case when v_fail->>'locked_until' is not null then 'locked' else 'wrong_current_pin' end,
      'locked_until', v_fail->'locked_until', 'attempts_left', v_fail->'attempts_left');
  end if;
  if not public.dds_finance__pin_is_acceptable(p_new_pin) then
    return jsonb_build_object('ok', false, 'code', 'weak_pin');
  end if;
  if p_new_pin = p_current_pin then
    return jsonb_build_object('ok', false, 'code', 'same_pin');
  end if;
  update public.dds_finance_credentials
    set pin_hash = public.dds_finance__hash_pin(v_uid, p_new_pin), updated_at = now()
    where profile_id = v_uid;
  update public.dds_finance_profiles set must_change_pin = false, updated_at = now() where id = v_uid;
  perform public.dds_finance__guard_reset(v_key);
  v_others := public.dds_finance__revoke_sessions(v_uid, public.dds_finance__sha256(p_token));
  perform public.dds_finance__audit(v_uid, 'pin_changed', jsonb_build_object('other_sessions_revoked', v_others));
  return jsonb_build_object('ok', true, 'other_sessions_revoked', v_others);
end $$;

create or replace function public.dds_finance_update_profile(p_token text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
begin
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  update public.dds_finance_profiles set display_name = btrim(p_display_name), updated_at = now() where id = v_uid;
  return public.dds_finance__profile_json(v_uid);
end $$;

create or replace function public.dds_finance_update_settings(
  p_token text,
  p_opening_balance numeric,
  p_capital_base numeric,
  p_timezone text,
  p_source_timezone text,
  p_return_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance__require(p_token);
  v_old public.dds_finance_settings;
  v_moved int := 0;
begin
  if p_opening_balance is null or p_opening_balance < 0 or p_opening_balance > 1e12 then
    raise exception 'invalid_opening_balance' using errcode = '22023';
  end if;
  if p_capital_base is not null and (p_capital_base <= 0 or p_capital_base > 1e12) then
    raise exception 'invalid_capital_base' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_source_timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  if p_return_method not in ('twr', 'simple') then
    raise exception 'invalid_return_method' using errcode = '22023';
  end if;
  perform public.dds_finance__ensure_settings(v_uid);
  select * into v_old from public.dds_finance_settings where user_id = v_uid;
  update public.dds_finance_settings
    set opening_balance = round(p_opening_balance, 2),
        capital_base = round(p_capital_base, 2),
        timezone = p_timezone,
        source_timezone = p_source_timezone,
        return_method = p_return_method,
        updated_at = now()
    where user_id = v_uid;
  -- fuso do arquivo mudou: reinterpreta o horário das movimentações sem fuso explícito
  if v_old.source_timezone is distinct from p_source_timezone then
    update public.dds_finance_transactions
      set transaction_time = public.dds_finance__parse_time(time_raw, p_source_timezone), updated_at = now()
      where user_id = v_uid
        and time_raw !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
        and public.dds_finance__parse_time(time_raw, p_source_timezone) is not null;
    get diagnostics v_moved = row_count;
  end if;
  perform public.dds_finance__audit(v_uid, 'settings_updated', jsonb_build_object(
    'opening_balance', p_opening_balance, 'capital_base', p_capital_base,
    'timezone', p_timezone, 'source_timezone', p_source_timezone, 'return_method', p_return_method,
    'transactions_retimed', v_moved));
  return public.dds_finance__settings_json(v_uid);
end $$;

-- ---------------------------------------------------------------------------
-- 4) Administração (o admin cria acessos e redefine PINs; não vê dados financeiros)
-- ---------------------------------------------------------------------------
create or replace function public.dds_finance_admin_list_users(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.dds_finance__require_admin(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'phone', p.phone_normalized, 'is_admin', p.is_admin,
      'is_active', p.is_active, 'must_change_pin', p.must_change_pin, 'last_login_at', p.last_login_at,
      'created_at', p.created_at, 'locked_until', g.locked_until,
      'transactions', (select count(*) from public.dds_finance_transactions t where t.user_id = p.id))
      order by p.created_at)
    from public.dds_finance_profiles p
    left join public.dds_finance_login_guard g
      on g.key = 'phone:' || p.phone_normalized and g.locked_until > now()), '[]'::jsonb);
end $$;

create or replace function public.dds_finance_admin_create_user(p_token text, p_display_name text, p_phone text, p_is_admin boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.dds_finance__require_admin(p_token);
begin
  return public.dds_finance__create_profile(p_display_name, p_phone, p_is_admin, v_admin);
end $$;

create or replace function public.dds_finance_admin_reset_pin(p_token text, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.dds_finance__require_admin(p_token);
  v_phone text;
  v_pin text := public.dds_finance__random_pin();
begin
  if p_profile_id = v_admin then
    raise exception 'use_change_pin' using errcode = '22023';
  end if;
  select phone_normalized into v_phone from public.dds_finance_profiles where id = p_profile_id;
  if v_phone is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.dds_finance_credentials
    set pin_hash = public.dds_finance__hash_pin(p_profile_id, v_pin), updated_at = now()
    where profile_id = p_profile_id;
  update public.dds_finance_profiles set must_change_pin = true, updated_at = now() where id = p_profile_id;
  perform public.dds_finance__guard_reset('phone:' || v_phone);
  perform public.dds_finance__guard_reset('chg:' || p_profile_id::text);
  perform public.dds_finance__revoke_sessions(p_profile_id);
  perform public.dds_finance__audit(v_admin, 'pin_reset_by_admin', jsonb_build_object('profile_id', p_profile_id));
  perform public.dds_finance__audit(p_profile_id, 'pin_reset_by_admin', '{}'::jsonb);
  return jsonb_build_object('profile_id', p_profile_id, 'temp_pin', v_pin);
end $$;

create or replace function public.dds_finance_admin_set_active(p_token text, p_profile_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.dds_finance__require_admin(p_token);
begin
  if p_profile_id = v_admin then
    raise exception 'cannot_change_self' using errcode = '22023';
  end if;
  update public.dds_finance_profiles set is_active = coalesce(p_active, false), updated_at = now() where id = p_profile_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not coalesce(p_active, false) then
    perform public.dds_finance__revoke_sessions(p_profile_id);
  end if;
  perform public.dds_finance__audit(v_admin,
    case when p_active then 'user_reactivated' else 'user_deactivated' end,
    jsonb_build_object('profile_id', p_profile_id));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 5) Privilégios
-- ---------------------------------------------------------------------------
revoke all on function public.dds_finance__sha256(text) from public, anon, authenticated;
revoke all on function public.dds_finance__session_uid(text) from public, anon, authenticated;
revoke all on function public.dds_finance__require(text) from public, anon, authenticated;
revoke all on function public.dds_finance__require_admin(text) from public, anon, authenticated;
revoke all on function public.dds_finance__client_ip() from public, anon, authenticated;
revoke all on function public.dds_finance__revoke_sessions(uuid, text) from public, anon, authenticated;
revoke all on function public.dds_finance__profile_json(uuid) from public, anon, authenticated;
revoke all on function public.dds_finance__settings_json(uuid) from public, anon, authenticated;

revoke all on function public.dds_finance_login(text, text, boolean, text) from public;
grant execute on function public.dds_finance_login(text, text, boolean, text) to anon, authenticated;
revoke all on function public.dds_finance_logout(text, boolean) from public;
grant execute on function public.dds_finance_logout(text, boolean) to anon, authenticated;
revoke all on function public.dds_finance_me(text) from public;
grant execute on function public.dds_finance_me(text) to anon, authenticated;
revoke all on function public.dds_finance_change_pin(text, text, text) from public;
grant execute on function public.dds_finance_change_pin(text, text, text) to anon, authenticated;
revoke all on function public.dds_finance_update_profile(text, text) from public;
grant execute on function public.dds_finance_update_profile(text, text) to anon, authenticated;
revoke all on function public.dds_finance_update_settings(text, numeric, numeric, text, text, text) from public;
grant execute on function public.dds_finance_update_settings(text, numeric, numeric, text, text, text) to anon, authenticated;
revoke all on function public.dds_finance_admin_list_users(text) from public;
grant execute on function public.dds_finance_admin_list_users(text) to anon, authenticated;
revoke all on function public.dds_finance_admin_create_user(text, text, text, boolean) from public;
grant execute on function public.dds_finance_admin_create_user(text, text, text, boolean) to anon, authenticated;
revoke all on function public.dds_finance_admin_reset_pin(text, uuid) from public;
grant execute on function public.dds_finance_admin_reset_pin(text, uuid) to anon, authenticated;
revoke all on function public.dds_finance_admin_set_active(text, uuid, boolean) from public;
grant execute on function public.dds_finance_admin_set_active(text, uuid, boolean) to anon, authenticated;

-- normalização de telefone é inofensiva, mas não precisa ficar exposta
revoke all on function public.dds_finance_normalize_phone(text) from public, anon, authenticated;
