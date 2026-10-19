import {
  DEFAULT_PROFILE_PAGE_BASE,
  DEFAULT_SHORT_LINK_BASE,
  publicShortLinkUrl,
  resolveHostingOriginFromEnv,
  resolveProfilePageBaseFromEnv,
  resolveShortLinkBaseFromEnv,
} from '@/supabase/functions/_shared/hostingUrl';

describe('hostingUrl (Edge Functions)', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.PROFILE_PAGE_URL;
    delete process.env.SHORT_LINK_BASE;
    delete process.env.BRAND_PAGE_URL;
  });

  afterAll(() => {
    process.env = env;
  });

  it('fallback de produção quando secrets ausentes', () => {
    expect(resolveShortLinkBaseFromEnv()).toBe(DEFAULT_SHORT_LINK_BASE);
    expect(resolveProfilePageBaseFromEnv()).toBe(DEFAULT_PROFILE_PAGE_BASE);
    expect(resolveHostingOriginFromEnv()).toBe(DEFAULT_SHORT_LINK_BASE);
    expect(publicShortLinkUrl('K7M2QX')).toBe('https://nfc-manager.expo.app/t/K7M2QX');
  });

  it('ignora domínio Expo legado treville-aproxima', () => {
    process.env.PROFILE_PAGE_URL = 'https://treville-aproxima--tt3beilbk6.expo.app/perfil/links';
    expect(resolveProfilePageBaseFromEnv()).toBe(DEFAULT_PROFILE_PAGE_BASE);
  });

  it('PROFILE_PAGE_URL válido termina em /p', () => {
    process.env.PROFILE_PAGE_URL = 'https://nfc-manager.expo.app/p';
    expect(resolveProfilePageBaseFromEnv()).toBe('https://nfc-manager.expo.app/p');
  });

  it('SHORT_LINK_BASE alimenta perfil /p', () => {
    process.env.SHORT_LINK_BASE = 'https://custom.expo.app/t';
    expect(resolveProfilePageBaseFromEnv()).toBe('https://custom.expo.app/p');
  });
});
