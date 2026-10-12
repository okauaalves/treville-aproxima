// Redirecionador público das plaquinhas (QR e NFC). Deploy com verify_jwt = false.
// A service_role existe só neste runtime — nunca no app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { checkDestinationUrl } from '../_shared/destination.ts';

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };

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
  return new Response(html, { status, headers: HTML_HEADERS });
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

  const { data: link, error } = await supabase
    .from('redirect_links')
    .select('id, destination_url, is_active')
    .eq('id', linkId)
    .maybeSingle();

  if (error) {
    return page(503, 'Indisponível no momento', 'Não foi possível abrir esta plaquinha agora. Tente de novo em instantes.');
  }
  if (!link) {
    return page(404, 'Plaquinha não encontrada', 'Este QR Code ou tag não está ligado a nenhuma plaquinha.');
  }
  if (!link.is_active) {
    return page(410, 'Esta plaquinha está desativada', 'O dono desativou este link. Fale com quem te passou a plaquinha.');
  }

  const destination = checkDestinationUrl(link.destination_url);
  if (!destination.ok) {
    return page(422, 'Destino inválido', 'O destino desta plaquinha não pode ser aberto com segurança.');
  }

  // Log e contador não podem atrasar nem impedir o redirect.
  // Tag NFC não manda header: a URL gravada na tag leva ?s=nfc.
  const scanType = request.headers.get('x-scan-type') === 'nfc' || requestUrl.searchParams.get('s') === 'nfc' ? 'nfc' : 'qr';
  const track = (async () => {
    try {
      const ipHash = await hashIp(request.headers.get('x-forwarded-for'));
      await Promise.allSettled([
        supabase.from('scan_logs').insert({
          link_id: link.id,
          scan_type: scanType,
          user_agent: (request.headers.get('user-agent') ?? '').slice(0, 512) || null,
          ip_hash: ipHash,
        }),
        supabase.rpc('increment_scan_count', { link_id: link.id }),
      ]);
    } catch {
      // Ignorado: o redirect vale mais que a estatística.
    }
  })();
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(track);
  } else {
    await track;
  }

  return new Response(null, { status: 302, headers: { Location: destination.url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
});
