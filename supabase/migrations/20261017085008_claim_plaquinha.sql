-- Claim de plaquinha "empty" (lote): transfere user_id para o autenticado.
-- Não-empty: devolve id/nome/tipo sem transferir posse (cliente abre visualização/edição).

create or replace function public.claim_plaquinha(p_code text)
returns table (
  id text,
  name text,
  destination_type text,
  claimed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_id text;
  v_name text;
  v_type text;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if not public.has_app_access() then
    raise exception 'Acesso ainda não aprovado.' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z0-9]{4,8}$' then
    raise exception 'Código inválido.' using errcode = '22023';
  end if;

  select l.id, l.name, l.destination_type
    into v_id, v_name, v_type
  from public.redirect_links l
  where l.id = v_code;

  if v_id is null then
    return;
  end if;

  if v_type = 'empty' then
    update public.redirect_links
      set user_id = v_uid,
          updated_at = now()
    where redirect_links.id = v_id
      and redirect_links.destination_type = 'empty';

    return query
      select l.id, l.name, l.destination_type, true
      from public.redirect_links l
      where l.id = v_id;
    return;
  end if;

  return query select v_id, v_name, v_type, false;
end;
$$;

revoke all on function public.claim_plaquinha(text) from public, anon;
grant execute on function public.claim_plaquinha(text) to authenticated;
