-- Múltiplos admins. Gerenciado só pelo dashboard / service_role: nenhuma policy de escrita.
-- Idempotente: pode rodar de novo sem efeito colateral.

create table if not exists public.admins (
  id uuid default gen_random_uuid() primary key,
  email text unique not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  created_at timestamptz default now()
);

insert into public.admins (email) values ('previaemailofc@gmail.com')
on conflict (email) do nothing;

alter table public.admins enable row level security;
revoke all on table public.admins from public, anon, authenticated;
grant select on table public.admins to authenticated;

drop policy if exists "admins_select_own" on public.admins;
create policy "admins_select_own" on public.admins
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Para usar em policies: `using (public.is_admin())`.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
