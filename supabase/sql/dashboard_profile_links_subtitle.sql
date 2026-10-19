-- Cole no SQL Editor do Dashboard (projeto fyavoukktjysxtmtkspd) se o CLI/MCP não aplicar.
-- Idempotente: coluna profile_links.subtitle + RPC save_profile_links atualizada.

alter table public.profile_links
  add column if not exists subtitle text;

alter table public.profile_links drop constraint if exists profile_links_subtitle_len;
alter table public.profile_links
  add constraint profile_links_subtitle_len
  check (subtitle is null or char_length(subtitle) <= 120)
  not valid;

create or replace function public.save_profile_links(p_plaquinha_id text, p_links jsonb)
returns setof public.profile_links
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 50 then
    raise exception 'Lista de links inválida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.redirect_links where id = p_plaquinha_id and user_id = auth.uid()) then
    raise exception 'Plaquinha não encontrada' using errcode = '42501';
  end if;

  delete from public.profile_links
  where plaquinha_id = p_plaquinha_id
    and user_id = auth.uid()
    and id not in (
      select (e ->> 'id')::uuid from jsonb_array_elements(p_links) e
      where coalesce(e ->> 'id', '') <> ''
    );

  insert into public.profile_links (id, user_id, plaquinha_id, title, url, icon, subtitle, position, is_active)
  select
    coalesce(nullif(e ->> 'id', '')::uuid, gen_random_uuid()),
    auth.uid(),
    p_plaquinha_id,
    e ->> 'title',
    e ->> 'url',
    coalesce(nullif(e ->> 'icon', ''), 'link'),
    nullif(trim(coalesce(e ->> 'subtitle', '')), ''),
    (t.ord - 1)::integer,
    coalesce((e ->> 'is_active')::boolean, true)
  from jsonb_array_elements(p_links) with ordinality as t(e, ord)
  on conflict (id) do update
    set title = excluded.title,
        url = excluded.url,
        icon = excluded.icon,
        subtitle = excluded.subtitle,
        position = excluded.position,
        is_active = excluded.is_active
    where public.profile_links.user_id = auth.uid()
      and public.profile_links.plaquinha_id = p_plaquinha_id;

  return query
    select * from public.profile_links
    where plaquinha_id = p_plaquinha_id and user_id = auth.uid()
    order by position;
end;
$$;

revoke execute on function public.save_profile_links(text, jsonb) from public, anon;
grant execute on function public.save_profile_links(text, jsonb) to authenticated;
