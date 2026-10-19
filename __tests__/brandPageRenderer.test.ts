import {
  filterActiveLinks,
  getThemeStyles,
  pickPrimaryCta,
  renderBrandPage,
  sanitizeBrandPage,
  type BrandPage,
} from '@/supabase/functions/_shared/brandPageRenderer';

const PROJECT = 'https://abcdefghij12.supabase.co';
const LOGO = `${PROJECT}/storage/v1/object/public/brand-assets/11111111-1111-4111-8111-111111111111/logo.png`;

const brandFixture: BrandPage = {
  brand_name: 'Tréville',
  tagline: 'Conexões inteligentes',
  about: null,
  logo_url: LOGO,
  banner_image_url: null,
  theme_mode: 'dark',
  primary_color: '#007AFF',
  secondary_color: '#0A84FF',
};

describe('filterActiveLinks', () => {
  it('mantém só is_active=true com destination_url válida', () => {
    const links = filterActiveLinks([
      { link_type: 'social', label: 'WhatsApp', destination_url: 'https://wa.me/5511999998888', position: 0, is_active: true },
      { link_type: 'instagram', label: 'IG', destination_url: 'https://instagram.com/x', position: 1, is_active: false },
      { link_type: 'contact', label: 'Email', destination_url: '', position: 2, is_active: true },
      { link_type: 'portfolio', label: 'Site', destination_url: 'javascript:alert(1)', position: 3, is_active: true },
      { link_type: 'about', label: 'Sobre', destination_url: 'https://exemplo.com/sobre', position: 4, is_active: true },
    ]);
    expect(links.map((l) => l.link_type)).toEqual(['social', 'about']);
    expect(links.every((l) => l.destination_url)).toBe(true);
  });

  it('ordena por position e preenche label padrão', () => {
    const links = filterActiveLinks([
      { link_type: 'google_reviews', destination_url: 'https://g.page/r/abc', position: 2, is_active: true },
      { link_type: 'instagram', destination_url: 'https://instagram.com/brand', position: 0, is_active: true },
    ]);
    expect(links[0]?.link_type).toBe('instagram');
    expect(links[0]?.label).toBe('Instagram');
    expect(links[1]?.label).toBe('Google Avaliações');
  });
});

describe('getThemeStyles', () => {
  it('escuro usa gradiente azul-marinho e cartões um tom mais claros', () => {
    const theme = getThemeStyles('dark', brandFixture);
    expect(theme.mode).toBe('dark');
    expect(theme.pageBackground).toContain('linear-gradient');
    expect(theme.pageBackground).toContain('#0B1F3A');
    expect(theme.cardBackground).toBe('#12253F');
    expect(theme.cardBorder).toContain('#007AFF');
    expect(theme.cardShadow).toMatch(/0 0 22px|#007AFF/);
    expect(theme.sheenOpacity).toBe('0.08');
    expect(theme.primary).toBe('#007AFF');
    expect(theme.ctaBackground).toBe('#007AFF');
    expect(theme.iconBackground).toBe('#4A90E2');
  });

  it('claro usa fundo #F8FAFC e cartões brancos com borda azul suave', () => {
    const theme = getThemeStyles('light', brandFixture);
    expect(theme.mode).toBe('light');
    expect(theme.pageBackground).toBe('#F8FAFC');
    expect(theme.cardBackground).toBe('#FFFFFF');
    expect(theme.cardBorder).toContain('#007AFF');
    expect(theme.sheenOpacity).toBe('0.06');
    expect(theme.text).toBe('#0F172A');
  });

  it('equilibrado deriva do primary sem cinza genérico', () => {
    const theme = getThemeStyles('balanced', { ...brandFixture, primary_color: '#DC2626' });
    expect(theme.mode).toBe('balanced');
    expect(theme.pageBackground).toMatch(/#/);
    expect(theme.pageBackground).not.toMatch(/#808080|#9CA3AF|#6B7280/i);
    expect(theme.glowBlobs).toContain('#DC2626');
    expect(theme.cardBorder).toContain('#DC2626');
  });

  it('border_color da logo prevalece nas bordas dos cards', () => {
    const theme = getThemeStyles('dark', {
      ...brandFixture,
      primary_color: '#007AFF',
      border_color: '#DC2626',
    });
    expect(theme.cardBorder).toContain('#DC2626');
    expect(theme.chromeBorder).toContain('#DC2626');
    expect(theme.glowBlobs).toContain('#DC2626');
  });
});

describe('pickPrimaryCta', () => {
  it('prefere social (WhatsApp) e cai no primeiro link', () => {
    const links = filterActiveLinks([
      { link_type: 'instagram', destination_url: 'https://instagram.com/x', position: 0, is_active: true },
      { link_type: 'social', destination_url: 'https://wa.me/1', position: 1, is_active: true },
    ]);
    expect(pickPrimaryCta(links)?.link_type).toBe('social');
    expect(pickPrimaryCta(links.slice(0, 1))?.link_type).toBe('instagram');
    expect(pickPrimaryCta([])).toBeNull();
  });
});

describe('sanitizeBrandPage + renderBrandPage', () => {
  it('escapa XSS e inclui estrutura pedida (banner + grid + glow)', () => {
    const evil = '"><script>alert(1)</script>';
    const data = sanitizeBrandPage(
      {
        brand_name: evil,
        tagline: `Bio ${evil}`,
        logo_url: `${LOGO}"onerror="alert(2)`,
        theme_mode: 'dark',
        primary_color: '#007AFF',
        secondary_color: '#0A84FF',
        links: [
          { link_type: 'social', label: evil, description: evil, destination_url: 'https://wa.me/5511', is_active: true, position: 0 },
          { link_type: 'instagram', label: 'IG', destination_url: 'https://instagram.com/x', is_active: true, position: 1 },
          { link_type: 'contact', label: 'Sem URL', destination_url: null, is_active: true, position: 2 },
        ],
      },
      PROJECT,
    );
    const html = renderBrandPage(data, { pageUrl: 'https://nfc-manager.expo.app/b/AB12CD' });
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).toContain('property="og:url" content="https://nfc-manager.expo.app/b/AB12CD"');
    expect(html).not.toContain('noindex');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/\sonerror=/i);
    expect(html).toContain('#12253F');
    expect(html).toContain('linear-gradient(165deg,#0B1F3A');
    expect(html).toContain('border:1.5px solid');
    expect(html).toContain('--border:#007AFF99');
    expect(html).toContain('--accent:#007AFF');
    expect(html).toContain('--accent-glow:#007AFF55');
    expect(html).toContain('.lg::before');
    expect(html).toContain('liquid-glass');
    expect(html).toContain('id="glass-distortion"');
    expect(html).toContain('class="brand-card liquid-glass"');
    expect(html).toContain('class="button-wrap"');
    expect(html).toContain('class="cta-button"');
    expect(html).toContain('#2F5FE0');
    expect(html).toContain('#4A7FFF');
    expect(html).toContain('class="button-shadow"');
    expect(html).toContain('dottedGrid');
    expect(html).toContain('class="link-card liquid-glass"');
    expect(html).toContain('icon-circle');
    expect(html).toContain('border-radius:26px');
    expect(html).toContain('scale(1.03)');
    expect(html).toContain('scale(0.97)');
    expect(html).toContain('cubic-bezier(0.25,1,0.5,1)');
    expect(html).toContain('inset 2px 2px 1px 0 rgb(255 255 255 / 65%)');
    expect(html).toContain('backdrop-filter:blur(8px)');
    expect(html).toContain('surfaceScale="9"');
    expect(html).toContain('scale="280"');
    expect(html).toContain('.button-wrap{position:relative;z-index:2;width:100%');
    expect(html).toContain('width:100%;box-sizing:border-box;text-decoration:none');
    expect(html).toContain('PÁGINA');
    expect(html).toContain('>PAGINA<');
    expect(html).toContain('class="grid"');
    expect(html).not.toContain('class="brand-card liquid-glass has-banner"');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('<title>');
    expect(html).toContain('icon-social');
    expect(html).toContain('#4A90E2');
    expect(html).toContain('#25D366');
    expect(html).toContain('M6.62 10.79');
    expect(html).toContain('class="banner-decor"');
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toContain('class="waves"');
    expect(html).toContain('border-radius:999px');
    expect(html).toContain('border-radius:24px');
    expect(html.match(/<a class="link-card/g)?.length).toBe(2);
    expect(data.brand.logo_url).toBeNull();
  });

  it('barra chrome em uma linha quando pageUrl é válida', () => {
    const data = sanitizeBrandPage(
      {
        brand_name: 'Tréville',
        theme_mode: 'light',
        links: [
          { link_type: 'social', destination_url: 'https://wa.me/1', is_active: true },
          { link_type: 'google_reviews', destination_url: 'https://g.page/r/x', is_active: true },
          { link_type: 'about', destination_url: 'https://exemplo.com/sobre', is_active: true },
        ],
      },
      PROJECT,
    );
    const html = renderBrandPage(data, { pageUrl: 'https://treville.growthn.cc/bb' });
    expect(html).toContain('class="chrome lg"');
    expect(html).toContain('chrome-row');
    expect(html).not.toContain('chrome-row-actions');
    expect(html).toContain('data-chrome="copy"');
    expect(html).toContain('data-chrome="qr"');
    expect(html).toContain('data-chrome="share"');
    expect(html).toContain('treville.growthn.cc/bb');
    expect(html).toContain('#4285F4');
    expect(html).toContain('#34A853');
    expect(html).toContain('#FBBC05');
    expect(html).toContain('#EA4335');
    expect(html).toContain('icon-about');
    expect(html).toContain('#F8FAFC');
    expect(html).not.toContain('javascript:');
  });

  it('renderiza os três temas com fixture', () => {
    for (const mode of ['dark', 'light', 'balanced'] as const) {
      const data = sanitizeBrandPage(
        {
          brand_name: 'Studio Aurora',
          tagline: 'Design e presença',
          theme_mode: mode,
          primary_color: '#0EA5E9',
          secondary_color: '#0284C7',
          links: [
            { link_type: 'social', label: 'WhatsApp', description: 'Fale conosco', destination_url: 'https://wa.me/5511999990000', is_active: true },
            { link_type: 'google_reviews', label: 'Avaliações', description: 'Google', destination_url: 'https://g.page/r/demo', is_active: true },
            { link_type: 'portfolio', destination_url: 'https://exemplo.com', is_active: true },
          ],
        },
        PROJECT,
      );
      const html = renderBrandPage(data);
      expect(html).toContain(`data-theme="${mode}"`);
      expect(html).toContain('Studio Aurora');
      expect(html).toContain('border:1.5px solid');
      expect(html).toContain('PAGINA');
      expect(html).toContain('class="link-desc"');
      expect(html).toContain('Fale conosco');
      expect(html).toContain('opacity:.88');
      // Sem description: não renderiza link-desc vazio (evita gap).
      expect(html).toContain('>Meu Portfólio</span>');
      expect(html.match(/class="link-desc"/g)?.length).toBe(2);
    }
  });

  it('aceita logo só do bucket brand-assets do projeto', () => {
    expect(sanitizeBrandPage({ brand_name: 'A', logo_url: LOGO }, PROJECT).brand.logo_url).toBe(LOGO);
    expect(sanitizeBrandPage({ brand_name: 'A', logo_url: 'https://evil.com/x.png' }, PROJECT).brand.logo_url).toBeNull();
  });

  it('aceita banner_image_url seguro e aplica has-banner no HTML', () => {
    const banner = `${PROJECT}/storage/v1/object/public/brand-assets/11111111-1111-4111-8111-111111111111/banner.jpg`;
    expect(sanitizeBrandPage({ brand_name: 'A', banner_image_url: banner }, PROJECT).brand.banner_image_url).toBe(banner);
    expect(sanitizeBrandPage({ brand_name: 'A', banner_image_url: 'https://evil.com/x.jpg' }, PROJECT).brand.banner_image_url).toBeNull();
    const html = renderBrandPage(sanitizeBrandPage({ brand_name: 'A', banner_image_url: banner, links: [{ link_type: 'social', destination_url: 'https://wa.me/1', is_active: true }] }, PROJECT));
    expect(html).toContain('class="brand-card liquid-glass has-banner"');
    expect(html).toContain('--banner-image:url(');
    expect(html).toContain('class="banner-decor"');
    expect(html).not.toContain('class="waves"');
  });

  it('logo só abre modal de sobre quando about está preenchido', () => {
    const without = renderBrandPage(sanitizeBrandPage({ brand_name: 'Marca', tagline: 'Curta' }, PROJECT));
    expect(without).not.toContain('data-about-open');
    expect(without).not.toContain('id="about-overlay"');

    const data = sanitizeBrandPage(
      { brand_name: 'Marca', tagline: 'Curta', about: 'História da marca <script>x</script>', logo_url: LOGO },
      PROJECT,
    );
    expect(data.brand.about).toContain('História da marca');
    const html = renderBrandPage(data);
    expect(html).toContain('data-about-open');
    expect(html).toContain('id="about-overlay"');
    expect(html).toContain('class="about-sheet liquid-glass"');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('logo-trigger');
  });
});
