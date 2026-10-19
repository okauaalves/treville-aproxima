import { AUTH_REDIRECT } from '@/constants/config';
import {
  AUTH_OPEN_HEADERS,
  buildAppAuthDeepLink,
  isMobileUserAgent,
  renderAuthOpenPage,
} from '@/lib/authOpenPage';

/**
 * Ponte HTTPS para links de e-mail (recuperação/convite).
 * Mobile → deep link treville://; desktop → HTML com instrução (evita tela em branco).
 */
export function GET(request: Request) {
  const deepLink = buildAppAuthDeepLink(request.url, AUTH_REDIRECT);
  const ua = request.headers.get('user-agent');
  if (isMobileUserAgent(ua)) {
    return new Response(null, {
      status: 302,
      headers: { ...AUTH_OPEN_HEADERS, Location: deepLink, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(renderAuthOpenPage(deepLink), { status: 200, headers: AUTH_OPEN_HEADERS });
}

export function HEAD(request: Request) {
  return GET(request);
}
