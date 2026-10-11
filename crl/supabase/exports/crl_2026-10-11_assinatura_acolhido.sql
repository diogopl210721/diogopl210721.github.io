-- CRL · Assinatura do acolhido no cadastro (imagem visível só para o ADM, como RG/CPF)
begin;

drop policy if exists crl_files_select on public.crl_files;
create policy crl_files_select on public.crl_files for select to authenticated using (
  public.crl_is_member(institution_id, true)
  or (stay_id is not null and category not in ('documento','assinatura')
      and public.crl_is_member(institution_id, false) and public.crl_can_access_stay(stay_id)));

do $patch$
declare d text; o text;
begin
  d := pg_get_functiondef('public.crl_can_read_storage_path(text)'::regprocedure); o := d;
  d := replace(d, $x$f.category<>'documento'$x$, $x$f.category not in ('documento','assinatura')$x$);
  if d = o then raise exception 'patch leitura de arquivo (assinatura) não aplicado'; end if;
  execute d;

  d := pg_get_functiondef('public.crl_change(text,uuid,text,jsonb,text)'::regprocedure); o := d;
  d := replace(d, $x$('documento','receita','pertences','foto','remedio','outro')$x$, $x$('documento','receita','pertences','foto','remedio','assinatura','outro')$x$);
  if d = o then raise exception 'patch crl_change (categoria assinatura) não aplicado'; end if;
  execute d;
end $patch$;

-- O monitor só precisa saber SE já assinou (a imagem fica com o ADM)
create or replace function public.crl_stay_signature(p_stay uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_inst uuid; v_at timestamptz;
begin
  select institution_id into v_inst from public.crl_stays where id = p_stay;
  if (select auth.uid()) is null or v_inst is null or not public.crl_is_member(v_inst, false)
     or not public.crl_can_access_stay(p_stay) then
    raise exception 'Acesso negado';
  end if;
  select max(created_at) into v_at from public.crl_files
  where stay_id = p_stay and category = 'assinatura' and deleted_at is null;
  return jsonb_build_object('signed', v_at is not null, 'signed_at', v_at);
end $function$;
revoke execute on function public.crl_stay_signature(uuid) from public, anon;
grant execute on function public.crl_stay_signature(uuid) to authenticated;

commit;
