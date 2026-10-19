import { getBrandViewUrl, getPlaquinhaScanUrl, getPublicUrl } from '@/lib/brandPages';
import { createShortLinkHandler } from '@/lib/shortLink';

describe('URL pública da Minha Página', () => {
  it('plaquinha usa o link curto estável (mesmo do QR/NFC)', () => {
    const url = getPlaquinhaScanUrl('K7M2QX', 'qr');
    expect(url).toMatch(/\/t\/K7M2QX$/);
    expect(getPublicUrl({ plaquinha_id: 'K7M2QX', custom_slug: null, is_published: true })).toBe(url);
  });

  it('NFC acrescenta ?s=nfc sem mudar o path', () => {
    expect(getPlaquinhaScanUrl('K7M2QX', 'nfc')).toMatch(/\/t\/K7M2QX\?s=nfc$/);
  });

  it('custom_slug sem plaquinha usa /b/<slug>', () => {
    const url = getPublicUrl({ plaquinha_id: null, custom_slug: 'minha-marca', is_published: true });
    expect(url).toBe(getBrandViewUrl('minha-marca'));
    expect(url).toMatch(/\/b\/minha-marca$/);
  });

  it('sem vínculo e sem slug: null (publicação sem endereço físico ok)', () => {
    expect(getPublicUrl({ plaquinha_id: null, custom_slug: null, is_published: true })).toBeNull();
  });
});

describe('link curto → Minha Página', () => {
  const PROJECT = 'https://fyavoukktjysxtmtkspd.supabase.co';
  const FUNCTION = `${PROJECT}/functions/v1/redirect`;
  const SECRET = 'a'.repeat(48);

  function visit(path: string) {
    return new Request(`https://nfc-manager.expo.app${path}`, {
      method: 'GET',
      headers: { 'user-agent': 'Mozilla/5.0', 'x-real-ip': '203.0.113.7' },
    });
  }

  it('HTML inline com X-Treville-Page: brand manda para /b/<id>', async () => {
    const fetchMock = jest.fn(async () => new Response('<html>brand</html>', { status: 200, headers: { 'X-Treville-Page': 'brand' } }));
    const handler = createShortLinkHandler({ fetch: fetchMock as unknown as typeof fetch, supabaseUrl: PROJECT, proxySecret: SECRET });
    const response = await handler(visit('/t/K7M2QX'), 'K7M2QX');
    expect(fetchMock).toHaveBeenCalledWith(`${FUNCTION}/K7M2QX`, expect.anything());
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/b/K7M2QX');
  });

  it('HTML inline sem header (perfil) continua em /p/<id>', async () => {
    const fetchMock = jest.fn(async () => new Response('<html>perfil</html>', { status: 200 }));
    const handler = createShortLinkHandler({ fetch: fetchMock as unknown as typeof fetch, supabaseUrl: PROJECT, proxySecret: SECRET });
    const response = await handler(visit('/t/K7M2QX'), 'K7M2QX');
    expect(response.headers.get('location')).toBe('/p/K7M2QX');
  });

  it('302 para /b/<id> no host do app é repassado (URL física estável)', async () => {
    const fetchMock = jest.fn(
      async () => new Response(null, { status: 302, headers: { Location: 'https://nfc-manager.expo.app/b/K7M2QX' } }),
    );
    const handler = createShortLinkHandler({ fetch: fetchMock as unknown as typeof fetch, supabaseUrl: PROJECT, proxySecret: SECRET });
    const response = await handler(visit('/t/K7M2QX'), 'K7M2QX');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://nfc-manager.expo.app/b/K7M2QX');
  });
});
