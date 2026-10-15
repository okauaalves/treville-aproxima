// Link curto https://<app>.expo.app/t/<ID> (API route no EAS Hosting, sem JS no cliente).
// Chama a função redirect do servidor, sem seguir redirect, e devolve o 302 com o mesmo Location:
// quem escaneia nunca vê supabase.co. Quem conta o scan continua sendo a função.
import { PROXY_IP_HEADER, PROXY_SECRET_HEADER, PROXY_SECRET_MIN_LENGTH, visitorIp } from '@/supabase/functions/_shared/clientIp';
import { checkDestinationUrl } from '@/supabase/functions/_shared/destination';
import { statusKindFromCode, type StatusKind } from '@/supabase/functions/_shared/statusPage';
import { LINK_ID_PATTERN, redirectFunctionBase, statusResponse } from '@/lib/profileHost';

export const SHORT_LINK_TIMEOUT_MS = 5_000;

const REDIRECT_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const ERROR_KINDS: Record<number, StatusKind> = { 400: 'invalid', 404: 'not_found', 410: 'inactive', 422: 'invalid_destination' };

/** Página de erro do nosso domínio (`/p/erro/<code>`), para quando a função tem PROFILE_PAGE_URL. */
const OWN_ERROR_PATH = /^\/p\/erro\/(\d{3})\/?$/;

export interface ShortLinkDeps {
  fetch: typeof fetch;
  supabaseUrl: string | null | undefined;
  /** Igual a SHORT_LINK_PROXY_SECRET da função; sem ele a função não confia no IP repassado. */
  proxySecret?: string | null;
  timeoutMs?: number;
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { ...REDIRECT_HEADERS, Location: location } });
}

/** Query de quem escaneou (ex.: ?s=nfc), sem `format` — o JSON público fica só para a página de perfil. */
function forwardedQuery(requestUrl: URL): string {
  const params = new URLSearchParams(requestUrl.search);
  params.delete('format');
  const query = params.toString();
  return query ? `?${query}` : '';
}

function upstreamHeaders(request: Request, proxySecret: string): Headers {
  const headers = new Headers({ Accept: 'text/html,*/*' });
  const userAgent = request.headers.get('user-agent');
  if (userAgent) {
    headers.set('User-Agent', userAgent.slice(0, 512));
  }
  const ip = visitorIp(request.headers);
  if (ip) {
    headers.set('X-Forwarded-For', ip);
    headers.set('X-Real-IP', ip);
    if (proxySecret.length >= PROXY_SECRET_MIN_LENGTH) {
      headers.set(PROXY_IP_HEADER, ip);
      headers.set(PROXY_SECRET_HEADER, proxySecret);
    }
  }
  return headers;
}

export function createShortLinkHandler(deps: ShortLinkDeps) {
  const base = redirectFunctionBase(deps.supabaseUrl);
  const proxySecret = (deps.proxySecret ?? '').trim();
  const timeoutMs = deps.timeoutMs ?? SHORT_LINK_TIMEOUT_MS;

  return async function handle(request: Request, rawId: string): Promise<Response> {
    const id = String(rawId ?? '').toUpperCase();
    if (!LINK_ID_PATTERN.test(id)) {
      return statusResponse('invalid');
    }
    if (!base) {
      return statusResponse('bad_gateway');
    }

    const requestUrl = new URL(request.url);
    const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await deps.fetch(`${base}/${encodeURIComponent(id)}${forwardedQuery(requestUrl)}`, {
        method,
        headers: upstreamHeaders(request, proxySecret),
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch {
      return statusResponse('bad_gateway');
    } finally {
      clearTimeout(timer);
    }
    await response.body?.cancel().catch(() => undefined);

    if (response.status >= 300 && response.status < 400) {
      const location = (response.headers.get('location') ?? '').trim();
      let target: URL | null = null;
      try {
        target = new URL(location);
      } catch {
        target = null;
      }
      const ownError = target && /\.expo\.app$/i.test(target.hostname) ? OWN_ERROR_PATH.exec(target.pathname) : null;
      if (ownError) {
        return statusResponse(statusKindFromCode(ownError[1]));
      }
      const check = checkDestinationUrl(location);
      return check.ok ? redirectTo(check.url) : statusResponse('invalid_destination');
    }
    // Sem PROFILE_PAGE_URL a função devolve o perfil inline (o scan já foi contado): manda para a página daqui.
    if (response.status === 200) {
      return redirectTo(`/p/${encodeURIComponent(id)}`);
    }
    return statusResponse(ERROR_KINDS[response.status] ?? 'bad_gateway');
  };
}
