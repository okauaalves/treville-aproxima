// Redirecionador público das plaquinhas (QR e NFC). Deploy com verify_jwt = false.
// A service_role existe só neste runtime — nunca no app.
//
// Atenção: no domínio padrão *.supabase.co o Supabase reescreve respostas GET text/html para text/plain
// (https://supabase.com/docs/guides/functions/http-methods). A página de perfil abaixo só renderiza
// como HTML num domínio que sirva HTML. Opções:
//   - PROFILE_PAGE_URL (secret): se definido, perfis ativos recebem 302 para `${PROFILE_PAGE_URL}/${id}`,
//     e a página externa lê os dados em `?format=json` desta mesma função.
//   - Sem PROFILE_PAGE_URL: a função devolve o HTML pronto (útil em domínio próprio / self-host).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { checkDestinationUrl } from '../_shared/destination.ts';
import { PROFILE_PAGE_CSP, renderProfilePage, sanitizeProfile } from '../_shared/profilePage.ts';
import { checkWebhookUrl, WEBHOOK_TIMEOUT_MS, WEBHOOK_USER_AGENT, type WebhookPayload } from '../_shared/webhook.ts';

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function htmlResponse(status: number, html: string): Response {
  return new Response(html, {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `${PROFILE_PAGE_CSP}; frame-ancestors 'none'` },
  });
}

function page(status: number, title: string, message: string): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Tréville Aproxima</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: linear-gradient(135deg, #EEF2FF, #F8FAFC); color: #0F172A; }
  main { max-width: 360px; margin: 24px; padding: 28px 24px; background: #fff; border: 1px solid #C7D2FE; border-radius: 16px; box-shadow: 0 2px 8px rgba(30, 58, 138, .08); text-align: center; }
  h1 { font-size: 20px; margin: 0 0 8px; color: #1E40AF; }
  p { font-size: 15px; line-height: 22px; margin: 0; color: #475569; }
  small { display: block; margin-top: 18px; color: #64748B; font-size: 12px; }
</style>
</head>
<body><main><h1>${title}</h1><p>${message}</p><small>Tréville Aproxima</small></main></body>
</html>`;
  return htmlResponse(status, html);
}

async function hashIp(forwardedFor: string | null): Promise<string | null> {
  const ip = (forwardedFor ?? '').split(',')[0]?.trim();
  if (!ip) {
    return null;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

interface LinkRow {
  id: string;
  user_id: string;
  name: string;
  destination_url: string;
  is_active: boolean;
  profile_enabled?: boolean;
  webhook_url?: string | null;
}

async function loadLink(supabase: SupabaseClient, linkId: string): Promise<{ link: LinkRow | null; failed: boolean }> {
  const full = await supabase.from('redirect_links').select('id, user_id, name, destination_url, is_active, profile_enabled, webhook_url').eq('id', linkId).maybeSingle();
  if (!full.error) {
    return { link: full.data as LinkRow | null, failed: false };
  }
  // Migração do perfil ainda não aplicada: segue só com o redirect.
  const basic = await supabase.from('redirect_links').select('id, user_id, name, destination_url, is_active').eq('id', linkId).maybeSingle();
  return { link: basic.data as LinkRow | null, failed: Boolean(basic.error) };
}

async function loadProfile(supabase: SupabaseClient, link: LinkRow) {
  const [profile, links] = await Promise.all([
    supabase.from('profiles').select('display_name, full_name, bio, avatar_url, theme_color').eq('id', link.user_id).maybeSingle(),
    supabase.from('profile_links').select('title, url, icon, is_active').eq('plaquinha_id', link.id).eq('is_active', true).order('position', { ascending: true }).limit(50),
  ]);
  return sanitizeProfile(
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
}

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

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return page(405, 'Método não permitido', 'Abra este link pelo navegador do celular.');
  }

  const requestUrl = new URL(request.url);
  const segments = requestUrl.pathname.split('/').filter(Boolean);
  const linkId = decodeURIComponent(segments[segments.length - 1] ?? '');
  if (linkId.length < 4 || linkId === 'redirect' || !/^[A-Za-z0-9_-]{4,64}$/.test(linkId)) {
    return page(400, 'Link inválido', 'Confira o QR Code ou a tag e tente de novo.');
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { link, failed } = await loadLink(supabase, linkId);
  if (failed) {
    return page(503, 'Indisponível no momento', 'Não foi possível abrir esta plaquinha agora. Tente de novo em instantes.');
  }
  if (!link) {
    return page(404, 'Plaquinha não encontrada', 'Este QR Code ou tag não está ligado a nenhuma plaquinha.');
  }
  if (!link.is_active) {
    return page(410, 'Esta plaquinha está desativada', 'O dono desativou este link. Fale com quem te passou a plaquinha.');
  }

  const profileEnabled = link.profile_enabled === true;
  const wantsJson = requestUrl.searchParams.get('format') === 'json';

  // Dados públicos do perfil para uma página hospedada fora (não conta scan: quem conta é a visita à URL curta).
  if (wantsJson) {
    if (!profileEnabled) {
      return new Response(JSON.stringify({ error: 'profile_disabled' }), { status: 404, headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json' } });
    }
    const data = await loadProfile(supabase, link);
    return new Response(JSON.stringify({ id: link.id, ...data }), {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const destination = checkDestinationUrl(link.destination_url);
  if (!profileEnabled && !destination.ok) {
    return page(422, 'Destino inválido', 'O destino desta plaquinha não pode ser aberto com segurança.');
  }

  // Log, contador e webhook não podem atrasar nem impedir a resposta.
  // Tag NFC não manda header: a URL gravada na tag leva ?s=nfc.
  const scanType: 'nfc' | 'qr' = request.headers.get('x-scan-type') === 'nfc' || requestUrl.searchParams.get('s') === 'nfc' ? 'nfc' : 'qr';
  const scannedAt = new Date().toISOString();
  const track = (async () => {
    try {
      const ipHash = await hashIp(request.headers.get('x-forwarded-for'));
      const [, counted] = await Promise.allSettled([
        supabase.from('scan_logs').insert({
          link_id: link.id,
          scan_type: scanType,
          scanned_at: scannedAt,
          user_agent: (request.headers.get('user-agent') ?? '').slice(0, 512) || null,
          ip_hash: ipHash,
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
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(track);
  } else {
    await track;
  }

  if (profileEnabled) {
    const external = (Deno.env.get('PROFILE_PAGE_URL') ?? '').replace(/\/+$/, '');
    if (/^https:\/\/[^/]+/.test(external)) {
      return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: `${external}/${encodeURIComponent(link.id)}` } });
    }
    return htmlResponse(200, renderProfilePage(await loadProfile(supabase, link)));
  }

  return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: destination.ok ? destination.url : '' } });
});
