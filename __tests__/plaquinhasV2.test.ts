import {
  sanitizeForStorage,
  sanitizeText,
  sanitizeUrl,
  sanitizeUserInput,
  validateEmail,
  validateLinkId,
  validatePhone,
  validateWebhookUrl,
} from '@/core/validation/securityValidator';
import { createProfileHandler, LINK_ID_PATTERN, redirectFunctionBase } from '@/lib/profileHost';
import {
  aggregateScans,
  buildDestination,
  EMPTY_DESTINATION,
  formatDateTimePtBr,
  parseDestination,
  profilePageUrl,
  resolveProfilePageBase,
  DEFAULT_PROFILE_PAGE_BASE,
} from '@/lib/plaquinhaLogic';
import { FREE_PLAN_EDGE_INVOCATIONS, invocationUsage, monthStartIso } from '@/supabase/functions/_shared/aggregate';
import { renderStatusPage, statusKindFromCode, statusText, STATUS_PAGES } from '@/supabase/functions/_shared/statusPage';
import { TtlCache } from '@/supabase/functions/_shared/ttlCache';

const PROJECT = 'https://abcdefghijklmnop.supabase.co';

describe('securityValidator', () => {
  it('bloqueia esquemas perigosos, inclusive disfarçados', () => {
    for (const value of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' data:text/html,<b>x</b>', 'vbscript:msgbox', 'file:///etc/passwd']) {
      const check = sanitizeUrl(value);
      expect(check.ok).toBe(false);
    }
  });

  it('não reescreve http para https: só avisa', () => {
    const check = sanitizeUrl('http://exemplo.com.br/menu');
    expect(check).toEqual({ ok: true, url: 'http://exemplo.com.br/menu', warning: expect.stringContaining('http://') });
    expect(sanitizeUrl('https://exemplo.com.br')).toEqual({ ok: true, url: 'https://exemplo.com.br', warning: null });
    expect(sanitizeUrl('tel:+5511999998888')).toMatchObject({ ok: true, warning: null });
  });

  it('limpa texto de uma linha e de várias', () => {
    expect(sanitizeText('  Mesa\t5\n\u0007\u200Bnova  ')).toBe('Mesa 5 nova');
    expect(sanitizeText('abcdef', 3)).toBe('abc');
    expect(sanitizeText(42)).toBe('');
    expect(sanitizeForStorage('linha 1\r\n\r\n\r\n\r\nlinha 2\u0000  ')).toBe('linha 1\n\nlinha 2');
    expect(sanitizeUserInput('x'.repeat(600))).toHaveLength(500);
    expect(sanitizeUserInput('a\nb', { multiline: true })).toBe('a\nb');
  });

  it('valida telefone, e-mail e id', () => {
    expect(validatePhone('(11) 99999-8888')).toEqual({ ok: true, digits: '11999998888' });
    expect(validatePhone('+55 11 99999-8888').ok).toBe(true);
    expect(validatePhone('9999-8888').ok).toBe(false);
    expect(validatePhone('12345678901234').ok).toBe(false);
    expect(validateEmail(' Nome@Email.com ')).toEqual({ ok: true, email: 'nome@email.com' });
    expect(validateEmail('nome@email').ok).toBe(false);
    expect(validateEmail('a<b>@x.com').ok).toBe(false);
    expect(validateLinkId('K7M2QX')).toBe(true);
    expect(validateLinkId('k7m2qx')).toBe(false);
    expect(validateLinkId('ABC')).toBe(false);
    expect(validateLinkId('ABCDEFGHI')).toBe(false);
    expect(validateLinkId("K7M2QX' or 1=1")).toBe(false);
  });

  it('reusa a regra anti-SSRF do webhook', () => {
    expect(validateWebhookUrl('https://hooks.exemplo.com/scan').ok).toBe(true);
    expect(validateWebhookUrl('https://127.0.0.1/hook').ok).toBe(false);
    expect(validateWebhookUrl(null).ok).toBe(false);
  });
});

describe('destinos novos (Cardápio e Perfil completo)', () => {
  it('cardápio usa link validado', () => {
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'menu', url: 'restaurante.com.br/cardapio' })).toEqual({ ok: true, url: 'https://restaurante.com.br/cardapio' });
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'menu', url: '' })).toEqual({ ok: false, error: 'Informe o link do cardápio.' });
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'url', url: 'javascript:alert(1)' }).ok).toBe(false);
    expect(parseDestination('https://restaurante.com.br/cardapio', 'menu')).toMatchObject({ type: 'menu', url: 'https://restaurante.com.br/cardapio' });
  });

  it('e-mail e telefone passam pelos validadores', () => {
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'email', email: 'x@y' }).ok).toBe(false);
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'phone', phone: '123' }).ok).toBe(false);
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'whatsapp', phone: '11 99999-8888' }).ok).toBe(true);
  });

  it('página pública do perfil', () => {
    expect(resolveProfilePageBase(undefined)).toBe(DEFAULT_PROFILE_PAGE_BASE);
    expect(resolveProfilePageBase('https://meu.expo.app/p/')).toBe('https://meu.expo.app/p');
    expect(resolveProfilePageBase('http://inseguro.com/p')).toBe(DEFAULT_PROFILE_PAGE_BASE);
    expect(resolveProfilePageBase('javascript:alert(1)')).toBe(DEFAULT_PROFILE_PAGE_BASE);
    expect(profilePageUrl('https://meu.expo.app/p', 'K7M2QX')).toBe('https://meu.expo.app/p/K7M2QX');
  });
});

describe('estatísticas e paginação', () => {
  it('separa QR e NFC por dia', () => {
    const now = new Date(2026, 9, 11, 15, 0);
    const stats = aggregateScans(
      [
        { scanned_at: new Date(2026, 9, 11, 10).toISOString(), scan_type: 'qr' },
        { scanned_at: new Date(2026, 9, 11, 11).toISOString(), scan_type: 'nfc' },
        { scanned_at: new Date(2026, 9, 11, 12).toISOString(), scan_type: 'nfc' },
        { scanned_at: new Date(2026, 9, 9, 12).toISOString(), scan_type: 'qr' },
      ],
      now,
    );
    const today = stats.days[6]!;
    expect(today).toMatchObject({ count: 3, qr: 1, nfc: 2 });
    expect(stats.days[4]).toMatchObject({ count: 1, qr: 1, nfc: 0 });
    expect(stats.maxPerDay).toBe(3);
  });

  it('formata data e hora em pt-BR', () => {
    expect(formatDateTimePtBr(new Date(2026, 0, 5, 9, 7))).toBe('05/01/2026 às 09:07');
    expect(formatDateTimePtBr(null)).toBe('Nunca');
    expect(formatDateTimePtBr('não é data')).toBe('Nunca');
  });

  it('uso do mês contra a cota do plano Free', () => {
    expect(FREE_PLAN_EDGE_INVOCATIONS).toBe(500_000);
    expect(invocationUsage(350_000)).toMatchObject({ percent: 70, warning: false });
    expect(invocationUsage(350_001)).toMatchObject({ warning: true });
    expect(invocationUsage(-5)).toMatchObject({ scansThisMonth: 0, percent: 0 });
    expect(monthStartIso(Date.UTC(2026, 9, 11, 23, 59))).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('páginas de status', () => {
  it('mapeia códigos e escapa', () => {
    expect(statusKindFromCode('410')).toBe('inactive');
    expect(statusKindFromCode('999')).toBe('not_found');
    expect(statusKindFromCode('<script>')).toBe('not_found');
    const html = renderStatusPage('inactive');
    expect(html).toContain('Esta plaquinha está desativada');
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).not.toMatch(/<script/i);
    expect(statusText('not_found')).toContain(STATUS_PAGES.not_found.title);
  });
});

describe('TtlCache', () => {
  it('expira em 10s e respeita o limite', () => {
    const cache = new TtlCache<string>(10_000, 2);
    cache.set('a', '1', 0);
    expect(cache.get('a', 9_999)).toBe('1');
    expect(cache.get('a', 10_000)).toBeUndefined();
    cache.set('a', '1', 0);
    cache.set('b', '2', 0);
    cache.set('c', '3', 0);
    expect(cache.size).toBe(2);
    expect(cache.get('a', 1)).toBeUndefined();
    expect(cache.get('c', 1)).toBe('3');
  });
});

describe('página pública /p/[id] (EAS Hosting)', () => {
  const profile = {
    id: 'K7M2QX',
    name: 'Luiz <b>Tréville</b>',
    bio: 'Doces',
    avatarUrl: 'https://evil.example.com/a.jpg',
    themeColor: '#7C3AED',
    links: [
      { title: 'Instagram', url: 'https://instagram.com/treville', icon: 'instagram' },
      { title: 'XSS', url: 'javascript:alert(1)', icon: 'link' },
    ],
  };

  function fakeFetch(status: number, body: unknown) {
    return jest.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  }

  it('só aceita ids no formato e só chama o projeto do app', async () => {
    expect(LINK_ID_PATTERN.test('K7M2QX')).toBe(true);
    expect(redirectFunctionBase(PROJECT)).toBe(`${PROJECT}/functions/v1/redirect`);
    expect(redirectFunctionBase('https://evil.com')).toBeNull();
    const fetchMock = fakeFetch(200, profile);
    const handle = createProfileHandler({ fetch: fetchMock as unknown as typeof fetch, supabaseUrl: PROJECT });
    const invalid = await handle('../../etc');
    expect(invalid.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renderiza o perfil com headers de segurança, sem JS e sem dados inseguros', async () => {
    const fetchMock = fakeFetch(200, profile);
    const handle = createProfileHandler({ fetch: fetchMock as unknown as typeof fetch, supabaseUrl: PROJECT });
    const response = await handle('K7M2QX');
    expect(fetchMock).toHaveBeenCalledWith(`${PROJECT}/functions/v1/redirect/K7M2QX?format=json`, expect.objectContaining({ redirect: 'manual' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const html = await response.text();
    expect(html).toContain('Luiz &lt;b&gt;Tréville&lt;/b&gt;');
    // Liquid glass usa <script> inline (CSP: script-src 'unsafe-inline'); bloqueia externos/XSS.
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('evil.example.com');
    expect(html).toContain('href="https://instagram.com/treville"');
  });

  it('usa cache de 10s e não guarda erros', async () => {
    let now = 0;
    const fetchMock = fakeFetch(200, profile);
    const handle = createProfileHandler({ fetch: fetchMock as unknown as typeof fetch, supabaseUrl: PROJECT, now: () => now });
    await handle('K7M2QX');
    await handle('K7M2QX');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now = 10_001;
    await handle('K7M2QX');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const missing = fakeFetch(404, { error: 'not_found' });
    const handleMissing = createProfileHandler({ fetch: missing as unknown as typeof fetch, supabaseUrl: PROJECT });
    expect((await handleMissing('ZZZZZZ')).status).toBe(404);
    expect((await handleMissing('ZZZZZZ')).status).toBe(404);
    expect(missing).toHaveBeenCalledTimes(2);
  });

  it('traduz erros do JSON em páginas amigáveis', async () => {
    const cases: [number, unknown, number, string][] = [
      [404, { error: 'not_found' }, 404, 'Plaquinha não encontrada'],
      [404, { error: 'profile_disabled' }, 404, 'Página de perfil desligada'],
      [410, { error: 'inactive' }, 410, 'desativada'],
      [500, {}, 503, 'Indisponível'],
    ];
    for (const [status, body, expected, text] of cases) {
      const handle = createProfileHandler({ fetch: fakeFetch(status, body) as unknown as typeof fetch, supabaseUrl: PROJECT });
      const response = await handle('K7M2QX');
      expect(response.status).toBe(expected);
      expect(await response.text()).toContain(text);
    }
    const offline = createProfileHandler({ fetch: jest.fn(async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch, supabaseUrl: PROJECT });
    expect((await offline('K7M2QX')).status).toBe(503);
    const noProject = createProfileHandler({ fetch: fakeFetch(200, profile) as unknown as typeof fetch, supabaseUrl: undefined });
    expect((await noProject('K7M2QX')).status).toBe(503);
  });
});
