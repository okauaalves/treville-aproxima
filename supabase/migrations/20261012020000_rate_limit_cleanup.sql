-- Rate limit dos scans, limpeza automática (pg_cron) e índices de escala.
-- Idempotente: pode rodar de novo sem efeito colateral.

-- 1) Rate limit: só a Edge Function (service_role) lê e escreve. RLS ligado e nenhuma policy.
--    Chave = "<linkId>:<hmac do ip>" — o IP cru nunca chega ao banco.
create table if not exists public.rate_limits (
  key text primary key check (char_length(key) between 6 and 80),
  window_start timestamptz not null default now(),
  hits integer not null default 1 check (hits >= 1)
);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;

create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

-- Atômica: um único INSERT ... ON CONFLICT. Janela fixa de 10s; true = ainda pode contar (até 5 na janela).
create or replace function public.rate_limit_hit(p_key text, p_limit integer default 5, p_window_seconds integer default 10)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
        hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits <= p_limit;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- 2) Índices.
create index if not exists profile_links_plaquinha_position_idx on public.profile_links (plaquinha_id, position);
create index if not exists scan_logs_scanned_at_idx on public.scan_logs (scanned_at);

-- 3) Limpeza com pg_cron (disponível no plano free). Reagendar é idempotente: remove o job antigo pelo nome.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname in ('treville_rate_limits_cleanup', 'treville_scan_logs_cleanup');

-- Janelas de rate limit vencidas (> 1 min), a cada minuto.
select cron.schedule(
  'treville_rate_limits_cleanup',
  '* * * * *',
  $job$delete from public.rate_limits where window_start < now() - interval '1 minute'$job$
);

-- Logs com mais de 90 dias e excesso por plaquinha (mantém os 1000 mais recentes), num único statement.
select cron.schedule(
  'treville_scan_logs_cleanup',
  '17 3 * * *',
  $job$
  delete from public.scan_logs s
  using (
    select id
    from (
      select id, scanned_at, row_number() over (partition by link_id order by scanned_at desc, id desc) as rn
      from public.scan_logs
    ) ranked
    where ranked.rn > 1000 or ranked.scanned_at < now() - interval '90 days'
  ) expired
  where s.id = expired.id
  $job$
);
