-- =====================================================================
-- Tarefa Diária — banco de dados (prefixo td_)
-- Projeto Supabase compartilhado. Não altera nenhuma tabela existente.
--
-- Modelo de acesso:
--   * Login simples por celular + PIN de 4 dígitos, validado no banco.
--   * PIN guardado com bcrypt; bloqueio progressivo após 5 erros.
--   * Login devolve um token aleatório (256 bits); o banco guarda só o hash.
--   * Tabelas td_ com RLS ligada e SEM políticas: anon/authenticated não
--     leem nem escrevem nada diretamente. Todo acesso passa pelas funções
--     RPC abaixo (SECURITY DEFINER), que validam o token antes de agir.
--   * Histórico append-only (trigger impede UPDATE/DELETE).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------
create or replace function public.td_norm(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(translate(coalesce(t, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;

create or replace function public.td_fone(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when length(d) in (12, 13) and left(d, 2) = '55' then substr(d, 3) else d end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x
$$;

create or replace function public.td_cod(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select upper(regexp_replace(trim(coalesce(t, '')), '\s+', '', 'g'))
$$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.td_usuarios (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(trim(nome)) between 2 and 80),
  telefone       text not null unique check (telefone ~ '^\d{10,11}$'),
  pin_hash       text not null,
  admin          boolean not null default false,
  ativo          boolean not null default true,
  trocar_pin     boolean not null default true,
  tentativas     int not null default 0,
  bloqueios      int not null default 0,
  bloqueado_ate  timestamptz,
  ultimo_acesso  timestamptz,
  criado_em      timestamptz not null default now()
);

create table if not exists public.td_sessoes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.td_usuarios(id) on delete cascade,
  token_hash  text not null unique,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  ultimo_uso  timestamptz not null default now()
);
create index if not exists td_sessoes_usuario_idx on public.td_sessoes(usuario_id);

create table if not exists public.td_consultores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (length(trim(nome)) between 2 and 80),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
create unique index if not exists td_consultores_nome_uk on public.td_consultores (public.td_norm(nome));

create table if not exists public.td_clientes (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null check (length(trim(codigo)) between 1 and 40),
  codigo_norm    text generated always as (public.td_cod(codigo)) stored,
  nome           text not null check (length(trim(nome)) between 1 and 180),
  contato        text,
  telefone       text,
  endereco       text,
  observacoes    text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint td_clientes_codigo_uk unique (codigo_norm)
);
create index if not exists td_clientes_nome_trgm on public.td_clientes using gin (public.td_norm(nome) gin_trgm_ops);

create table if not exists public.td_demandas (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references public.td_clientes(id) on delete restrict,
  consultor           text not null,
  origem              text not null check (origem in ('Salesforce', 'TOTVS')),
  tipo                text not null check (tipo in ('OC', 'CI')),
  numero_registro     text,
  contato             text,
  telefone            text,
  status              text not null default 'Abrir'
                      check (status in ('Abrir', 'Pendente', 'Aguardando', 'Em andamento', 'Concluído')),
  descricao_anterior  text,
  descricao_atual     text not null,
  proxima_acao        text,
  prazo_proxima_acao  date,
  aberta_em           timestamptz not null default now(),
  atualizada_em       timestamptz not null default now(),
  concluida_em        timestamptz,
  criado_por          uuid references public.td_usuarios(id),
  busca               text not null default '',
  -- Regra do negócio: Salesforce é sempre OC; TOTVS é sempre CI.
  constraint td_origem_tipo check ((origem = 'Salesforce' and tipo = 'OC') or (origem = 'TOTVS' and tipo = 'CI')),
  constraint td_concluida_coerente check ((status = 'Concluído') = (concluida_em is not null))
);
create index if not exists td_demandas_cliente_idx on public.td_demandas(cliente_id);
create index if not exists td_demandas_status_abertura_idx on public.td_demandas(status, aberta_em);
create index if not exists td_demandas_concluida_idx on public.td_demandas(concluida_em desc) where status = 'Concluído';
create index if not exists td_demandas_busca_trgm on public.td_demandas using gin (busca gin_trgm_ops);

create table if not exists public.td_historico (
  id               uuid primary key default gen_random_uuid(),
  seq              bigint generated always as identity,
  demanda_id       uuid not null references public.td_demandas(id) on delete restrict,
  acao             text not null check (acao in ('abertura', 'atualização', 'mudança de status', 'conclusão', 'reabertura', 'edição')),
  descricao        text not null,
  status_anterior  text,
  status_novo      text,
  autor            text not null,
  autor_id         uuid references public.td_usuarios(id),
  registrado_em    timestamptz not null default now()
);
create index if not exists td_historico_demanda_idx on public.td_historico(demanda_id, seq desc);

create table if not exists public.td_auditoria_clientes (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.td_clientes(id) on delete cascade,
  campo           text not null,
  valor_anterior  text,
  valor_novo      text,
  autor           text not null,
  registrado_em   timestamptz not null default now()
);
create index if not exists td_auditoria_cliente_idx on public.td_auditoria_clientes(cliente_id, registrado_em desc);

-- ---------------------------------------------------------------------
-- Fechar acesso direto
-- ---------------------------------------------------------------------
alter table public.td_usuarios           enable row level security;
alter table public.td_sessoes            enable row level security;
alter table public.td_consultores        enable row level security;
alter table public.td_clientes           enable row level security;
alter table public.td_demandas           enable row level security;
alter table public.td_historico          enable row level security;
alter table public.td_auditoria_clientes enable row level security;

revoke all on table public.td_usuarios, public.td_sessoes, public.td_consultores, public.td_clientes,
  public.td_demandas, public.td_historico, public.td_auditoria_clientes from anon, authenticated;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function public.td_historico_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'O histórico é imutável: registros não podem ser alterados ou apagados.';
end $$;

create trigger td_historico_imutavel_trg before update or delete on public.td_historico
  for each row execute function public.td_historico_imutavel();

create or replace function public.td_calc_busca() returns trigger
language plpgsql set search_path = public as $$
declare c public.td_clientes;
begin
  select * into c from public.td_clientes where id = new.cliente_id;
  new.busca := public.td_norm(concat_ws(' ',
    c.codigo, c.codigo_norm, c.nome, c.contato, c.telefone,
    new.tipo, new.numero_registro, new.tipo || coalesce(new.numero_registro, ''), new.origem,
    new.consultor, new.contato, new.telefone,
    new.descricao_atual, new.descricao_anterior, new.proxima_acao));
  return new;
end $$;

create trigger td_demandas_busca_trg before insert or update on public.td_demandas
  for each row execute function public.td_calc_busca();

create or replace function public.td_clientes_pos_update() returns trigger
language plpgsql set search_path = public as $$
declare v_autor text := coalesce(nullif(current_setting('td.autor', true), ''), 'sistema');
begin
  if new.codigo      is distinct from old.codigo      then insert into td_auditoria_clientes(cliente_id, campo, valor_anterior, valor_novo, autor) values (new.id, 'Código', old.codigo, new.codigo, v_autor); end if;
  if new.nome        is distinct from old.nome        then insert into td_auditoria_clientes(cliente_id, campo, valor_anterior, valor_novo, autor) values (new.id, 'Nome', old.nome, new.nome, v_autor); end if;
  if new.contato     is distinct from old.contato     then insert into td_auditoria_clientes(cliente_id, campo, valor_anterior, valor_novo, autor) values (new.id, 'Contato', old.contato, new.contato, v_autor); end if;
  if new.telefone    is distinct from old.telefone    then insert into td_auditoria_clientes(cliente_id, campo, valor_anterior, valor_novo, autor) values (new.id, 'Telefone', old.telefone, new.telefone, v_autor); end if;
  if new.endereco    is distinct from old.endereco    then insert into td_auditoria_clientes(cliente_id, campo, valor_anterior, valor_novo, autor) values (new.id, 'Endereço', old.endereco, new.endereco, v_autor); end if;
  if new.observacoes is distinct from old.observacoes then insert into td_auditoria_clientes(cliente_id, campo, valor_anterior, valor_novo, autor) values (new.id, 'Observações', left(old.observacoes, 300), left(new.observacoes, 300), v_autor); end if;
  if new.ativo       is distinct from old.ativo       then insert into td_auditoria_clientes(cliente_id, campo, valor_anterior, valor_novo, autor) values (new.id, 'Situação', case when old.ativo then 'Ativo' else 'Inativo' end, case when new.ativo then 'Ativo' else 'Inativo' end, v_autor); end if;
  if new.codigo is distinct from old.codigo or new.nome is distinct from old.nome
     or new.contato is distinct from old.contato or new.telefone is distinct from old.telefone then
    update td_demandas set cliente_id = cliente_id where cliente_id = new.id; -- recalcula busca
  end if;
  return new;
end $$;

create trigger td_clientes_pos_update_trg after update on public.td_clientes
  for each row execute function public.td_clientes_pos_update();

-- ---------------------------------------------------------------------
-- Sessão e serialização
-- ---------------------------------------------------------------------
create or replace function public.td_sessao(p_token text, p_permitir_troca boolean default false)
returns public.td_usuarios
language plpgsql security definer set search_path = public, extensions as $$
declare s public.td_sessoes; u public.td_usuarios;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'SESSAO_INVALIDA';
  end if;
  select * into s from td_sessoes
   where token_hash = encode(digest(p_token, 'sha256'), 'hex') and expira_em > now();
  if not found then raise exception 'SESSAO_INVALIDA'; end if;
  select * into u from td_usuarios where id = s.usuario_id and ativo;
  if not found then raise exception 'SESSAO_INVALIDA'; end if;
  if u.trocar_pin and not p_permitir_troca then raise exception 'TROCAR_PIN'; end if;
  if s.ultimo_uso < now() - interval '10 minutes' then
    update td_sessoes set ultimo_uso = now() where id = s.id;
  end if;
  perform set_config('td.autor', u.nome, true);
  return u;
end $$;

create or replace function public.td_usuario_json(u public.td_usuarios) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', u.id, 'nome', u.nome, 'telefone', u.telefone,
    'admin', u.admin, 'trocar_pin', u.trocar_pin)
$$;

create or replace function public.td_cliente_json(c public.td_clientes) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nome', c.nome, 'contato', c.contato,
    'telefone', c.telefone, 'endereco', c.endereco, 'observacoes', c.observacoes, 'ativo', c.ativo,
    'criado_em', c.criado_em, 'atualizado_em', c.atualizado_em)
$$;

create or replace function public.td_linha(d public.td_demandas, c public.td_clientes) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', d.id, 'cliente_id', c.id, 'codigo', c.codigo, 'cliente', c.nome,
    'contato', coalesce(nullif(d.contato, ''), c.contato),
    'telefone', coalesce(nullif(d.telefone, ''), c.telefone),
    'consultor', d.consultor, 'origem', d.origem, 'tipo', d.tipo, 'numero_registro', d.numero_registro,
    'status', d.status, 'descricao_anterior', d.descricao_anterior, 'descricao_atual', d.descricao_atual,
    'proxima_acao', d.proxima_acao, 'prazo_proxima_acao', d.prazo_proxima_acao,
    'aberta_em', d.aberta_em, 'atualizada_em', d.atualizada_em, 'concluida_em', d.concluida_em,
    'dias', floor(extract(epoch from (coalesce(d.concluida_em, now()) - d.aberta_em)) / 86400)::int,
    'atrasada', d.status <> 'Concluído' and now() - d.aberta_em > interval '120 hours',
    'sem_atualizacao', d.status <> 'Concluído' and now() - d.atualizada_em > interval '120 hours',
    'n_historico', (select count(*) from td_historico h where h.demanda_id = d.id))
$$;

-- ---------------------------------------------------------------------
-- Autenticação
-- ---------------------------------------------------------------------
create or replace function public.td_login(p_telefone text, p_pin text, p_lembrar boolean default true)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios;
  v_tel text := td_fone(p_telefone);
  v_token text;
  v_exp timestamptz;
  v_min int;
begin
  if p_pin is null or p_pin !~ '^\d{4}$' or v_tel !~ '^\d{10,11}$' then
    return jsonb_build_object('ok', false, 'erro', 'Informe o celular com DDD e o PIN de 4 números.');
  end if;

  select * into u from td_usuarios where telefone = v_tel for update;
  if not found or not u.ativo then
    perform crypt(p_pin, gen_salt('bf', 8));
    return jsonb_build_object('ok', false, 'erro', 'Celular ou PIN incorretos.');
  end if;

  if u.bloqueado_ate is not null and u.bloqueado_ate > now() then
    v_min := ceil(extract(epoch from (u.bloqueado_ate - now())) / 60);
    return jsonb_build_object('ok', false, 'erro',
      format('Acesso bloqueado por excesso de tentativas. Tente novamente em %s min.', v_min));
  end if;

  if crypt(p_pin, u.pin_hash) <> u.pin_hash then
    if u.tentativas + 1 >= 5 then
      update td_usuarios
         set tentativas = 0,
             bloqueios = bloqueios + 1,
             bloqueado_ate = now() + least(interval '24 hours', interval '15 minutes' * power(2, u.bloqueios))
       where id = u.id;
      return jsonb_build_object('ok', false, 'erro', 'PIN incorreto 5 vezes. Acesso bloqueado temporariamente.');
    end if;
    update td_usuarios set tentativas = tentativas + 1 where id = u.id;
    return jsonb_build_object('ok', false, 'erro',
      format('PIN incorreto. Restam %s tentativa%s antes do bloqueio.', 4 - u.tentativas, case when 4 - u.tentativas = 1 then '' else 's' end));
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_exp := now() + case when coalesce(p_lembrar, true) then interval '90 days' else interval '12 hours' end;
  insert into td_sessoes(usuario_id, token_hash, expira_em)
       values (u.id, encode(digest(v_token, 'sha256'), 'hex'), v_exp);
  update td_usuarios set tentativas = 0, bloqueios = 0, bloqueado_ate = null, ultimo_acesso = now()
   where id = u.id returning * into u;

  return jsonb_build_object('ok', true, 'token', v_token, 'expira_em', v_exp, 'usuario', td_usuario_json(u));
end $$;

create or replace function public.td_logout(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  update td_sessoes set expira_em = now()
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expira_em > now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.td_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios;
begin
  u := td_sessao(p_token, true);
  return td_usuario_json(u);
end $$;

create or replace function public.td_trocar_pin(p_token text, p_pin_atual text, p_pin_novo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios;
begin
  u := td_sessao(p_token, true);
  if p_pin_novo is null or p_pin_novo !~ '^\d{4}$' then
    raise exception 'O novo PIN precisa ter exatamente 4 números.';
  end if;
  if p_pin_novo ~ '^(\d)\1{3}$' or p_pin_novo in ('1234', '4321', '0123', '9876') then
    raise exception 'Escolha um PIN menos óbvio (evite 1234, 0000, 1111…).';
  end if;
  if crypt(coalesce(p_pin_atual, ''), u.pin_hash) <> u.pin_hash then
    raise exception 'O PIN atual não confere.';
  end if;
  if crypt(p_pin_novo, u.pin_hash) = u.pin_hash then
    raise exception 'O novo PIN precisa ser diferente do atual.';
  end if;
  update td_usuarios set pin_hash = crypt(p_pin_novo, gen_salt('bf', 8)), trocar_pin = false
   where id = u.id returning * into u;
  return td_usuario_json(u);
end $$;

-- ---------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------
create or replace function public.td_resumo(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios;
  tz constant text := 'America/Sao_Paulo';
  v_kpis jsonb; v_status jsonb; v_serie jsonb; v_prior jsonb;
begin
  u := td_sessao(p_token);

  select jsonb_build_object(
    'abertas',         count(*) filter (where status <> 'Concluído'),
    'concluidas',      count(*) filter (where status = 'Concluído'),
    'atrasadas',       count(*) filter (where status <> 'Concluído' and now() - aberta_em > interval '120 hours'),
    'sem_atualizacao', count(*) filter (where status <> 'Concluído' and now() - atualizada_em > interval '120 hours'),
    'oc_abertas',      count(*) filter (where status <> 'Concluído' and tipo = 'OC'),
    'ci_abertas',      count(*) filter (where status <> 'Concluído' and tipo = 'CI'),
    'aguardando',      count(*) filter (where status = 'Aguardando'),
    'concluidas_mes',  count(*) filter (where status = 'Concluído'
                         and concluida_em >= (date_trunc('month', now() at time zone tz) at time zone tz)))
    into v_kpis
    from td_demandas;

  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_status
    from (select status, count(*) n from td_demandas where status <> 'Concluído' group by status) s;

  select jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'abertas', (select count(*) from td_demandas d
                        where date_trunc('month', d.aberta_em at time zone tz) = m.mes),
           'concluidas', (select count(*) from td_demandas d
                        where d.concluida_em is not null and date_trunc('month', d.concluida_em at time zone tz) = m.mes))
         order by m.mes)
    into v_serie
    from generate_series(date_trunc('month', now() at time zone tz) - interval '5 months',
                         date_trunc('month', now() at time zone tz), interval '1 month') as m(mes);

  select coalesce(jsonb_agg(td_linha(x.d, x.c) order by x.atr desc, (x.d).aberta_em), '[]'::jsonb) into v_prior
    from (select d, c, (now() - d.aberta_em > interval '120 hours') atr
            from td_demandas d join td_clientes c on c.id = d.cliente_id
           where d.status <> 'Concluído'
           order by 3 desc, d.aberta_em
           limit 6) x;

  return jsonb_build_object('kpis', v_kpis, 'por_status', v_status, 'serie', v_serie,
                            'prioridades', v_prior, 'agora', now());
end $$;

create or replace function public.td_listar(p_token text, p_filtros jsonb default '{}'::jsonb,
                                            p_limite int default 25, p_offset int default 0)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios;
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_escopo text := coalesce(nullif(f->>'escopo', ''), 'abertas');
  v_ordem text := coalesce(nullif(f->>'ordem', ''), 'prioridade');
  v_status text := nullif(f->>'status', '');
  v_origem text := nullif(f->>'origem', '');
  v_atraso text := nullif(f->>'atraso', '');
  v_consultor text := nullif(f->>'consultor', '');
  v_cliente uuid := nullif(f->>'cliente_id', '')::uuid;
  v_ids uuid[];
  v_termos text[];
  v_total int;
  v_linhas jsonb;
begin
  u := td_sessao(p_token);
  p_limite := least(greatest(coalesce(p_limite, 25), 1), 5000);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  if jsonb_typeof(f->'ids') = 'array' then
    select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(f->'ids') x;
  end if;
  select array_agg(replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_'))
    into v_termos
    from regexp_split_to_table(td_norm(trim(coalesce(f->>'q', ''))), '\s+') t
   where t <> '';

  with base as (
  select d, c from td_demandas d join td_clientes c on c.id = d.cliente_id
   where (v_escopo = 'todas'
          or (v_escopo = 'abertas' and d.status <> 'Concluído')
          or (v_escopo = 'concluidas' and d.status = 'Concluído'))
     and (v_status is null or d.status = v_status)
     and (v_origem is null or d.origem = v_origem)
     and (v_consultor is null or d.consultor = v_consultor)
     and (v_cliente is null or d.cliente_id = v_cliente)
     and (v_ids is null or d.id = any(v_ids))
     and (v_atraso is null
          or (v_atraso = 'atrasadas' and d.status <> 'Concluído' and now() - d.aberta_em > interval '120 hours')
          or (v_atraso = 'sem_atualizacao' and d.status <> 'Concluído' and now() - d.atualizada_em > interval '120 hours')
          or (v_atraso = 'no_prazo' and d.status <> 'Concluído' and now() - d.aberta_em <= interval '120 hours'))
     and (v_termos is null or not exists (select 1 from unnest(v_termos) t where d.busca not like '%' || t || '%'))
  ),
  ordenada as (
    select l.d, l.c,
           row_number() over (order by
             case when v_ordem = 'prioridade' and v_escopo <> 'concluidas'
                  then ((l.d).status <> 'Concluído' and now() - (l.d).aberta_em > interval '120 hours') end desc nulls last,
             case when v_ordem = 'prioridade' and v_escopo = 'todas' then ((l.d).status = 'Concluído') end asc nulls last,
             case when v_escopo = 'concluidas' and v_ordem = 'prioridade' then (l.d).concluida_em end desc nulls last,
             case when v_ordem = 'recentes' then (l.d).aberta_em end desc nulls last,
             case when v_ordem = 'atualizacao' then (l.d).atualizada_em end desc nulls last,
             (l.d).aberta_em asc, (l.d).id) as rn
      from base l
  ),
  pagina as (
    select * from ordenada order by rn limit p_limite offset p_offset
  )
  select (select count(*) from base),
         (select coalesce(jsonb_agg(td_linha(p.d, p.c) order by p.rn), '[]'::jsonb) from pagina p)
    into v_total, v_linhas;

  return jsonb_build_object('total', v_total, 'linhas', v_linhas, 'limite', p_limite, 'offset', p_offset, 'agora', now());
end $$;

create or replace function public.td_demanda(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; d public.td_demandas; c public.td_clientes; v_hist jsonb;
begin
  u := td_sessao(p_token);
  select * into d from td_demandas where id = p_id;
  if not found then raise exception 'Demanda não encontrada.'; end if;
  select * into c from td_clientes where id = d.cliente_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'acao', h.acao, 'descricao', h.descricao,
           'status_anterior', h.status_anterior, 'status_novo', h.status_novo, 'autor', h.autor,
           'registrado_em', h.registrado_em) order by h.seq desc), '[]'::jsonb)
    into v_hist from td_historico h where h.demanda_id = d.id;
  return jsonb_build_object('demanda', td_linha(d, c), 'cliente', td_cliente_json(c), 'historico', v_hist);
end $$;

create or replace function public.td_cliente_por_codigo(p_token text, p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; c public.td_clientes; v_abertas int;
begin
  u := td_sessao(p_token);
  select * into c from td_clientes where codigo_norm = td_cod(p_codigo);
  if not found then return null; end if;
  select count(*) into v_abertas from td_demandas where cliente_id = c.id and status <> 'Concluído';
  return td_cliente_json(c) || jsonb_build_object('abertas', v_abertas);
end $$;

create or replace function public.td_clientes_listar(p_token text, p_q text default '', p_limite int default 50, p_offset int default 0)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; v_q text; v_total int; v_linhas jsonb;
begin
  u := td_sessao(p_token);
  v_q := replace(replace(replace(td_norm(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
  p_limite := least(greatest(coalesce(p_limite, 50), 1), 1000);
  select count(*) into v_total from td_clientes c
   where v_q = '' or td_norm(concat_ws(' ', c.codigo, c.nome, c.contato, c.telefone)) like '%' || v_q || '%';
  select coalesce(jsonb_agg(x.j order by x.nome), '[]'::jsonb) into v_linhas from (
    select c.nome, td_cliente_json(c) || jsonb_build_object(
             'abertas', (select count(*) from td_demandas d where d.cliente_id = c.id and d.status <> 'Concluído'),
             'total', (select count(*) from td_demandas d where d.cliente_id = c.id),
             'atrasadas', (select count(*) from td_demandas d where d.cliente_id = c.id and d.status <> 'Concluído'
                                                             and now() - d.aberta_em > interval '120 hours'),
             'ultima', (select max(d.atualizada_em) from td_demandas d where d.cliente_id = c.id)) as j
      from td_clientes c
     where v_q = '' or td_norm(concat_ws(' ', c.codigo, c.nome, c.contato, c.telefone)) like '%' || v_q || '%'
     order by c.nome
     limit p_limite offset greatest(coalesce(p_offset, 0), 0)) x;
  return jsonb_build_object('total', v_total, 'linhas', v_linhas);
end $$;

create or replace function public.td_cliente(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; c public.td_clientes; v_dem jsonb; v_aud jsonb;
begin
  u := td_sessao(p_token);
  select * into c from td_clientes where id = p_id;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  select coalesce(jsonb_agg(td_linha(d, c) order by (d.status = 'Concluído'), d.aberta_em desc), '[]'::jsonb)
    into v_dem from td_demandas d where d.cliente_id = c.id;
  select coalesce(jsonb_agg(jsonb_build_object('campo', a.campo, 'valor_anterior', a.valor_anterior,
           'valor_novo', a.valor_novo, 'autor', a.autor, 'registrado_em', a.registrado_em)
           order by a.registrado_em desc), '[]'::jsonb)
    into v_aud from (select * from td_auditoria_clientes where cliente_id = c.id
                      order by registrado_em desc limit 100) a;
  return jsonb_build_object('cliente', td_cliente_json(c), 'demandas', v_dem, 'auditoria', v_aud);
end $$;

-- ---------------------------------------------------------------------
-- Escrita (cada função = uma transação)
-- ---------------------------------------------------------------------
create or replace function public.td_criar_demanda(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios; c public.td_clientes; d public.td_demandas;
  v_cod text := trim(coalesce(p->>'codigo', ''));
  v_nome text := trim(coalesce(p->>'nome', ''));
  v_desc text := trim(coalesce(p->>'descricao', ''));
  v_origem text := p->>'origem';
  v_status text := coalesce(nullif(p->>'status', ''), 'Abrir');
  v_contato text := nullif(trim(coalesce(p->>'contato', '')), '');
  v_tel text := nullif(td_fone(p->>'telefone'), '');
  v_reg text := nullif(trim(coalesce(p->>'numero_registro', '')), '');
  v_consultor text := nullif(trim(coalesce(p->>'consultor', '')), '');
  v_prox text := nullif(trim(coalesce(p->>'proxima_acao', '')), '');
  v_prazo date := nullif(p->>'prazo_proxima_acao', '')::date;
begin
  u := td_sessao(p_token);
  if v_cod = '' then raise exception 'Informe o código do cliente.'; end if;
  if length(v_cod) > 40 then raise exception 'Código do cliente muito longo.'; end if;
  if length(v_desc) < 3 then raise exception 'Descreva a demanda (mínimo 3 caracteres).'; end if;
  if length(v_desc) > 12000 then raise exception 'Descrição muito longa.'; end if;
  if v_origem is null or v_origem not in ('Salesforce', 'TOTVS') then raise exception 'Escolha a origem: Salesforce (OC) ou TOTVS (CI).'; end if;
  if v_status not in ('Abrir', 'Pendente', 'Aguardando', 'Em andamento') then raise exception 'Status inicial inválido.'; end if;
  if v_tel is not null and v_tel !~ '^\d{10,11}$' then raise exception 'Telefone inválido. Use DDD + número, ex.: (41) 99999-9999.'; end if;
  if v_reg is not null and length(v_reg) > 60 then raise exception 'Número de registro muito longo.'; end if;

  select * into c from td_clientes where codigo_norm = td_cod(v_cod) for update;
  if found then
    if v_nome <> '' and td_norm(v_nome) <> td_norm(c.nome) and not coalesce((p->>'confirmar_cliente')::boolean, false) then
      return jsonb_build_object('ok', false, 'conflito', true,
        'cliente', td_cliente_json(c),
        'erro', format('O código %s já está cadastrado para "%s".', c.codigo, c.nome));
    end if;
    if (coalesce(c.contato, '') = '' and v_contato is not null) or (coalesce(c.telefone, '') = '' and v_tel is not null) then
      update td_clientes
         set contato = coalesce(nullif(contato, ''), v_contato),
             telefone = coalesce(nullif(telefone, ''), v_tel),
             atualizado_em = now()
       where id = c.id returning * into c;
    end if;
  else
    if v_nome = '' then raise exception 'Cliente novo: informe o nome do cliente.'; end if;
    insert into td_clientes(codigo, nome, contato, telefone)
         values (v_cod, v_nome, v_contato, v_tel) returning * into c;
  end if;

  insert into td_demandas(cliente_id, consultor, origem, tipo, numero_registro, contato, telefone, status,
                          descricao_atual, proxima_acao, prazo_proxima_acao, criado_por)
       values (c.id, coalesce(v_consultor, u.nome), v_origem,
               case v_origem when 'Salesforce' then 'OC' else 'CI' end,
               v_reg, v_contato, v_tel, v_status, v_desc, v_prox, v_prazo, u.id)
    returning * into d;

  insert into td_historico(demanda_id, acao, descricao, status_novo, autor, autor_id)
       values (d.id, 'abertura', v_desc, v_status, u.nome, u.id);

  return jsonb_build_object('ok', true, 'demanda', td_linha(d, c));
end $$;

create or replace function public.td_registrar(p_token text, p_id uuid, p_texto text default null, p_status text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios; d public.td_demandas; c public.td_clientes;
  v_txt text := nullif(trim(coalesce(p_texto, '')), '');
  v_novo text;
  v_ant text;
begin
  u := td_sessao(p_token);
  select * into d from td_demandas where id = p_id for update;
  if not found then raise exception 'Demanda não encontrada.'; end if;
  v_ant := d.status;
  v_novo := coalesce(nullif(p_status, ''), d.status);
  if v_novo not in ('Abrir', 'Pendente', 'Aguardando', 'Em andamento', 'Concluído') then
    raise exception 'Status inválido.';
  end if;
  if v_txt is null and v_novo = v_ant then
    return jsonb_build_object('ok', false, 'erro', 'Escreva a atualização ou mude o status.');
  end if;
  if v_txt is not null and length(v_txt) > 12000 then raise exception 'Atualização muito longa.'; end if;

  if v_txt is not null then
    insert into td_historico(demanda_id, acao, descricao, status_anterior, status_novo, autor, autor_id, registrado_em)
         values (d.id, 'atualização', v_txt, v_ant, v_novo, u.nome, u.id, clock_timestamp());
    d.descricao_anterior := d.descricao_atual;
    d.descricao_atual := v_txt;
  end if;

  if v_novo <> v_ant then
    if v_novo = 'Concluído' then
      insert into td_historico(demanda_id, acao, descricao, status_anterior, status_novo, autor, autor_id, registrado_em)
           values (d.id, 'conclusão', format('Demanda concluída (%s → Concluído).', v_ant), v_ant, v_novo, u.nome, u.id, clock_timestamp());
      d.concluida_em := now();
    elsif v_ant = 'Concluído' then
      insert into td_historico(demanda_id, acao, descricao, status_anterior, status_novo, autor, autor_id, registrado_em)
           values (d.id, 'reabertura', format('Demanda reaberta (Concluído → %s).', v_novo), v_ant, v_novo, u.nome, u.id, clock_timestamp());
      d.concluida_em := null;
    else
      insert into td_historico(demanda_id, acao, descricao, status_anterior, status_novo, autor, autor_id, registrado_em)
           values (d.id, 'mudança de status', format('Status: %s → %s.', v_ant, v_novo), v_ant, v_novo, u.nome, u.id, clock_timestamp());
    end if;
  end if;

  update td_demandas
     set descricao_anterior = d.descricao_anterior,
         descricao_atual = d.descricao_atual,
         status = v_novo,
         concluida_em = d.concluida_em,
         atualizada_em = now()
   where id = d.id
  returning * into d;

  select * into c from td_clientes where id = d.cliente_id;
  return jsonb_build_object('ok', true, 'demanda', td_linha(d, c));
end $$;

create or replace function public.td_editar_demanda(p_token text, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios; d public.td_demandas; n public.td_demandas; c public.td_clientes;
  v_mud text[] := '{}';
  v_tel text;
begin
  u := td_sessao(p_token);
  select * into d from td_demandas where id = p_id for update;
  if not found then raise exception 'Demanda não encontrada.'; end if;
  n := d;
  if p ? 'consultor' then n.consultor := coalesce(nullif(trim(p->>'consultor'), ''), d.consultor); end if;
  if p ? 'origem' then
    if p->>'origem' not in ('Salesforce', 'TOTVS') then raise exception 'Origem inválida.'; end if;
    n.origem := p->>'origem';
    n.tipo := case n.origem when 'Salesforce' then 'OC' else 'CI' end;
  end if;
  if p ? 'numero_registro' then n.numero_registro := nullif(trim(coalesce(p->>'numero_registro', '')), ''); end if;
  if p ? 'contato' then n.contato := nullif(trim(coalesce(p->>'contato', '')), ''); end if;
  if p ? 'telefone' then
    v_tel := nullif(td_fone(p->>'telefone'), '');
    if v_tel is not null and v_tel !~ '^\d{10,11}$' then raise exception 'Telefone inválido. Use DDD + número.'; end if;
    n.telefone := v_tel;
  end if;
  if p ? 'proxima_acao' then n.proxima_acao := nullif(trim(coalesce(p->>'proxima_acao', '')), ''); end if;
  if p ? 'prazo_proxima_acao' then n.prazo_proxima_acao := nullif(p->>'prazo_proxima_acao', '')::date; end if;

  if n.consultor is distinct from d.consultor then v_mud := v_mud || format('Consultor: %s → %s', d.consultor, n.consultor); end if;
  if n.origem is distinct from d.origem then v_mud := v_mud || format('Origem: %s (%s) → %s (%s)', d.origem, d.tipo, n.origem, n.tipo); end if;
  if n.numero_registro is distinct from d.numero_registro then v_mud := v_mud || format('Nº registro: %s → %s', coalesce(d.numero_registro, '—'), coalesce(n.numero_registro, '—')); end if;
  if n.contato is distinct from d.contato then v_mud := v_mud || format('Contato: %s → %s', coalesce(d.contato, '—'), coalesce(n.contato, '—')); end if;
  if n.telefone is distinct from d.telefone then v_mud := v_mud || format('Telefone: %s → %s', coalesce(d.telefone, '—'), coalesce(n.telefone, '—')); end if;
  if n.proxima_acao is distinct from d.proxima_acao then v_mud := v_mud || format('Próxima ação: %s', coalesce(n.proxima_acao, '—')); end if;
  if n.prazo_proxima_acao is distinct from d.prazo_proxima_acao then v_mud := v_mud || format('Prazo: %s', coalesce(to_char(n.prazo_proxima_acao, 'DD/MM/YYYY'), '—')); end if;

  if array_length(v_mud, 1) is null then
    select * into c from td_clientes where id = d.cliente_id;
    return jsonb_build_object('ok', true, 'sem_mudancas', true, 'demanda', td_linha(d, c));
  end if;

  update td_demandas
     set consultor = n.consultor, origem = n.origem, tipo = n.tipo, numero_registro = n.numero_registro,
         contato = n.contato, telefone = n.telefone, proxima_acao = n.proxima_acao,
         prazo_proxima_acao = n.prazo_proxima_acao
   where id = d.id returning * into d;

  insert into td_historico(demanda_id, acao, descricao, status_anterior, status_novo, autor, autor_id)
       values (d.id, 'edição', array_to_string(v_mud, E'\n'), d.status, d.status, u.nome, u.id);

  select * into c from td_clientes where id = d.cliente_id;
  return jsonb_build_object('ok', true, 'demanda', td_linha(d, c));
end $$;

create or replace function public.td_salvar_cliente(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios; c public.td_clientes; o public.td_clientes;
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_cod text := trim(coalesce(p->>'codigo', ''));
  v_nome text := trim(coalesce(p->>'nome', ''));
  v_tel text := nullif(td_fone(p->>'telefone'), '');
begin
  u := td_sessao(p_token);
  if v_cod = '' or length(v_cod) > 40 then raise exception 'Informe um código de cliente válido.'; end if;
  if v_nome = '' then raise exception 'Informe o nome do cliente.'; end if;
  if v_tel is not null and v_tel !~ '^\d{10,11}$' then raise exception 'Telefone inválido. Use DDD + número.'; end if;

  select * into o from td_clientes where codigo_norm = td_cod(v_cod) and (v_id is null or id <> v_id);
  if found then
    raise exception 'O código % já pertence ao cliente "%".', o.codigo, o.nome;
  end if;

  if v_id is null then
    insert into td_clientes(codigo, nome, contato, telefone, endereco, observacoes)
         values (v_cod, v_nome, nullif(trim(coalesce(p->>'contato', '')), ''), v_tel,
                 nullif(trim(coalesce(p->>'endereco', '')), ''), nullif(trim(coalesce(p->>'observacoes', '')), ''))
      returning * into c;
  else
    update td_clientes
       set codigo = v_cod,
           nome = v_nome,
           contato = case when p ? 'contato' then nullif(trim(coalesce(p->>'contato', '')), '') else contato end,
           telefone = case when p ? 'telefone' then v_tel else telefone end,
           endereco = case when p ? 'endereco' then nullif(trim(coalesce(p->>'endereco', '')), '') else endereco end,
           observacoes = case when p ? 'observacoes' then nullif(trim(coalesce(p->>'observacoes', '')), '') else observacoes end,
           ativo = case when p ? 'ativo' then coalesce((p->>'ativo')::boolean, ativo) else ativo end,
           atualizado_em = now()
     where id = v_id returning * into c;
    if not found then raise exception 'Cliente não encontrado.'; end if;
  end if;
  return jsonb_build_object('ok', true, 'cliente', td_cliente_json(c));
end $$;

create or replace function public.td_consultores_listar(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios;
begin
  u := td_sessao(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'ativo', ativo) order by nome), '[]'::jsonb)
            from td_consultores);
end $$;

create or replace function public.td_salvar_consultor(p_token text, p_id uuid, p_nome text, p_ativo boolean default true)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; v_nome text := trim(coalesce(p_nome, ''));
begin
  u := td_sessao(p_token);
  if length(v_nome) < 2 then raise exception 'Informe o nome do consultor.'; end if;
  if exists (select 1 from td_consultores where td_norm(nome) = td_norm(v_nome) and (p_id is null or id <> p_id)) then
    raise exception 'Já existe um consultor com esse nome.';
  end if;
  if p_id is null then
    insert into td_consultores(nome, ativo) values (v_nome, coalesce(p_ativo, true));
  else
    update td_consultores set nome = v_nome, ativo = coalesce(p_ativo, true) where id = p_id;
  end if;
  return td_consultores_listar(p_token);
end $$;

-- ---------------------------------------------------------------------
-- Administração
-- ---------------------------------------------------------------------
create or replace function public.td_usuarios_listar(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios;
begin
  u := td_sessao(p_token);
  if not u.admin then raise exception 'Apenas administradores.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'telefone', telefone, 'admin', admin,
            'ativo', ativo, 'trocar_pin', trocar_pin, 'ultimo_acesso', ultimo_acesso,
            'bloqueado', bloqueado_ate is not null and bloqueado_ate > now()) order by nome), '[]'::jsonb)
            from td_usuarios);
end $$;

create or replace function public.td_salvar_usuario(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios; x public.td_usuarios;
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_nome text := trim(coalesce(p->>'nome', ''));
  v_tel text := td_fone(p->>'telefone');
  v_pin text := nullif(p->>'pin', '');
begin
  u := td_sessao(p_token);
  if not u.admin then raise exception 'Apenas administradores.'; end if;
  if v_pin is not null and v_pin !~ '^\d{4}$' then raise exception 'O PIN provisório precisa ter 4 números.'; end if;

  if v_id is null then
    if length(v_nome) < 2 then raise exception 'Informe o nome.'; end if;
    if v_tel !~ '^\d{10,11}$' then raise exception 'Celular inválido. Use DDD + número.'; end if;
    if v_pin is null then raise exception 'Defina um PIN provisório de 4 números.'; end if;
    if exists (select 1 from td_usuarios where telefone = v_tel) then raise exception 'Este celular já está cadastrado.'; end if;
    insert into td_usuarios(nome, telefone, pin_hash, admin, trocar_pin)
         values (v_nome, v_tel, crypt(v_pin, gen_salt('bf', 8)), coalesce((p->>'admin')::boolean, false), true);
    insert into td_consultores(nome) select v_nome
     where not exists (select 1 from td_consultores where td_norm(nome) = td_norm(v_nome));
  else
    select * into x from td_usuarios where id = v_id for update;
    if not found then raise exception 'Usuário não encontrado.'; end if;
    if x.id = u.id and ((p ? 'ativo' and not (p->>'ativo')::boolean) or (p ? 'admin' and not (p->>'admin')::boolean)) then
      raise exception 'Você não pode remover o próprio acesso de administrador.';
    end if;
    if x.id = u.id and v_pin is not null then
      raise exception 'Para trocar o seu próprio PIN use a opção "Trocar meu PIN".';
    end if;
    if p ? 'telefone' then
      if v_tel !~ '^\d{10,11}$' then raise exception 'Celular inválido.'; end if;
      if exists (select 1 from td_usuarios where telefone = v_tel and id <> x.id) then raise exception 'Este celular já está cadastrado.'; end if;
    end if;
    update td_usuarios
       set nome = case when length(v_nome) >= 2 then v_nome else nome end,
           telefone = case when p ? 'telefone' then v_tel else telefone end,
           admin = case when p ? 'admin' then (p->>'admin')::boolean else admin end,
           ativo = case when p ? 'ativo' then (p->>'ativo')::boolean else ativo end,
           pin_hash = case when v_pin is not null then crypt(v_pin, gen_salt('bf', 8)) else pin_hash end,
           trocar_pin = case when v_pin is not null then true else trocar_pin end,
           tentativas = case when v_pin is not null or coalesce((p->>'desbloquear')::boolean, false) then 0 else tentativas end,
           bloqueios = case when v_pin is not null or coalesce((p->>'desbloquear')::boolean, false) then 0 else bloqueios end,
           bloqueado_ate = case when v_pin is not null or coalesce((p->>'desbloquear')::boolean, false) then null else bloqueado_ate end
     where id = x.id returning * into x;
    if not x.ativo or v_pin is not null then
      update td_sessoes set expira_em = now() where usuario_id = x.id and expira_em > now();
    end if;
  end if;
  return td_usuarios_listar(p_token);
end $$;

create or replace function public.td_backup(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios;
begin
  u := td_sessao(p_token);
  if not u.admin then raise exception 'Apenas administradores.'; end if;
  return jsonb_build_object(
    'sistema', 'Tarefa Diária', 'gerado_em', now(), 'gerado_por', u.nome,
    'clientes', (select coalesce(jsonb_agg(to_jsonb(c) - 'codigo_norm' order by c.nome), '[]'::jsonb) from td_clientes c),
    'demandas', (select coalesce(jsonb_agg(to_jsonb(d) - 'busca' order by d.aberta_em), '[]'::jsonb) from td_demandas d),
    'historico', (select coalesce(jsonb_agg(to_jsonb(h) order by h.seq), '[]'::jsonb) from td_historico h),
    'auditoria_clientes', (select coalesce(jsonb_agg(to_jsonb(a) order by a.registrado_em), '[]'::jsonb) from td_auditoria_clientes a),
    'consultores', (select coalesce(jsonb_agg(to_jsonb(k) order by k.nome), '[]'::jsonb) from td_consultores k));
end $$;

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'td\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

grant execute on function
  public.td_login(text, text, boolean),
  public.td_logout(text),
  public.td_me(text),
  public.td_trocar_pin(text, text, text),
  public.td_resumo(text),
  public.td_listar(text, jsonb, int, int),
  public.td_demanda(text, uuid),
  public.td_cliente_por_codigo(text, text),
  public.td_clientes_listar(text, text, int, int),
  public.td_cliente(text, uuid),
  public.td_criar_demanda(text, jsonb),
  public.td_registrar(text, uuid, text, text),
  public.td_editar_demanda(text, uuid, jsonb),
  public.td_salvar_cliente(text, jsonb),
  public.td_consultores_listar(text),
  public.td_salvar_consultor(text, uuid, text, boolean),
  public.td_usuarios_listar(text),
  public.td_salvar_usuario(text, jsonb),
  public.td_backup(text)
to anon, authenticated;

-- Funções puras usadas em índices/colunas geradas continuam utilizáveis internamente.
grant execute on function public.td_norm(text), public.td_fone(text), public.td_cod(text) to anon, authenticated;

-- Consultor inicial
insert into public.td_consultores(nome)
select 'Diogo Soares' where not exists (select 1 from public.td_consultores);
