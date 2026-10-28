-- CRL · Limpeza dos dados de teste antes de começar com dados reais.
-- FICA: a instituição, os logins da Francielly (ADM) e do Douglas (monitor) e a assinatura oficial.
-- APAGA: todo o resto (acolhidos, prontuários, diário, remédios, escala e lista de tarefas, refeições,
-- estoque, caixa, contribuições, declarações, viagens, devocionais, backups, auditoria, arquivos de teste).
-- NÃO TEM VOLTA. Rodar uma vez no editor SQL do Supabase.
do $limpa$
declare
  v_tables text[];
  t text;
  v_left int;
  v_pass int := 0;
  v_keep_users uuid[];
begin
  perform set_config('crl.trusted_change', 'on', true);
  select array_agg(c.relname order by c.relname) into v_tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'crl\_%'
    and c.relname not in ('crl_institutions', 'crl_members', 'crl_signatures');

  -- Os gatilhos de proteção (histórico imutável etc.) ficam desligados só durante a limpeza
  foreach t in array v_tables loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  -- Apaga em várias passadas até tudo zerar (respeitando as ligações entre as tabelas)
  loop
    v_pass := v_pass + 1;
    foreach t in array v_tables loop
      begin
        execute format('delete from public.%I', t);
      exception when foreign_key_violation then null;
      end;
    end loop;
    v_left := 0;
    foreach t in array v_tables loop
      execute format('select %s + count(*) from public.%I', v_left, t) into v_left;
    end loop;
    exit when v_left = 0;
    if v_pass > 10 then raise exception 'Limpeza não terminou: ainda há % registro(s) ligados', v_left; end if;
  end loop;

  foreach t in array v_tables loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  -- Logins: ficam só Francielly e Douglas
  select array_agg(auth_user_id) into v_keep_users from public.crl_members where username in ('francielly', 'douglas');
  delete from public.crl_members where username not in ('francielly', 'douglas');
  delete from auth.users u
  where u.email like '%@crl.ddsinovacao.com.br' and not (u.id = any(v_keep_users))
    and not exists (select 1 from public.crl_members m where m.auth_user_id = u.id);

  -- Arquivos de teste (fotos, anexos e PDFs). A assinatura oficial (crl-signatures) fica.
  begin
    delete from storage.objects where bucket_id in ('crl-private', 'crl-documents');
  exception when others then
    raise notice 'Arquivos de teste não apagados por SQL (%). Apague as pastas em Storage > crl-private e crl-documents.', sqlerrm;
  end;

  raise notice 'Limpeza concluída em % passada(s).', v_pass;
end $limpa$;

-- Conferência: deve mostrar 1 instituição, 2 logins, 1 assinatura e o resto zerado
select 'logins' as item, string_agg(username || ' (' || role || ')', ', ') as resultado from public.crl_members
union all select 'assinatura oficial', count(*)::text from public.crl_signatures where active
union all select 'acolhidos', count(*)::text from public.crl_residents
union all select 'diários', count(*)::text from public.crl_diaries
union all select 'tarefas cadastradas', count(*)::text from public.crl_task_types
union all select 'arquivos de teste', count(*)::text from storage.objects where bucket_id in ('crl-private', 'crl-documents');
