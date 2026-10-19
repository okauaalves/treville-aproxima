import { moveItem, normalizeLinkUrl, validateProfileForm, validateProfileLinks, type ProfileLink } from '@/lib/perfilLogic';
import { escapeHtml, isAllowedAvatarUrl, isAllowedBannerUrl, pickProfilePrimaryCta, PROFILE_PAGE_CSP, renderProfilePage, sanitizeProfile } from '@/supabase/functions/_shared/profilePage';
import { checkWebhookUrl } from '@/supabase/functions/_shared/webhook';

const PROJECT = 'https://abcdefghij12.supabase.co';
const AVATAR = `${PROJECT}/storage/v1/object/public/avatars/11111111-1111-4111-8111-111111111111/avatar.jpg?v=1`;
const BANNER = `${PROJECT}/storage/v1/object/public/avatars/11111111-1111-4111-8111-111111111111/banner.jpg`;

describe('escapeHtml', () => {
  it('escapa caracteres de HTML e atributos', () => {
    expect(escapeHtml(`<script>alert("x")</script>&'=\``)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;&#61;&#96;');
  });
});

describe('sanitizeProfile', () => {
  it('usa o nome da plaquinha quando não há nome de exibição e limita tamanhos', () => {
    const data = sanitizeProfile({ displayName: '  ', fallbackName: 'Cardápio', bio: 'x'.repeat(300) }, PROJECT);
    expect(data.name).toBe('Cardápio');
    expect(data.bio).toHaveLength(120);
    expect(data.themeColor).toBe('#1E40AF');
  });

  it('descarta links inativos, sem título ou com esquema perigoso', () => {
    const data = sanitizeProfile(
      {
        displayName: 'Luiz',
        links: [
          { title: 'Site', url: 'https://exemplo.com', icon: 'site' },
          { title: 'XSS', url: 'javascript:alert(1)', icon: 'link' },
          { title: 'Data', url: 'data:text/html,<b>x</b>', icon: 'link' },
          { title: 'Oculto', url: 'https://oculto.com', icon: 'link', is_active: false },
          { title: '', url: 'https://semtitulo.com', icon: 'link' },
          { title: 'Ícone estranho', url: 'tel:+5511999998888', icon: '<svg onload=1>' },
        ],
      },
      PROJECT,
    );
    expect(data.links).toEqual([
      { title: 'Site', subtitle: '', url: 'https://exemplo.com', icon: 'site' },
      { title: 'Ícone estranho', subtitle: '', url: 'tel:+5511999998888', icon: 'link' },
    ]);
  });

  it('aceita subtítulo opcional e descarta excesso de tamanho', () => {
    const data = sanitizeProfile(
      {
        displayName: 'Luiz',
        links: [
          { title: 'WhatsApp', subtitle: 'Conecte-se comigo', url: 'https://wa.me/5511999998888', icon: 'whatsapp' },
          { title: 'Site', description: 'Meu portfólio', url: 'https://exemplo.com', icon: 'site' },
        ],
      },
      PROJECT,
    );
    expect(data.links[0]).toMatchObject({ title: 'WhatsApp', subtitle: 'Conecte-se comigo', icon: 'whatsapp' });
    expect(data.links[1]).toMatchObject({ title: 'Site', subtitle: 'Meu portfólio', icon: 'site' });
  });

  it('aceita avatar só do bucket público do próprio projeto via https', () => {
    expect(isAllowedAvatarUrl(AVATAR, PROJECT)).toBe(true);
    expect(isAllowedAvatarUrl(AVATAR.replace('https:', 'http:'), PROJECT)).toBe(false);
    expect(isAllowedAvatarUrl('https://evil.com/storage/v1/object/public/avatars/a.jpg', PROJECT)).toBe(false);
    expect(isAllowedAvatarUrl(`${PROJECT}/storage/v1/object/public/outros/a.jpg`, PROJECT)).toBe(false);
    expect(isAllowedAvatarUrl('javascript:alert(1)', PROJECT)).toBe(false);
    expect(sanitizeProfile({ avatarUrl: 'https://evil.com/x.jpg' }, PROJECT).avatarUrl).toBeNull();
  });

  it('aceita banner_image_url só de buckets públicos do projeto', () => {
    expect(isAllowedBannerUrl(BANNER, PROJECT)).toBe(true);
    expect(isAllowedBannerUrl(`${PROJECT}/storage/v1/object/public/brand-assets/u/b.jpg`, PROJECT)).toBe(true);
    expect(isAllowedBannerUrl('https://evil.com/x.jpg', PROJECT)).toBe(false);
    expect(sanitizeProfile({ bannerImageUrl: 'https://evil.com/x.jpg' }, PROJECT).bannerImageUrl).toBeNull();
    expect(sanitizeProfile({ bannerImageUrl: BANNER }, PROJECT).bannerImageUrl).toBe(BANNER);
  });

  it('cor só no formato #RRGGBB', () => {
    expect(sanitizeProfile({ themeColor: '#7C3AED' }, PROJECT).themeColor).toBe('#7C3AED');
    expect(sanitizeProfile({ themeColor: 'red;}</style><script>' }, PROJECT).themeColor).toBe('#1E40AF');
    expect(sanitizeProfile({ themeColor: '#fff' }, PROJECT).themeColor).toBe('#1E40AF');
  });
});

describe('renderProfilePage', () => {
  const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>';

  it('não deixa passar HTML vindo de nome, bio, título ou URL', () => {
    const data = sanitizeProfile(
      {
        displayName: evil,
        bio: `</p>${evil}`,
        avatarUrl: `${AVATAR}"onerror="alert(3)`,
        themeColor: '#15803D',
        links: [{ title: evil, url: `https://exemplo.com/?q="><script>alert(4)</script>`, icon: 'site' }],
      },
      PROJECT,
    );
    const html = renderProfilePage(data);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;alert(4)&lt;/script&gt;');
    expect(html).not.toMatch(/<script>[^<]*alert\(4\)/i);
    expect(html).not.toMatch(/<img src=x/i);
    expect(html).not.toMatch(/\sonerror=/i);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('liquid-glass');
    expect(html).toContain('id="glass-distortion"');
  });

  it('monta a página com título, idioma, CSP, grade e rodapé', () => {
    const html = renderProfilePage(
      sanitizeProfile(
        {
          displayName: 'Ana & Cia',
          bio: 'Doces',
          themeColor: '#BE185D',
          links: [
            { title: 'WhatsApp', subtitle: 'Fale comigo', url: 'https://wa.me/5511999998888', icon: 'whatsapp' },
            { title: 'Instagram', url: 'https://instagram.com/ana', icon: 'instagram' },
          ],
        },
        PROJECT,
      ),
    );
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('<title>Ana &amp; Cia — Tréville Aproxima</title>');
    expect(html).toContain('property="og:title" content="Ana &amp; Cia — Tréville Aproxima"');
    expect(html).toContain('name="description" content="Doces"');
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).not.toContain('noindex');
    expect(html).toContain(PROFILE_PAGE_CSP);
    expect(html).toContain('Feito com <span>Tréville Aproxima</span>');
    expect(html).toContain('href="https://wa.me/5511999998888"');
    expect(html).toContain('class="button-wrap"');
    expect(html).toContain('class="cta-button"');
    expect(html).toContain('>PAGINA</span>');
    expect(html).toContain('class="button-shadow"');
    expect(html).toContain('#2F5FE0');
    expect(html).toContain('#4A7FFF');
    expect(html).toContain('dottedGrid');
    expect(html).toContain('class="grid"');
    expect(html).toContain('class="link-card liquid-glass"');
    expect(html).toContain('class="brand-card liquid-glass"');
    expect(html).not.toContain('class="brand-card liquid-glass has-banner"');
    expect(html).toContain('class="banner-decor"');
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toContain('class="waves"');
    expect(html).toContain('icon-circle');
    expect(html).toContain('icon-whatsapp');
    expect(html).toContain('icon-instagram');
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
    expect(html).toContain('liquid-glass');
    expect(html).toContain('id="glass-distortion"');
    expect(html).toContain('#4A90E2');
    expect(html).toContain('#25D366');
    expect(html).toContain('Fale comigo');
    expect(html).toContain('class="link-desc"');
    expect(html).toContain('opacity:.88');
    expect(html.match(/class="link-desc"/g)?.length).toBe(1);
    expect(html).toContain('prefers-color-scheme:light');
    expect(html).toContain('#BE185D');
    expect(html).toContain('--border:#BE185D99');
    expect(html).toContain('--accent:#BE185D');
    expect(html).toContain('--accent-glow:#BE185D55');
    expect(html).toContain('border:1.5px solid var(--border');
    expect(html).toContain('box-shadow:var(--shadow)');
    expect(html).toContain('class="avatar initial"');
    expect(html).toContain('--page:linear-gradient');
    expect(html).toContain('--card:#12253F');
    expect(html).not.toContain('target="_blank"');
  });

  it('no preview do app os links abrem fora e sem links mostra aviso', () => {
    expect(renderProfilePage(sanitizeProfile({ displayName: 'A', links: [{ title: 'S', url: 'https://s.com', icon: 'site' }] }, PROJECT), { preview: true })).toContain('target="_blank"');
    expect(renderProfilePage(sanitizeProfile({ displayName: 'A' }, PROJECT))).toContain('Nenhum link por aqui ainda.');
  });

  it('usa a foto quando é do bucket do projeto', () => {
    const html = renderProfilePage(sanitizeProfile({ displayName: 'A', avatarUrl: AVATAR }, PROJECT));
    expect(html).toContain(`<img class="avatar" src="${AVATAR.replace(/=/g, '&#61;')}"`);
  });

  it('aplica banner de fundo quando bannerImageUrl é válido', () => {
    const html = renderProfilePage(
      sanitizeProfile({ displayName: 'A', bannerImageUrl: BANNER, links: [{ title: 'S', url: 'https://s.com', icon: 'site' }] }, PROJECT),
    );
    expect(html).toContain('class="brand-card liquid-glass has-banner"');
    expect(html).toContain('--banner-image:url(');
    expect(html).toContain('class="banner-decor"');
    expect(html).not.toContain('class="waves"');
  });

  it('logo só abre modal de sobre quando about está preenchido', () => {
    const without = renderProfilePage(sanitizeProfile({ displayName: 'Ana', bio: 'Curta' }, PROJECT));
    expect(without).not.toContain('data-about-open');
    expect(without).not.toContain('id="about-overlay"');
    expect(without).toContain('class="bio"');

    const withAbout = sanitizeProfile(
      { displayName: 'Ana', bio: 'Curta', about: 'Texto longo do negócio. <b>xss</b>' },
      PROJECT,
    );
    expect(withAbout.about).toContain('Texto longo');
    const html = renderProfilePage(withAbout);
    expect(html).toContain('data-about-open');
    expect(html).toContain('id="about-overlay"');
    expect(html).toContain('class="about-sheet liquid-glass"');
    expect(html).toContain('Texto longo do negócio.');
    expect(html).toContain('&lt;b&gt;xss&lt;/b&gt;');
    expect(html).not.toContain('<b>xss</b>');
    expect(html).toContain('data-about-close');
  });

  it('CTA PAGINA prefere WhatsApp e escapa subtítulo', () => {
    const data = sanitizeProfile(
      {
        displayName: 'X',
        links: [
          { title: 'Site', url: 'https://exemplo.com', icon: 'site' },
          { title: 'Zap', subtitle: '<b>oi</b>', url: 'https://wa.me/5511999998888', icon: 'whatsapp' },
        ],
      },
      PROJECT,
    );
    expect(pickProfilePrimaryCta(data.links)?.icon).toBe('whatsapp');
    const html = renderProfilePage(data);
    expect(html).toContain('&lt;b&gt;oi&lt;/b&gt;');
    expect(html.indexOf('class="button-wrap"')).toBeLessThan(html.indexOf('class="grid"'));
    expect(html).toContain('href="https://wa.me/5511999998888"');
  });
});

describe('checkWebhookUrl (SSRF)', () => {
  it.each(['https://hooks.exemplo.com/scan', 'https://exemplo.com:443/x', 'https://8.8.8.8/hook', 'https://[2001:4860:4860::8888]/hook'])('aceita %p', (url) => {
    expect(checkWebhookUrl(url).ok).toBe(true);
  });

  it.each([
    'http://exemplo.com/hook',
    'ftp://exemplo.com',
    'javascript:alert(1)',
    'https://localhost/hook',
    'https://api.localhost/hook',
    'https://127.0.0.1/hook',
    'https://2130706433/hook',
    'https://0x7f.0.0.1/hook',
    'https://10.0.0.5/hook',
    'https://172.16.0.1/hook',
    'https://172.31.255.255/hook',
    'https://192.168.1.10/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://0.0.0.0/hook',
    'https://100.64.0.1/hook',
    'https://[::1]/hook',
    'https://[::]/hook',
    'https://[fc00::1]/hook',
    'https://[fd12:3456::1]/hook',
    'https://[fe80::1]/hook',
    'https://[::ffff:127.0.0.1]/hook',
    'https://[::ffff:10.0.0.1]/hook',
    'https://servidor.internal/hook',
    'https://impressora.local/hook',
    'https://metadata.google.internal/computeMetadata',
    'https://fyavoukktjysxtmtkspd.supabase.co/functions/v1/redirect/ABC',
    'https://user:pass@exemplo.com/hook',
    'https://exemplo.com:8080/hook',
    'https://intranet/hook',
    '',
  ])('recusa %p', (url) => {
    expect(checkWebhookUrl(url).ok).toBe(false);
  });

  it('não aceita 172.32 como privado (fora de 172.16/12)', () => {
    expect(checkWebhookUrl('https://172.32.0.1/hook').ok).toBe(true);
  });
});

describe('links do perfil', () => {
  it('normaliza conforme o atalho', () => {
    expect(normalizeLinkUrl('whatsapp', '(11) 99999-8888')).toBe('https://wa.me/5511999998888');
    expect(normalizeLinkUrl('phone', '11 3333-4444')).toBe('tel:+551133334444');
    expect(normalizeLinkUrl('email', 'ana@exemplo.com')).toBe('mailto:ana@exemplo.com');
    expect(normalizeLinkUrl('instagram', '@treville')).toBe('https://instagram.com/treville');
    expect(normalizeLinkUrl('tiktok', '@treville')).toBe('https://www.tiktok.com/@treville');
    expect(normalizeLinkUrl('site', 'treville.com.br')).toBe('https://treville.com.br');
    expect(normalizeLinkUrl('location', 'Av. Paulista, 1000')).toBe('https://www.google.com/maps/search/?api=1&query=Av.%20Paulista%2C%201000');
    expect(normalizeLinkUrl('link', 'javascript:alert(1)')).toBe('javascript:alert(1)');
  });

  it('valida a lista e aponta o item com erro', () => {
    const base: ProfileLink = { id: null, title: 'Site', subtitle: '', url: 'treville.com.br', icon: 'site', is_active: true };
    const ok = validateProfileLinks([base, { ...base, id: 'a', title: '  Zap ', subtitle: '  Fale  ', url: '11999998888', icon: 'whatsapp' }]);
    expect(ok).toEqual({
      ok: true,
      links: [
        { id: null, title: 'Site', subtitle: '', url: 'https://treville.com.br', icon: 'site', is_active: true },
        { id: 'a', title: 'Zap', subtitle: 'Fale', url: 'https://wa.me/5511999998888', icon: 'whatsapp', is_active: true },
      ],
    });
    expect(validateProfileLinks([base, { ...base, url: 'javascript:alert(1)' }])).toMatchObject({ ok: false, index: 1 });
    expect(validateProfileLinks([{ ...base, title: ' ' }])).toMatchObject({ ok: false, index: 0 });
    expect(validateProfileLinks([{ ...base, subtitle: 'x'.repeat(121) }])).toMatchObject({ ok: false, index: 0 });
  });

  it('move itens sem perder nenhum', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('valida o formulário do perfil', () => {
    expect(validateProfileForm({ displayName: ' Ana ', bio: '', themeColor: '#15803D' })).toEqual({
      ok: true,
      value: { display_name: 'Ana', bio: null, about: null, theme_color: '#15803D' },
    });
    expect(validateProfileForm({ displayName: 'x'.repeat(61), bio: '', themeColor: '#15803D' }).ok).toBe(false);
    expect(validateProfileForm({ displayName: 'A', bio: 'x'.repeat(121), themeColor: '#15803D' }).ok).toBe(false);
    expect(validateProfileForm({ displayName: 'A', bio: '', about: 'x'.repeat(801), themeColor: '#15803D' }).ok).toBe(false);
    expect(validateProfileForm({ displayName: 'A', bio: '', themeColor: 'blue' }).ok).toBe(false);
  });
});
