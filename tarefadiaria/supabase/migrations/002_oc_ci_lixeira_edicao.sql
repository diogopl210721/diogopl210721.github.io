-- =====================================================================
-- Tarefa Diária — migração 002
--  * OC (Salesforce) e CI (TOTVS) na MESMA demanda (cada uma opcional,
--    pelo menos uma marcada). Colunas antigas origem/tipo/numero_registro
--    continuam existindo e passam a guardar a "origem principal".
--  * Lixeira: excluir demanda (recuperável) e restaurar.
--  * Edição completa da demanda (cliente, origens, data de abertura,
--    descrição atual, status, contato, próxima ação…).
--  * Corrigir ou excluir cada atualização do histórico. O texto original
--    fica guardado (descricao_original) e nada é apagado do banco.
-- Sem DROP/DELETE: só acrescenta colunas e substitui funções.
-- =====================================================================

-- 1) Colunas novas -----------------------------------------------------
alter table public.td_demandas
  add column if not exists tem_oc boolean not null default false,
  add column if not exists tem_ci boolean not null default false,
  add column if not exists numero_oc text,
  add column if not exists numero_ci text,
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por text;

-- converte as demandas existentes (antes de trocar o gatilho)
update public.td_demandas
   set tem_oc = (tipo = 'OC'),
       tem_ci = (tipo = 'CI'),
       numero_oc = case when tipo = 'OC' then numero_registro end,
       numero_ci = case when tipo = 'CI' then numero_registro end
 where not tem_oc and not tem_ci;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'td_alguma_origem') then
    alter table public.td_demandas add constraint td_alguma_origem check (tem_oc or tem_ci);
  end if;
end $$;
create index if not exists td_demandas_ativas_idx on public.td_demandas(status, aberta_em) where excluida_em is null;
create index if not exists td_demandas_lixeira_idx on public.td_demandas(excluida_em desc) where excluida_em is not null;

alter table public.td_historico
  add column if not exists editado_em timestamptz,
  add column if not exists editado_por text,
  add column if not exists descricao_original text,
  add column if not exists excluido_em timestamptz,
  add column if not exists excluido_por text;

-- 2) Gatilhos -------------------------------------------------------------
create or replace function public.td_calc_busca() returns trigger
language plpgsql set search_path = public as $$
declare c public.td_clientes;
begin
  new.numero_oc := nullif(trim(coalesce(new.numero_oc, '')), '');
  new.numero_ci := nullif(trim(coalesce(new.numero_ci, '')), '');
  if not new.tem_oc then new.numero_oc := null; end if;
  if not new.tem_ci then new.numero_ci := null; end if;
  -- colunas antigas = origem principal (OC quando houver)
  new.origem := case when new.tem_oc or not new.tem_ci then 'Salesforce' else 'TOTVS' end;
  new.tipo := case when new.origem = 'Salesforce' then 'OC' else 'CI' end;
  new.numero_registro := case when new.tipo = 'OC' then new.numero_oc else new.numero_ci end;
  select * into c from public.td_clientes where id = new.cliente_id;
  new.busca := public.td_norm(concat_ws(' ',
    c.codigo, c.codigo_norm, c.nome, c.contato, c.telefone,
    case when new.tem_oc then concat_ws(' ', 'oc salesforce', new.numero_oc, 'oc' || coalesce(new.numero_oc, '')) end,
    case when new.tem_ci then concat_ws(' ', 'ci totvs', new.numero_ci, 'ci' || coalesce(new.numero_ci, '')) end,
    new.consultor, new.contato, new.telefone,
    new.descricao_atual, new.descricao_anterior, new.proxima_acao));
  return new;
end $$;

-- Histórico: nunca é apagado do banco. Só o texto pode ser corrigido
-- (o original fica em descricao_original) ou o registro marcado como excluído.
create or replace function public.td_historico_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'O histórico não pode ser apagado do banco.';
  end if;
  if new.id is distinct from old.id or new.seq is distinct from old.seq
     or new.demanda_id is distinct from old.demanda_id or new.acao is distinct from old.acao
     or new.status_anterior is distinct from old.status_anterior or new.status_novo is distinct from old.status_novo
     or new.autor is distinct from old.autor or new.autor_id is distinct from old.autor_id
     or new.registrado_em is distinct from old.registrado_em
     or (old.descricao_original is not null and new.descricao_original is distinct from old.descricao_original) then
    raise exception 'Somente o texto de um registro pode ser corrigido.';
  end if;
  if new.descricao is distinct from old.descricao and old.descricao_original is null then
    new.descricao_original := old.descricao;
  end if;
  return new;
end $$;

-- recalcula a busca das demandas existentes com o gatilho novo
update public.td_demandas set cliente_id = cliente_id;

-- 3) Auxiliares -------------------------------------------------------------
create or replace function public.td_recalc_desc(p_demanda uuid) returns void
language plpgsql set search_path = public as $$
declare v_atual text; v_ant text;
begin
  select descricao into v_atual from td_historico
   where demanda_id = p_demanda and excluido_em is null and acao in ('abertura', 'atualização')
   order by seq desc limit 1;
  select descricao into v_ant from td_historico
   where demanda_id = p_demanda and excluido_em is null and acao in ('abertura', 'atualização')
   order by seq desc offset 1 limit 1;
  update td_demandas
     set descricao_atual = coalesce(v_atual, descricao_atual), descricao_anterior = v_ant
   where id = p_demanda;
end $$;

create or replace function public.td_linha(d public.td_demandas, c public.td_clientes) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', d.id, 'cliente_id', c.id, 'codigo', c.codigo, 'cliente', c.nome,
    'contato', coalesce(nullif(d.contato, ''), c.contato),
    'telefone', coalesce(nullif(d.telefone, ''), c.telefone),
    'consultor', d.consultor,
    'tem_oc', d.tem_oc, 'tem_ci', d.tem_ci, 'numero_oc', d.numero_oc, 'numero_ci', d.numero_ci,
    'origem', case when d.tem_oc and d.tem_ci then 'Salesforce + TOTVS' when d.tem_oc then 'Salesforce' else 'TOTVS' end,
    'tipo', case when d.tem_oc and d.tem_ci then 'OC + CI' when d.tem_oc then 'OC' else 'CI' end,
    'numero_registro', d.numero_registro,
    'status', d.status, 'descricao_anterior', d.descricao_anterior, 'descricao_atual', d.descricao_atual,
    'proxima_acao', d.proxima_acao, 'prazo_proxima_acao', d.prazo_proxima_acao,
    'aberta_em', d.aberta_em, 'atualizada_em', d.atualizada_em, 'concluida_em', d.concluida_em,
    'excluida_em', d.excluida_em, 'excluida_por', d.excluida_por,
    'dias', floor(extract(epoch from (coalesce(d.concluida_em, now()) - d.aberta_em)) / 86400)::int,
    'atrasada', d.excluida_em is null and d.status <> 'Concluído' and now() - d.aberta_em > interval '120 hours',
    'sem_atualizacao', d.excluida_em is null and d.status <> 'Concluído' and now() - d.atualizada_em > interval '120 hours',
    'n_historico', (select count(*) from td_historico h where h.demanda_id = d.id and h.excluido_em is null))
$$;

-- 4) Leitura -----------------------------------------------------------------
create or replace function public.td_resumo(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios;
  tz constant text := 'America/Sao_Paulo';
  v_kpis jsonb; v_status jsonb; v_serie jsonb; v_prior jsonb;
begin
  u := td_sessao(p_token);

  select jsonb_build_object(
    'abertas',         count(*) filter (where excluida_em is null and status <> 'Concluído'),
    'concluidas',      count(*) filter (where excluida_em is null and status = 'Concluído'),
    'atrasadas',       count(*) filter (where excluida_em is null and status <> 'Concluído' and now() - aberta_em > interval '120 hours'),
    'sem_atualizacao', count(*) filter (where excluida_em is null and status <> 'Concluído' and now() - atualizada_em > interval '120 hours'),
    'oc_abertas',      count(*) filter (where excluida_em is null and status <> 'Concluído' and tem_oc),
    'ci_abertas',      count(*) filter (where excluida_em is null and status <> 'Concluído' and tem_ci),
    'oc_ci_abertas',   count(*) filter (where excluida_em is null and status <> 'Concluído' and tem_oc and tem_ci),
    'aguardando',      count(*) filter (where excluida_em is null and status = 'Aguardando'),
    'lixeira',         count(*) filter (where excluida_em is not null),
    'concluidas_mes',  count(*) filter (where excluida_em is null and status = 'Concluído'
                         and concluida_em >= (date_trunc('month', now() at time zone tz) at time zone tz)))
    into v_kpis
    from td_demandas;

  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_status
    from (select status, count(*) n from td_demandas
           where excluida_em is null and status <> 'Concluído' group by status) s;

  select jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'abertas', (select count(*) from td_demandas d
                        where d.excluida_em is null and date_trunc('month', d.aberta_em at time zone tz) = m.mes),
           'concluidas', (select count(*) from td_demandas d
                        where d.excluida_em is null and d.concluida_em is not null
                          and date_trunc('month', d.concluida_em at time zone tz) = m.mes))
         order by m.mes)
    into v_serie
    from generate_series(date_trunc('month', now() at time zone tz) - interval '5 months',
                         date_trunc('month', now() at time zone tz), interval '1 month') as m(mes);

  select coalesce(jsonb_agg(td_linha(x.d, x.c) order by x.atr desc, (x.d).aberta_em), '[]'::jsonb) into v_prior
    from (select d, c, (now() - d.aberta_em > interval '120 hours') atr
            from td_demandas d join td_clientes c on c.id = d.cliente_id
           where d.excluida_em is null and d.status <> 'Concluído'
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
   where (case when v_escopo = 'lixeira' then d.excluida_em is not null else d.excluida_em is null end)
     and (v_escopo in ('todas', 'lixeira')
          or (v_escopo = 'abertas' and d.status <> 'Concluído')
          or (v_escopo = 'concluidas' and d.status = 'Concluído'))
     and (v_status is null or d.status = v_status)
     and (v_origem is null
          or (v_origem = 'Salesforce' and d.tem_oc)
          or (v_origem = 'TOTVS' and d.tem_ci)
          or (v_origem = 'ambos' and d.tem_oc and d.tem_ci))
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
             case when v_escopo = 'lixeira' then (l.d).excluida_em end desc nulls last,
             case when v_ordem = 'prioridade' and v_escopo not in ('concluidas', 'lixeira')
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
declare u public.td_usuarios; d public.td_demandas; c public.td_clientes; v_hist jsonb; v_exc int;
begin
  u := td_sessao(p_token);
  select * into d from td_demandas where id = p_id;
  if not found then raise exception 'Demanda não encontrada.'; end if;
  select * into c from td_clientes where id = d.cliente_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'acao', h.acao, 'descricao', h.descricao,
           'status_anterior', h.status_anterior, 'status_novo', h.status_novo, 'autor', h.autor,
           'registrado_em', h.registrado_em, 'editado_em', h.editado_em, 'editado_por', h.editado_por,
           'descricao_original', h.descricao_original,
           'editavel', h.acao in ('abertura', 'atualização'),
           'excluivel', h.acao = 'atualização') order by h.seq desc), '[]'::jsonb)
    into v_hist from td_historico h where h.demanda_id = d.id and h.excluido_em is null;
  select count(*) into v_exc from td_historico h where h.demanda_id = d.id and h.excluido_em is not null;
  return jsonb_build_object('demanda', td_linha(d, c), 'cliente', td_cliente_json(c),
                            'historico', v_hist, 'n_excluidos', v_exc);
end $$;

create or replace function public.td_cliente_por_codigo(p_token text, p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; c public.td_clientes; v_abertas jsonb;
begin
  u := td_sessao(p_token);
  select * into c from td_clientes where codigo_norm = td_cod(p_codigo);
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'tem_oc', d.tem_oc, 'numero_oc', d.numero_oc,
           'tem_ci', d.tem_ci, 'numero_ci', d.numero_ci, 'status', d.status,
           'descricao_atual', left(d.descricao_atual, 90)) order by d.aberta_em desc), '[]'::jsonb)
    into v_abertas
    from td_demandas d where d.cliente_id = c.id and d.excluida_em is null and d.status <> 'Concluído';
  return td_cliente_json(c) || jsonb_build_object('abertas', jsonb_array_length(v_abertas), 'demandas_abertas', v_abertas);
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
             'abertas', (select count(*) from td_demandas d where d.cliente_id = c.id and d.excluida_em is null and d.status <> 'Concluído'),
             'total', (select count(*) from td_demandas d where d.cliente_id = c.id and d.excluida_em is null),
             'atrasadas', (select count(*) from td_demandas d where d.cliente_id = c.id and d.excluida_em is null and d.status <> 'Concluído'
                                                             and now() - d.aberta_em > interval '120 hours'),
             'ultima', (select max(d.atualizada_em) from td_demandas d where d.cliente_id = c.id and d.excluida_em is null)) as j
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
    into v_dem from td_demandas d where d.cliente_id = c.id and d.excluida_em is null;
  select coalesce(jsonb_agg(jsonb_build_object('campo', a.campo, 'valor_anterior', a.valor_anterior,
           'valor_novo', a.valor_novo, 'autor', a.autor, 'registrado_em', a.registrado_em)
           order by a.registrado_em desc), '[]'::jsonb)
    into v_aud from (select * from td_auditoria_clientes where cliente_id = c.id
                      order by registrado_em desc limit 100) a;
  return jsonb_build_object('cliente', td_cliente_json(c), 'demandas', v_dem, 'auditoria', v_aud);
end $$;

-- 5) Escrita -------------------------------------------------------------------
create or replace function public.td_criar_demanda(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios; c public.td_clientes; d public.td_demandas;
  v_cod text := trim(coalesce(p->>'codigo', ''));
  v_nome text := trim(coalesce(p->>'nome', ''));
  v_desc text := trim(coalesce(p->>'descricao', ''));
  v_status text := coalesce(nullif(p->>'status', ''), 'Abrir');
  v_contato text := nullif(trim(coalesce(p->>'contato', '')), '');
  v_tel text := nullif(td_fone(p->>'telefone'), '');
  v_consultor text := nullif(trim(coalesce(p->>'consultor', '')), '');
  v_prox text := nullif(trim(coalesce(p->>'proxima_acao', '')), '');
  v_prazo date := nullif(p->>'prazo_proxima_acao', '')::date;
  v_oc boolean := coalesce((p->>'tem_oc')::boolean, false);
  v_ci boolean := coalesce((p->>'tem_ci')::boolean, false);
  v_noc text := nullif(trim(coalesce(p->>'numero_oc', '')), '');
  v_nci text := nullif(trim(coalesce(p->>'numero_ci', '')), '');
begin
  u := td_sessao(p_token);
  -- compatibilidade com a versão anterior da tela (campo único "origem")
  if not (p ? 'tem_oc' or p ? 'tem_ci') and p ? 'origem' then
    v_oc := p->>'origem' = 'Salesforce';
    v_ci := p->>'origem' = 'TOTVS';
    if v_oc then v_noc := nullif(trim(coalesce(p->>'numero_registro', '')), ''); end if;
    if v_ci then v_nci := nullif(trim(coalesce(p->>'numero_registro', '')), ''); end if;
  end if;
  if v_cod = '' then raise exception 'Informe o código do cliente.'; end if;
  if length(v_cod) > 40 then raise exception 'Código do cliente muito longo.'; end if;
  if length(v_desc) < 3 then raise exception 'Descreva a demanda (mínimo 3 caracteres).'; end if;
  if length(v_desc) > 12000 then raise exception 'Descrição muito longa.'; end if;
  if not v_oc and not v_ci then raise exception 'Marque a origem: Salesforce (OC), TOTVS (CI) ou as duas.'; end if;
  if v_status not in ('Abrir', 'Pendente', 'Aguardando', 'Em andamento') then raise exception 'Status inicial inválido.'; end if;
  if v_tel is not null and v_tel !~ '^\d{10,11}$' then raise exception 'Telefone inválido. Use DDD + número, ex.: (41) 99999-9999.'; end if;
  if length(coalesce(v_noc, '')) > 60 or length(coalesce(v_nci, '')) > 60 then raise exception 'Número de registro muito longo.'; end if;

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

  insert into td_demandas(cliente_id, consultor, origem, tipo, tem_oc, tem_ci, numero_oc, numero_ci,
                          contato, telefone, status, descricao_atual, proxima_acao, prazo_proxima_acao, criado_por)
       values (c.id, coalesce(v_consultor, u.nome),
               case when v_oc then 'Salesforce' else 'TOTVS' end, case when v_oc then 'OC' else 'CI' end,
               v_oc, v_ci, v_noc, v_nci, v_contato, v_tel, v_status, v_desc, v_prox, v_prazo, u.id)
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
  if d.excluida_em is not null then raise exception 'Esta demanda está na lixeira. Restaure para atualizar.'; end if;
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

-- Edição completa da demanda
create or replace function public.td_editar_demanda(p_token text, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.td_usuarios; d public.td_demandas; n public.td_demandas; c public.td_clientes; c2 public.td_clientes;
  v_mud text[] := '{}';
  v_tel text; v_txt text; v_hid uuid; v_ab timestamptz; v_st text; v_cod text; v_nome text;
  tz constant text := 'America/Sao_Paulo';
begin
  u := td_sessao(p_token);
  select * into d from td_demandas where id = p_id for update;
  if not found then raise exception 'Demanda não encontrada.'; end if;
  if d.excluida_em is not null then raise exception 'Esta demanda está na lixeira. Restaure para editar.'; end if;
  select * into c from td_clientes where id = d.cliente_id;
  n := d;

  -- Cliente: trocar pelo código ou corrigir o nome
  v_cod := trim(coalesce(p->>'codigo', ''));
  v_nome := trim(coalesce(p->>'nome', ''));
  if v_cod <> '' and td_cod(v_cod) <> c.codigo_norm then
    select * into c2 from td_clientes where codigo_norm = td_cod(v_cod);
    if found then
      if v_nome <> '' and td_norm(v_nome) <> td_norm(c2.nome) and not coalesce((p->>'confirmar_cliente')::boolean, false) then
        return jsonb_build_object('ok', false, 'conflito', true, 'cliente', td_cliente_json(c2),
          'erro', format('O código %s já está cadastrado para "%s".', c2.codigo, c2.nome));
      end if;
    else
      if v_nome = '' then raise exception 'Código novo: informe o nome do cliente.'; end if;
      insert into td_clientes(codigo, nome, contato, telefone)
           values (v_cod, v_nome, nullif(trim(coalesce(p->>'contato', '')), ''), nullif(td_fone(p->>'telefone'), ''))
        returning * into c2;
    end if;
    n.cliente_id := c2.id;
    v_mud := v_mud || format('Cliente: %s (%s) → %s (%s)', c.nome, c.codigo, c2.nome, c2.codigo);
  elsif v_nome <> '' and td_norm(v_nome) <> td_norm(c.nome) then
    update td_clientes set nome = v_nome, atualizado_em = now() where id = c.id;
    v_mud := v_mud || format('Nome do cliente: %s → %s', c.nome, v_nome);
  end if;

  if p ? 'consultor' then n.consultor := coalesce(nullif(trim(p->>'consultor'), ''), d.consultor); end if;
  if p ? 'tem_oc' then n.tem_oc := coalesce((p->>'tem_oc')::boolean, false); end if;
  if p ? 'tem_ci' then n.tem_ci := coalesce((p->>'tem_ci')::boolean, false); end if;
  if p ? 'numero_oc' then n.numero_oc := nullif(trim(coalesce(p->>'numero_oc', '')), ''); end if;
  if p ? 'numero_ci' then n.numero_ci := nullif(trim(coalesce(p->>'numero_ci', '')), ''); end if;
  if p ? 'origem' and not (p ? 'tem_oc' or p ? 'tem_ci') then   -- compatibilidade
    n.tem_oc := p->>'origem' = 'Salesforce'; n.tem_ci := p->>'origem' = 'TOTVS';
    if p ? 'numero_registro' then
      n.numero_oc := case when n.tem_oc then nullif(trim(coalesce(p->>'numero_registro', '')), '') end;
      n.numero_ci := case when n.tem_ci then nullif(trim(coalesce(p->>'numero_registro', '')), '') end;
    end if;
  end if;
  if not n.tem_oc then n.numero_oc := null; end if;
  if not n.tem_ci then n.numero_ci := null; end if;
  if not n.tem_oc and not n.tem_ci then raise exception 'Marque pelo menos uma origem: Salesforce (OC) ou TOTVS (CI).'; end if;
  if length(coalesce(n.numero_oc, '')) > 60 or length(coalesce(n.numero_ci, '')) > 60 then raise exception 'Número de registro muito longo.'; end if;

  if p ? 'contato' then n.contato := nullif(trim(coalesce(p->>'contato', '')), ''); end if;
  if p ? 'telefone' then
    v_tel := nullif(td_fone(p->>'telefone'), '');
    if v_tel is not null and v_tel !~ '^\d{10,11}$' then raise exception 'Telefone inválido. Use DDD + número.'; end if;
    n.telefone := v_tel;
  end if;
  if p ? 'proxima_acao' then n.proxima_acao := nullif(trim(coalesce(p->>'proxima_acao', '')), ''); end if;
  if p ? 'prazo_proxima_acao' then n.prazo_proxima_acao := nullif(p->>'prazo_proxima_acao', '')::date; end if;
  if nullif(p->>'aberta_em', '') is not null then
    v_ab := (p->>'aberta_em')::timestamptz;
    if v_ab > now() + interval '5 minutes' then raise exception 'A data de abertura não pode ser no futuro.'; end if;
    if v_ab < timestamptz '2000-01-01' then raise exception 'Data de abertura inválida.'; end if;
    if d.concluida_em is not null and v_ab > d.concluida_em then raise exception 'A abertura não pode ser depois da conclusão.'; end if;
    if date_trunc('minute', v_ab) <> date_trunc('minute', d.aberta_em) then n.aberta_em := v_ab; end if;
  end if;

  if n.consultor is distinct from d.consultor then v_mud := v_mud || format('Consultor: %s → %s', d.consultor, n.consultor); end if;
  if n.tem_oc is distinct from d.tem_oc or n.numero_oc is distinct from d.numero_oc then
    v_mud := v_mud || format('OC (Salesforce): %s → %s',
      case when d.tem_oc then coalesce(d.numero_oc, 'sem nº') else 'não' end,
      case when n.tem_oc then coalesce(n.numero_oc, 'sem nº') else 'não' end);
  end if;
  if n.tem_ci is distinct from d.tem_ci or n.numero_ci is distinct from d.numero_ci then
    v_mud := v_mud || format('CI (TOTVS): %s → %s',
      case when d.tem_ci then coalesce(d.numero_ci, 'sem nº') else 'não' end,
      case when n.tem_ci then coalesce(n.numero_ci, 'sem nº') else 'não' end);
  end if;
  if n.contato is distinct from d.contato then v_mud := v_mud || format('Contato: %s → %s', coalesce(d.contato, '—'), coalesce(n.contato, '—')); end if;
  if n.telefone is distinct from d.telefone then v_mud := v_mud || format('Telefone: %s → %s', coalesce(d.telefone, '—'), coalesce(n.telefone, '—')); end if;
  if n.proxima_acao is distinct from d.proxima_acao then v_mud := v_mud || format('Próxima ação: %s', coalesce(n.proxima_acao, '—')); end if;
  if n.prazo_proxima_acao is distinct from d.prazo_proxima_acao then v_mud := v_mud || format('Prazo: %s', coalesce(to_char(n.prazo_proxima_acao, 'DD/MM/YYYY'), '—')); end if;
  if n.aberta_em is distinct from d.aberta_em then
    v_mud := v_mud || format('Data de abertura: %s → %s',
      to_char(d.aberta_em at time zone tz, 'DD/MM/YYYY HH24:MI'), to_char(n.aberta_em at time zone tz, 'DD/MM/YYYY HH24:MI'));
  end if;

  -- Corrigir o texto da descrição atual (o original fica guardado no histórico)
  v_txt := nullif(trim(coalesce(p->>'descricao_atual', '')), '');
  if v_txt is not null and v_txt is distinct from d.descricao_atual then
    if length(v_txt) < 3 then raise exception 'A descrição precisa de pelo menos 3 caracteres.'; end if;
    if length(v_txt) > 12000 then raise exception 'Descrição muito longa.'; end if;
    select id into v_hid from td_historico
     where demanda_id = d.id and excluido_em is null and acao in ('abertura', 'atualização')
     order by seq desc limit 1;
    update td_historico set descricao = v_txt, editado_em = now(), editado_por = u.nome where id = v_hid;
    v_mud := v_mud || 'Descrição atual corrigida'::text;
  end if;

  update td_demandas
     set cliente_id = n.cliente_id, consultor = n.consultor,
         tem_oc = n.tem_oc, tem_ci = n.tem_ci, numero_oc = n.numero_oc, numero_ci = n.numero_ci,
         contato = n.contato, telefone = n.telefone, proxima_acao = n.proxima_acao,
         prazo_proxima_acao = n.prazo_proxima_acao, aberta_em = n.aberta_em
   where id = d.id;

  if array_length(v_mud, 1) is not null then
    insert into td_historico(demanda_id, acao, descricao, status_anterior, status_novo, autor, autor_id, registrado_em)
         values (d.id, 'edição', array_to_string(v_mud, E'\n'), d.status, d.status, u.nome, u.id, clock_timestamp());
  end if;
  perform td_recalc_desc(d.id);

  v_st := nullif(p->>'status', '');
  if v_st is not null and v_st <> d.status then
    perform td_registrar(p_token, d.id, null, v_st);
  end if;

  select * into d from td_demandas where id = p_id;
  select * into c from td_clientes where id = d.cliente_id;
  return jsonb_build_object('ok', true,
    'sem_mudancas', array_length(v_mud, 1) is null and (v_st is null or v_st = n.status),
    'demanda', td_linha(d, c));
end $$;

-- Corrigir o texto de um registro do histórico
create or replace function public.td_editar_historico(p_token text, p_id uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; h public.td_historico; v text := trim(coalesce(p_texto, ''));
begin
  u := td_sessao(p_token);
  select * into h from td_historico where id = p_id for update;
  if not found or h.excluido_em is not null then raise exception 'Registro não encontrado.'; end if;
  if h.acao not in ('abertura', 'atualização') then raise exception 'Só dá para corrigir o texto da abertura e das atualizações.'; end if;
  if exists (select 1 from td_demandas where id = h.demanda_id and excluida_em is not null) then
    raise exception 'Esta demanda está na lixeira. Restaure para editar.';
  end if;
  if length(v) < 2 then raise exception 'O texto ficou vazio.'; end if;
  if length(v) > 12000 then raise exception 'Texto muito longo.'; end if;
  if v <> h.descricao then
    update td_historico set descricao = v, editado_em = now(), editado_por = u.nome where id = h.id;
    perform td_recalc_desc(h.demanda_id);
  end if;
  return td_demanda(p_token, h.demanda_id);
end $$;

-- Excluir uma atualização (fica marcada como excluída, não some do banco)
create or replace function public.td_excluir_historico(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; h public.td_historico;
begin
  u := td_sessao(p_token);
  select * into h from td_historico where id = p_id for update;
  if not found or h.excluido_em is not null then raise exception 'Registro não encontrado.'; end if;
  if h.acao <> 'atualização' then raise exception 'Só as atualizações podem ser excluídas (a abertura e as mudanças de status ficam).'; end if;
  if exists (select 1 from td_demandas where id = h.demanda_id and excluida_em is not null) then
    raise exception 'Esta demanda está na lixeira. Restaure para editar.';
  end if;
  update td_historico set excluido_em = now(), excluido_por = u.nome where id = h.id;
  perform td_recalc_desc(h.demanda_id);
  return td_demanda(p_token, h.demanda_id);
end $$;

-- Lixeira
create or replace function public.td_excluir_demandas(p_token text, p_ids jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; v_n int; v_ids uuid[];
begin
  u := td_sessao(p_token);
  if jsonb_typeof(p_ids) <> 'array' then raise exception 'Nenhuma demanda selecionada.'; end if;
  select coalesce(array_agg(x::uuid), '{}') into v_ids from jsonb_array_elements_text(p_ids) x;
  with x as (
    update td_demandas set excluida_em = now(), excluida_por = u.nome
     where id = any(v_ids) and excluida_em is null
    returning id, status
  ), ev as (
    insert into td_historico(demanda_id, acao, descricao, status_anterior, status_novo, autor, autor_id, registrado_em)
    select id, 'edição', 'Demanda excluída (foi para a lixeira).', status, status, u.nome, u.id, clock_timestamp() from x
    returning 1
  )
  select count(*) into v_n from ev;
  return jsonb_build_object('ok', true, 'n', v_n);
end $$;

create or replace function public.td_restaurar_demanda(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.td_usuarios; d public.td_demandas; c public.td_clientes;
begin
  u := td_sessao(p_token);
  update td_demandas set excluida_em = null, excluida_por = null
   where id = p_id and excluida_em is not null returning * into d;
  if not found then raise exception 'Demanda não está na lixeira.'; end if;
  insert into td_historico(demanda_id, acao, descricao, status_anterior, status_novo, autor, autor_id)
       values (d.id, 'edição', 'Demanda restaurada da lixeira.', d.status, d.status, u.nome, u.id);
  select * into c from td_clientes where id = d.cliente_id;
  return jsonb_build_object('ok', true, 'demanda', td_linha(d, c));
end $$;

-- 6) Permissões --------------------------------------------------------------
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
  public.td_editar_historico(text, uuid, text),
  public.td_excluir_historico(text, uuid),
  public.td_excluir_demandas(text, jsonb),
  public.td_restaurar_demanda(text, uuid),
  public.td_salvar_cliente(text, jsonb),
  public.td_consultores_listar(text),
  public.td_salvar_consultor(text, uuid, text, boolean),
  public.td_usuarios_listar(text),
  public.td_salvar_usuario(text, jsonb),
  public.td_backup(text)
to anon, authenticated;

grant execute on function public.td_norm(text), public.td_fone(text), public.td_cod(text) to anon, authenticated;
