-- DDS Finance — PIN, bloqueio de tentativas, administração de usuários e configurações.
--
-- Como o PIN é guardado:
--   hash = bcrypt( HMAC-SHA256( profile_id || ':' || pin, pepper ) )
--   O pepper fica no Supabase Vault (criptografado), fora das tabelas. Um vazamento das
--   tabelas sozinho não permite testar os 10.000 PINs possíveis.
-- Bloqueio progressivo: 5 erros seguidos → 1, 5, 15, 60 e 240 minutos (o nível zera após login
-- correto ou 24h sem erros). Limite extra por IP: 30 erros em 15 minutos bloqueiam o IP por 15 min.

-- Pepper no Vault (gerado dentro do banco; o valor nunca sai dele).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'dds_finance_pin_pepper') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'dds_finance_pin_pepper',
      'DDS Finance: pepper do hash de PIN. Trocar invalida todos os PINs.');
  end if;
end $$;

create or replace function public.dds_finance_normalize_phone(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  v_intl boolean := left(btrim(coalesce(p, '')), 1) = '+';
begin
  v := ltrim(v, '0');
  if v = '' then
    return null;
  elsif length(v) in (10, 11) and not v_intl then
    return '55' || v;
  elsif length(v) in (12, 13) and left(v, 2) = '55' then
    return v;
  elsif v_intl and length(v) between 10 and 15 then
    return v;
  end if;
  return null;
end $$;

create or replace function public.dds_finance__mask_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null
    else '+' || left(p, 4) || repeat('•', greatest(length(p) - 8, 0)) || right(p, 4) end
$$;

create or replace function public.dds_finance__pin_is_acceptable(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p, '') ~ '^[0-9]{4}$'
    and p !~ '^([0-9])\1{3}$'
    and p not in ('0123', '1234', '2345', '3456', '4567', '5678', '6789',
                  '9876', '8765', '7654', '6543', '5432', '4321', '3210')
$$;

create or replace function public.dds_finance__random_pin()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  b bytea;
  v text;
begin
  loop
    b := extensions.gen_random_bytes(3);
    v := lpad((((get_byte(b, 0) << 16) | (get_byte(b, 1) << 8) | get_byte(b, 2)) % 10000)::text, 4, '0');
    exit when public.dds_finance__pin_is_acceptable(v);
  end loop;
  return v;
end $$;

create or replace function public.dds_finance__pin_digest(p_profile_id uuid, p_pin text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pepper text;
begin
  select ds.decrypted_secret into v_pepper
  from vault.decrypted_secrets ds
  where ds.name = 'dds_finance_pin_pepper';
  if v_pepper is null then
    raise exception 'dds_finance_pepper_missing';
  end if;
  return encode(extensions.hmac(p_profile_id::text || ':' || coalesce(p_pin, ''), v_pepper, 'sha256'), 'hex');
end $$;

create or replace function public.dds_finance__hash_pin(p_profile_id uuid, p_pin text)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select extensions.crypt(public.dds_finance__pin_digest(p_profile_id, p_pin), extensions.gen_salt('bf', 10))
$$;

create or replace function public.dds_finance__check_pin(p_profile_id uuid, p_pin text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  select c.pin_hash into v_hash from public.dds_finance_credentials c where c.profile_id = p_profile_id;
  if v_hash is null then
    -- mesmo custo de um teste real, para não revelar se o usuário existe
    perform extensions.crypt(public.dds_finance__pin_digest(gen_random_uuid(), p_pin), extensions.gen_salt('bf', 10));
    return false;
  end if;
  return extensions.crypt(public.dds_finance__pin_digest(p_profile_id, p_pin), v_hash) = v_hash;
end $$;

create or replace function public.dds_finance__audit(p_user_id uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.dds_finance_audit_log (user_id, action, details)
  values (p_user_id, p_action, coalesce(p_details, '{}'::jsonb))
$$;

-- Retorna o horário de desbloqueio se a chave estiver bloqueada.
create or replace function public.dds_finance__guard_locked_until(p_key text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select g.locked_until from public.dds_finance_login_guard g
  where g.key = p_key and g.locked_until > now()
$$;

-- Registra um erro. mode 'progressive' (telefone/troca de PIN) ou 'window' (IP).
create or replace function public.dds_finance__guard_fail(p_key text, p_mode text default 'progressive')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.dds_finance_login_guard;
  v_steps int[] := array[1, 5, 15, 60, 240];
  v_failed int;
  v_level int;
  v_until timestamptz;
begin
  insert into public.dds_finance_login_guard (key) values (p_key) on conflict (key) do nothing;
  select * into g from public.dds_finance_login_guard where key = p_key for update;

  if p_mode = 'window' then
    if g.window_started_at < now() - interval '15 minutes' then
      g.failed_count := 0;
      g.window_started_at := now();
    end if;
    v_failed := g.failed_count + 1;
    v_until := case when v_failed >= 30 then now() + interval '15 minutes' else null end;
    update public.dds_finance_login_guard
      set failed_count = case when v_until is null then v_failed else 0 end,
          window_started_at = g.window_started_at,
          locked_until = coalesce(v_until, locked_until),
          updated_at = now()
      where key = p_key;
    return jsonb_build_object('locked_until', v_until);
  end if;

  -- progressivo: 24h sem erros zera tudo
  if g.updated_at < now() - interval '24 hours' then
    g.failed_count := 0;
    g.lock_level := 0;
  end if;
  v_failed := g.failed_count + 1;
  if v_failed >= 5 then
    v_level := least(g.lock_level + 1, array_length(v_steps, 1));
    v_until := now() + make_interval(mins => v_steps[v_level]);
    update public.dds_finance_login_guard
      set failed_count = 0, lock_level = v_level, locked_until = v_until, updated_at = now()
      where key = p_key;
    return jsonb_build_object('locked_until', v_until, 'attempts_left', 0);
  end if;
  update public.dds_finance_login_guard
    set failed_count = v_failed, lock_level = g.lock_level, updated_at = now()
    where key = p_key;
  return jsonb_build_object('locked_until', null, 'attempts_left', 5 - v_failed);
end $$;

create or replace function public.dds_finance__guard_reset(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.dds_finance_login_guard where key = p_key
$$;

create or replace function public.dds_finance__ensure_settings(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.dds_finance_settings (user_id) values (p_user_id)
  on conflict (user_id) do nothing
$$;

-- ---------------------------------------------------------------------------
-- Login (chamado somente pela Edge Function forex-auth, com a chave de serviço)
-- ---------------------------------------------------------------------------
create or replace function public.dds_finance_auth_attempt(p_phone text, p_pin text, p_ip text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.dds_finance_normalize_phone(p_phone);
  v_ip_key text := 'ip:' || coalesce(nullif(btrim(p_ip), ''), 'unknown');
  v_phone_key text;
  v_until timestamptz;
  v_prof public.dds_finance_profiles;
  v_ok boolean;
  v_fail jsonb;
begin
  v_until := public.dds_finance__guard_locked_until(v_ip_key);
  if v_until is not null then
    return jsonb_build_object('ok', false, 'code', 'too_many_attempts', 'locked_until', v_until);
  end if;

  if v_phone is null or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    perform public.dds_finance__guard_fail(v_ip_key, 'window');
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
    perform public.dds_finance__guard_fail(v_ip_key, 'window');
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
  update public.dds_finance_profiles set last_login_at = now(), updated_at = now() where id = v_prof.id;
  perform public.dds_finance__audit(v_prof.id, 'login_success', '{}'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'profile_id', v_prof.id,
    'auth_user_id', v_prof.auth_user_id,
    'email', 'u-' || v_prof.id::text || '@forex.ddsinovacao.com.br',
    'must_change_pin', v_prof.must_change_pin);
end $$;

create or replace function public.dds_finance_link_auth_user(p_profile_id uuid, p_auth_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dds_finance_profiles
    set auth_user_id = p_auth_user_id, updated_at = now()
    where id = p_profile_id and (auth_user_id is null or auth_user_id = p_auth_user_id);
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- Troca de PIN (usuário logado)
-- ---------------------------------------------------------------------------
create or replace function public.dds_finance_change_pin(p_current_pin text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance_uid();
  v_key text;
  v_until timestamptz;
  v_fail jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  v_key := 'chg:' || v_uid::text;
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
  perform public.dds_finance__audit(v_uid, 'pin_changed', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Administração
-- ---------------------------------------------------------------------------
create or replace function public.dds_finance__is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.dds_finance_profiles p
                   where p.id = public.dds_finance_uid()), false)
$$;

-- Cria perfil + credencial + configurações. Retorna o PIN temporário (mostrado uma única vez).
create or replace function public.dds_finance__create_profile(p_display_name text, p_phone text, p_is_admin boolean, p_created_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.dds_finance_normalize_phone(p_phone);
  v_id uuid;
  v_pin text := public.dds_finance__random_pin();
begin
  if v_phone is null then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if exists (select 1 from public.dds_finance_profiles where phone_normalized = v_phone) then
    raise exception 'phone_in_use' using errcode = '23505';
  end if;
  insert into public.dds_finance_profiles (phone_normalized, display_name, is_admin, must_change_pin)
    values (v_phone, btrim(p_display_name), coalesce(p_is_admin, false), true)
    returning id into v_id;
  insert into public.dds_finance_credentials (profile_id, pin_hash)
    values (v_id, public.dds_finance__hash_pin(v_id, v_pin));
  perform public.dds_finance__ensure_settings(v_id);
  perform public.dds_finance__audit(p_created_by, 'user_created',
    jsonb_build_object('profile_id', v_id, 'phone', public.dds_finance__mask_phone(v_phone), 'is_admin', coalesce(p_is_admin, false)));
  return jsonb_build_object('profile_id', v_id, 'phone_normalized', v_phone, 'temp_pin', v_pin);
end $$;

create or replace function public.dds_finance_admin_create_user(p_display_name text, p_phone text, p_is_admin boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.dds_finance__is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.dds_finance__create_profile(p_display_name, p_phone, p_is_admin, public.dds_finance_uid());
end $$;

create or replace function public.dds_finance_admin_list_users()
returns table (
  id uuid, display_name text, phone_normalized text, is_admin boolean, is_active boolean,
  must_change_pin boolean, last_login_at timestamptz, locked_until timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.dds_finance__is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.display_name, p.phone_normalized, p.is_admin, p.is_active, p.must_change_pin,
           p.last_login_at, g.locked_until, p.created_at
    from public.dds_finance_profiles p
    left join public.dds_finance_login_guard g
      on g.key = 'phone:' || p.phone_normalized and g.locked_until > now()
    order by p.created_at;
end $$;

create or replace function public.dds_finance_admin_reset_pin(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_pin text := public.dds_finance__random_pin();
begin
  if not public.dds_finance__is_admin() then
    raise exception 'forbidden' using errcode = '42501';
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
  perform public.dds_finance__audit(public.dds_finance_uid(), 'pin_reset_by_admin', jsonb_build_object('profile_id', p_profile_id));
  perform public.dds_finance__audit(p_profile_id, 'pin_reset_by_admin', '{}'::jsonb);
  return jsonb_build_object('profile_id', p_profile_id, 'temp_pin', v_pin);
end $$;

create or replace function public.dds_finance_admin_set_active(p_profile_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.dds_finance__is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_profile_id = public.dds_finance_uid() then
    raise exception 'cannot_change_self' using errcode = '22023';
  end if;
  update public.dds_finance_profiles set is_active = p_active, updated_at = now() where id = p_profile_id;
  perform public.dds_finance__audit(public.dds_finance_uid(),
    case when p_active then 'user_reactivated' else 'user_deactivated' end,
    jsonb_build_object('profile_id', p_profile_id));
end $$;

-- ---------------------------------------------------------------------------
-- Perfil e configurações do próprio usuário
-- ---------------------------------------------------------------------------
create or replace function public.dds_finance_update_profile(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance_uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  update public.dds_finance_profiles set display_name = btrim(p_display_name), updated_at = now() where id = v_uid;
end $$;

create or replace function public.dds_finance__parse_time(p text, p_tz text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v timestamptz;
begin
  if p is null then
    return null;
  end if;
  if p ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?$' then
    v := (replace(p, 'T', ' ')::timestamp) at time zone p_tz;
  elsif p ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
    v := replace(p, 'T', ' ')::timestamptz;
  else
    return null;
  end if;
  if v < '2000-01-01'::timestamptz or v > now() + interval '2 days' then
    return null;
  end if;
  return v;
exception when others then
  return null;
end $$;

create or replace function public.dds_finance_update_settings(
  p_opening_balance numeric,
  p_capital_base numeric,
  p_timezone text,
  p_source_timezone text,
  p_return_method text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.dds_finance_uid();
  v_old public.dds_finance_settings;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
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
  -- fuso do arquivo mudou: recalcula o horário das movimentações sem fuso explícito
  if v_old.source_timezone is distinct from p_source_timezone then
    update public.dds_finance_transactions
      set transaction_time = public.dds_finance__parse_time(time_raw, p_source_timezone), updated_at = now()
      where user_id = v_uid
        and time_raw !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
        and public.dds_finance__parse_time(time_raw, p_source_timezone) is not null;
  end if;
  perform public.dds_finance__audit(v_uid, 'settings_updated', jsonb_build_object(
    'opening_balance', p_opening_balance, 'capital_base', p_capital_base,
    'timezone', p_timezone, 'source_timezone', p_source_timezone, 'return_method', p_return_method));
end $$;

-- ---------------------------------------------------------------------------
-- Privilégios: funções internas (prefixo dds_finance__) só para o próprio banco.
-- ---------------------------------------------------------------------------
revoke all on function public.dds_finance_normalize_phone(text) from public, anon;
grant execute on function public.dds_finance_normalize_phone(text) to authenticated, service_role;

revoke all on function public.dds_finance__mask_phone(text) from public, anon, authenticated;
revoke all on function public.dds_finance__pin_is_acceptable(text) from public, anon, authenticated;
revoke all on function public.dds_finance__random_pin() from public, anon, authenticated;
revoke all on function public.dds_finance__pin_digest(uuid, text) from public, anon, authenticated;
revoke all on function public.dds_finance__hash_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.dds_finance__check_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.dds_finance__audit(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.dds_finance__guard_locked_until(text) from public, anon, authenticated;
revoke all on function public.dds_finance__guard_fail(text, text) from public, anon, authenticated;
revoke all on function public.dds_finance__guard_reset(text) from public, anon, authenticated;
revoke all on function public.dds_finance__ensure_settings(uuid) from public, anon, authenticated;
revoke all on function public.dds_finance__is_admin() from public, anon, authenticated;
revoke all on function public.dds_finance__create_profile(text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.dds_finance__parse_time(text, text) from public, anon, authenticated;

revoke all on function public.dds_finance_auth_attempt(text, text, text) from public, anon, authenticated;
grant execute on function public.dds_finance_auth_attempt(text, text, text) to service_role;
revoke all on function public.dds_finance_link_auth_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dds_finance_link_auth_user(uuid, uuid) to service_role;

revoke all on function public.dds_finance_change_pin(text, text) from public, anon;
grant execute on function public.dds_finance_change_pin(text, text) to authenticated;
revoke all on function public.dds_finance_admin_create_user(text, text, boolean) from public, anon;
grant execute on function public.dds_finance_admin_create_user(text, text, boolean) to authenticated;
revoke all on function public.dds_finance_admin_list_users() from public, anon;
grant execute on function public.dds_finance_admin_list_users() to authenticated;
revoke all on function public.dds_finance_admin_reset_pin(uuid) from public, anon;
grant execute on function public.dds_finance_admin_reset_pin(uuid) to authenticated;
revoke all on function public.dds_finance_admin_set_active(uuid, boolean) from public, anon;
grant execute on function public.dds_finance_admin_set_active(uuid, boolean) to authenticated;
revoke all on function public.dds_finance_update_profile(text) from public, anon;
grant execute on function public.dds_finance_update_profile(text) to authenticated;
revoke all on function public.dds_finance_update_settings(numeric, numeric, text, text, text) from public, anon;
grant execute on function public.dds_finance_update_settings(numeric, numeric, text, text, text) to authenticated;
