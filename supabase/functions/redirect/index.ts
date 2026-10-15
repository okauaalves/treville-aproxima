// Redirecionador público das plaquinhas (QR e NFC). Deploy com verify_jwt = false.
// A service_role existe só neste runtime — nunca no app.
//
// No domínio padrão *.supabase.co o Supabase reescreve respostas GET text/html para text/plain
// (https://supabase.com/docs/guides/functions/http-methods). Por isso:
//   - PROFILE_PAGE_URL (secret, ex.: https://<projeto>.expo.app/p): perfis ativos recebem 302 para
//     `${PROFILE_PAGE_URL}/<id>` e erros para `${PROFILE_PAGE_URL}/erro/<status>`, páginas HTML do EAS Hosting.
//     A página lê `?format=json` daqui, que não conta scan.
//   - Sem PROFILE_PAGE_URL: perfil em HTML (útil em domínio próprio) e erros em texto simples.
//
// O redirect em si nunca é cacheado: mudar o destino ou desativar vale no próximo scan.
//
// Link curto https://<app>.expo.app/t/<ID> (app/t/[id]+api.ts) chama esta função do servidor e repassa o IP do
// visitante em `x-treville-client-ip`, aceito só com SHORT_LINK_PROXY_SECRET (secret igual nos dois lados).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { trustedProxyIp } from '../_shared/clientIp.ts';
import { checkDestinationUrl } from '../_shared/destination.ts';
import { PROFILE_PAGE_CSP, renderProfilePage, sanitizeProfile, type ProfilePageData } from '../_shared/profilePage.ts';
import { STATUS_PAGES, statusText, type StatusKind } from '../_shared/statusPage.ts';
import { TtlCache } from '../_shared/ttlCache.ts';
import { checkWebhookUrl, WEBHOOK_TIMEOUT_MS, WEBHOOK_USER_AGENT, type WebhookPayload } from '../_shared/webhook.ts';

const LINK_ID_PATTERN = /^[A-Z0-9]{4,8}$/;
const PROFILE_CACHE = new TtlCache<ProfilePageData>(10_000, 500);

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function externalBase(): string | null {
  const value = (Deno.env.get('PROFILE_PAGE_URL') ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^/\s]+/.test(value) ? value : null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

/** Erro para quem escaneou: página HTML no host do perfil, ou texto simples no domínio do Supabase. */
function fail(kind: StatusKind): Response {
  const page = STATUS_PAGES[kind];
  const external = externalBase();
  if (external) {
    return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: `${external}/erro/${page.status}` } });
  }
  return new Response(statusText(kind), { status: page.status, headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
}

/** HMAC do IP com segredo do runtime: nunca guarda nem compara IP cru. */
async function hashIp(request: Request): Promise<string> {
  const ip =
    trustedProxyIp(request.headers, Deno.env.get('SHORT_LINK_PROXY_SECRET')) ??
    (request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ??
    '';
  if (!ip) {
    return 'sem-ip';
  }
  const secret = Deno.env.get('IP_HASH_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'treville';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

interface LinkRow {
  id: string;
  user_id: string;
  name: string;
  destination_url: string;
  is_active: boolean;
  profile_enabled: boolean;
  webhook_url: string | null;
}

async function loadLink(supabase: SupabaseClient, linkId: string): Promise<{ link: LinkRow | null; failed: boolean }> {
  const { data, error } = await supabase.from('redirect_links').select('id, user_id, name, destination_url, is_active, profile_enabled, webhook_url').eq('id', linkId).maybeSingle();
  return { link: data as LinkRow | null, failed: Boolean(error) };
}

/** Só os dados públicos do perfil (sem user_id, webhook ou e-mail). Cache de 10s por plaquinha. */
async function loadProfile(supabase: SupabaseClient, link: LinkRow): Promise<ProfilePageData> {
  const cached = PROFILE_CACHE.get(link.id);
  if (cached) {
    return cached;
  }
  const [profile, links] = await Promise.all([
    supabase.from('profiles').select('display_name, full_name, bio, avatar_url, theme_color').eq('id', link.user_id).maybeSingle(),
    supabase.from('profile_links').select('title, url, icon, is_active').eq('plaquinha_id', link.id).eq('is_active', true).order('position', { ascending: true }).limit(50),
  ]);
  const data = sanitizeProfile(
    {
      displayName: profile.data?.display_name,
      fallbackName: link.name,
      bio: profile.data?.bio,
      avatarUrl: profile.data?.avatar_url,
      themeColor: profile.data?.theme_color,
      links: links.data ?? [],
    },
    Deno.env.get('SUPABASE_URL'),
  );
  PROFILE_CACHE.set(link.id, data);
  return data;
}

/** true = pode contar. Sem a migração (RPC ausente) não bloqueia a contagem. */
async function underRateLimit(supabase: SupabaseClient, key: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('rate_limit_hit', { p_key: key });
  if (error) {
    return true;
  }
  return data !== false;
}

/** Payload só com dados do scan: sem IP, user agent ou dados do dono. Timeout de 3s, sem seguir redirect. */
async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  const check = checkWebhookUrl(url);
  if (!check.ok) {
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(check.url, {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'User-Agent': WEBHOOK_USER_AGENT },
      body: JSON.stringify(payload),
    });
    await response.body?.cancel();
  } catch {
    // Silencioso: o webhook nunca afeta o scan.
  } finally {
    clearTimeout(timer);
  }
}

function runInBackground(task: Promise<unknown>): Promise<unknown> | undefined {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
    return undefined;
  }
  return task;
}

Deno.serve(async (request) => {
  const requestUrl = new URL(request.url);
  const pathParts = requestUrl.pathname.split('/').filter(Boolean);
  const linkId = pathParts[pathParts.length - 1] ?? '';
  if (!linkId || linkId === 'redirect' || linkId.length < 4) {
    return json(400, { error: 'Link ID não informado' });
  }

  const wantsJson = requestUrl.searchParams.get('format') === 'json';
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return wantsJson ? json(405, { error: 'method_not_allowed' }) : new Response('Método não permitido.\n', { status: 405, headers: { ...SECURITY_HEADERS, Allow: 'GET, HEAD' } });
  }

  // Valida o formato antes de qualquer consulta ao banco.
  if (!LINK_ID_PATTERN.test(linkId)) {
    return wantsJson ? json(400, { error: 'invalid_id' }) : fail('invalid');
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { link, failed } = await loadLink(supabase, linkId);
  if (failed) {
    return wantsJson ? json(503, { error: 'unavailable' }) : fail('unavailable');
  }
  // Link inexistente ou desativado: não registra nem conta nada.
  if (!link) {
    return wantsJson ? json(404, { error: 'not_found' }) : fail('not_found');
  }
  if (!link.is_active) {
    return wantsJson ? json(410, { error: 'inactive' }) : fail('inactive');
  }

  const profileEnabled = link.profile_enabled === true;

  // Dados públicos para a página hospedada fora. Não conta scan: quem conta é a visita à URL curta.
  if (wantsJson) {
    if (!profileEnabled) {
      return json(404, { error: 'profile_disabled' });
    }
    return json(200, { id: link.id, ...(await loadProfile(supabase, link)) });
  }

  const destination = checkDestinationUrl(link.destination_url);
  if (!profileEnabled && !destination.ok) {
    return fail('invalid_destination');
  }

  if (request.method === 'GET') {
    // Log, contador e webhook não podem atrasar nem impedir a resposta.
    // Tag NFC não manda header: a URL gravada na tag leva ?s=nfc.
    const scanType: 'nfc' | 'qr' = request.headers.get('x-scan-type') === 'nfc' || requestUrl.searchParams.get('s') === 'nfc' ? 'nfc' : 'qr';
    const scannedAt = new Date().toISOString();
    const track = (async () => {
      try {
        const ipHash = await hashIp(request);
        // Acima de 5 scans/10s do mesmo IP na mesma plaquinha: redireciona, mas não conta nem dispara webhook.
        if (!(await underRateLimit(supabase, `${link.id}:${ipHash}`))) {
          return;
        }
        const [, counted] = await Promise.allSettled([
          supabase.from('scan_logs').insert({
            link_id: link.id,
            scan_type: scanType,
            scanned_at: scannedAt,
            user_agent: (request.headers.get('user-agent') ?? '').slice(0, 512) || null,
            ip_hash: ipHash === 'sem-ip' ? null : ipHash,
          }),
          supabase.rpc('increment_scan_count', { link_id: link.id }),
        ]);
        if (link.webhook_url) {
          const value = counted.status === 'fulfilled' ? counted.value.data : null;
          await sendWebhook(link.webhook_url, { link_id: link.id, scan_type: scanType, scanned_at: scannedAt, scan_count: typeof value === 'number' ? value : null });
        }
      } catch {
        // Ignorado: a resposta vale mais que a estatística.
      }
    })();
    const pending = runInBackground(track);
    if (pending) {
      await pending;
    }
  }

  if (profileEnabled) {
    const external = externalBase();
    if (external) {
      return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: `${external}/${encodeURIComponent(link.id)}` } });
    }
    return new Response(renderProfilePage(await loadProfile(supabase, link)), {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `${PROFILE_PAGE_CSP}; frame-ancestors 'none'` },
    });
  }

  return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: destination.ok ? destination.url : '' } });
});
