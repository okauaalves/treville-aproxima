import { createShortLinkHandler } from '@/lib/shortLink';
import { PROXY_IP_HEADER, PROXY_SECRET_HEADER, trustedProxyIp, visitorIp } from '@/supabase/functions/_shared/clientIp';

const PROJECT = 'https://fyavoukktjysxtmtkspd.supabase.co';
const FUNCTION = `${PROJECT}/functions/v1/redirect`;
const SECRET = 'a'.repeat(48);

function visit(path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`https://nfc-manager--abc123.expo.app${path}`, {
    method,
    headers: { 'user-agent': 'Mozilla/5.0 (Android) Celular', 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '203.0.113.7, 172.70.1.1', ...headers },
  });
}

function upstream(status: number, headers: Record<string, string> = {}, body: string | null = null) {
  return jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(body, { status, headers }));
}

function handler(fetchMock: jest.Mock, extra: { proxySecret?: string; timeoutMs?: number } = {}) {
  return createShortLinkHandler({ fetch: fetchMock as unknown as typeof fetch, supabaseUrl: PROJECT, proxySecret: SECRET, ...extra });
}

function sentHeaders(fetchMock: jest.Mock): Headers {
  return new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
}

function expectHtmlPage(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
}

describe('link curto /t/[id]', () => {
  it.each(['abc', 'ABC', 'ABCDEFGHI', 'AB_CD', '..%2F..', ''])('id inválido %p: 400 HTML sem chamar a função', async (id) => {
    const fetchMock = upstream(302, { Location: 'https://exemplo.com' });
    const response = await handler(fetchMock)(visit(`/t/${id}`), id);
    expectHtmlPage(response, 400);
    expect(await response.text()).toContain('Link inválido');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('302 da função: repassa o mesmo Location, sem cache, e aceita minúsculas', async () => {
    const fetchMock = upstream(302, { Location: 'https://wa.me/5511999998888?text=Oi' });
    const response = await handler(fetchMock)(visit('/t/k7m2qx'), 'k7m2qx');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://wa.me/5511999998888?text=Oi');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledWith(`${FUNCTION}/K7M2QX`, expect.objectContaining({ method: 'GET', redirect: 'manual' }));
  });

  it.each(['mailto:a@b.com', 'tel:+5511999998888', 'sms:+5511999998888', 'https://nfc-manager.expo.app/p/K7M2QX'])('aceita Location %p', async (location) => {
    const response = await handler(upstream(302, { Location: location }))(visit('/t/K7M2QX'), 'K7M2QX');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(location);
  });

  it.each(['javascript:alert(1)', 'data:text/html,oi', '', 'https://user:pass@evil.com', 'nao é url'])('Location inseguro %p vira 422 HTML', async (location) => {
    const response = await handler(upstream(302, location ? { Location: location } : {}))(visit('/t/K7M2QX'), 'K7M2QX');
    expectHtmlPage(response, 422);
  });

  it('erro da função redirecionado para /p/erro/<code> do nosso domínio vira a página direto', async () => {
    const response = await handler(upstream(302, { Location: 'https://nfc-manager.expo.app/p/erro/410' }))(visit('/t/K7M2QX'), 'K7M2QX');
    expectHtmlPage(response, 410);
  });

  it.each([
    [404, 404, 'Plaquinha não encontrada'],
    [410, 410, 'desativada'],
    [400, 400, 'Link inválido'],
    [503, 502, 'Tente novamente'],
    [500, 502, 'Tente novamente'],
  ])('função responde %p: página HTML %p', async (status, expected, text) => {
    const response = await handler(upstream(status, { 'Content-Type': 'text/plain' }, 'x'))(visit('/t/ZZZZZZ'), 'ZZZZZZ');
    expectHtmlPage(response, expected);
    const html = await response.text();
    expect(html).toContain(text);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('supabase.co');
  });

  it('perfil inline (função sem PROFILE_PAGE_URL): manda para /p/<ID> daqui', async () => {
    const response = await handler(upstream(200, { 'Content-Type': 'text/plain' }, '<html>'))(visit('/t/K7M2QX'), 'K7M2QX');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/p/K7M2QX');
  });

  it('timeout da função: 502 "Tente novamente"', async () => {
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const response = await handler(fetchMock, { timeoutMs: 20 })(visit('/t/K7M2QX'), 'K7M2QX');
    expectHtmlPage(response, 502);
    expect(await response.text()).toContain('Tente novamente');
  });

  it('erro de rede: 502', async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expectHtmlPage(await handler(fetchMock)(visit('/t/K7M2QX'), 'K7M2QX'), 502);
  });

  it('repassa ?s=nfc (sem format), IP real e user-agent do visitante', async () => {
    const fetchMock = upstream(302, { Location: 'https://exemplo.com' });
    await handler(fetchMock)(visit('/t/K7M2QX?s=nfc&format=json'), 'K7M2QX');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${FUNCTION}/K7M2QX?s=nfc`);
    const headers = sentHeaders(fetchMock);
    expect(headers.get('user-agent')).toBe('Mozilla/5.0 (Android) Celular');
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(headers.get('x-real-ip')).toBe('203.0.113.7');
    expect(headers.get(PROXY_IP_HEADER)).toBe('203.0.113.7');
    expect(headers.get(PROXY_SECRET_HEADER)).toBe(SECRET);
    expect(headers.get('apikey')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
  });

  it('visitantes diferentes chegam à função com IPs diferentes (rate limit por pessoa)', async () => {
    const fetchMock = upstream(302, { Location: 'https://exemplo.com' });
    const handle = handler(fetchMock);
    await handle(visit('/t/K7M2QX', { 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.1' }), 'K7M2QX');
    await handle(visit('/t/K7M2QX', { 'x-real-ip': '2001:db8::5', 'x-forwarded-for': '2001:db8::5' }), 'K7M2QX');
    const ips = fetchMock.mock.calls.map((call) => new Headers((call[1] as RequestInit).headers).get(PROXY_IP_HEADER));
    expect(ips).toEqual(['198.51.100.1', '2001:db8::5']);
  });

  it('sem segredo configurado não manda o header do proxy (a função não confiaria)', async () => {
    const fetchMock = upstream(302, { Location: 'https://exemplo.com' });
    await handler(fetchMock, { proxySecret: '' })(visit('/t/K7M2QX'), 'K7M2QX');
    const headers = sentHeaders(fetchMock);
    expect(headers.get(PROXY_SECRET_HEADER)).toBeNull();
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('HEAD repassa HEAD (a função só conta scan em GET)', async () => {
    const fetchMock = upstream(302, { Location: 'https://exemplo.com' });
    await handler(fetchMock)(visit('/t/K7M2QX', {}, 'HEAD'), 'K7M2QX');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'HEAD' }));
  });

  it('sem URL do Supabase válida: 502 sem chamar nada', async () => {
    const fetchMock = upstream(302, { Location: 'https://exemplo.com' });
    const handle = createShortLinkHandler({ fetch: fetchMock as unknown as typeof fetch, supabaseUrl: 'https://evil.com' });
    expectHtmlPage(await handle(visit('/t/K7M2QX'), 'K7M2QX'), 502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('IP do visitante (função redirect)', () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it('EAS Hosting: X-Real-IP, depois o primeiro do X-Forwarded-For', () => {
    expect(visitorIp(headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1' }))).toBe('203.0.113.7');
    expect(visitorIp(headers({ 'x-forwarded-for': '203.0.113.7, 172.70.1.1' }))).toBe('203.0.113.7');
    expect(visitorIp(headers({ 'x-real-ip': 'lixo<script>' }))).toBeNull();
  });

  it('a função só aceita o IP do proxy com o segredo certo', () => {
    const forwarded = { [PROXY_IP_HEADER]: '203.0.113.7' };
    expect(trustedProxyIp(headers({ ...forwarded, [PROXY_SECRET_HEADER]: SECRET }), SECRET)).toBe('203.0.113.7');
    expect(trustedProxyIp(headers({ ...forwarded, [PROXY_SECRET_HEADER]: 'b'.repeat(48) }), SECRET)).toBeNull();
    expect(trustedProxyIp(headers(forwarded), SECRET)).toBeNull();
    expect(trustedProxyIp(headers({ ...forwarded, [PROXY_SECRET_HEADER]: 'curto' }), 'curto')).toBeNull();
    expect(trustedProxyIp(headers({ ...forwarded, [PROXY_SECRET_HEADER]: SECRET }), undefined)).toBeNull();
    expect(trustedProxyIp(headers({ [PROXY_IP_HEADER]: 'nao-ip', [PROXY_SECRET_HEADER]: SECRET }), SECRET)).toBeNull();
  });
});
