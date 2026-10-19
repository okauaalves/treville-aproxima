// Origem pública do app no EAS Hosting (perfil /p, Minha Página /b, link curto /t).
// Secrets: PROFILE_PAGE_URL (…/p), SHORT_LINK_BASE (origem ou …/t). Domínios legados são ignorados.

export const DEFAULT_SHORT_LINK_BASE = 'https://nfc-manager.expo.app';
export const DEFAULT_PROFILE_PAGE_BASE = `${DEFAULT_SHORT_LINK_BASE}/p`;

/** Contas Expo antigas — nunca usar como destino público. */
const LEGACY_EXPO_HOST = /^treville-aproxima(--[a-z0-9-]+)?\.expo\.app$/i;

function envGet(key: string): string | undefined {
  const deno = (globalThis as { Deno?: { env: { get: (name: string) => string | undefined } } }).Deno;
  return deno?.env.get(key) ?? (typeof process !== 'undefined' ? process.env[key] : undefined);
}

function normalizeHttpsBase(value: string | null | undefined): string | null {
  const base = (value ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^/\s]+/.test(base) ? base : null;
}

function isLegacyPublicHost(url: string): boolean {
  try {
    return LEGACY_EXPO_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function acceptPublicBase(value: string | null | undefined): string | null {
  const base = normalizeHttpsBase(value);
  if (!base || isLegacyPublicHost(base)) {
    return null;
  }
  return base;
}

/** Origem https do link curto (sem /t). */
export function resolveShortLinkBaseFromEnv(): string {
  const direct = acceptPublicBase(envGet('SHORT_LINK_BASE'));
  if (direct) {
    return direct.replace(/\/t$/i, '').replace(/\/p$/i, '');
  }
  const profile = acceptPublicBase(envGet('PROFILE_PAGE_URL'));
  if (profile) {
    return profile.replace(/\/p$/i, '');
  }
  return DEFAULT_SHORT_LINK_BASE;
}

/** Base do perfil público: `https://<host>/p`. */
export function resolveProfilePageBaseFromEnv(): string {
  const profile = acceptPublicBase(envGet('PROFILE_PAGE_URL'));
  if (profile) {
    return profile.replace(/\/p$/i, '') + '/p';
  }
  return `${resolveShortLinkBaseFromEnv()}/p`;
}

/** Host EAS sem sufixo /p ou /b (irmãos /p, /b, /t). */
export function resolveHostingOriginFromEnv(): string {
  const brand = acceptPublicBase(envGet('BRAND_PAGE_URL'));
  if (brand) {
    return brand.replace(/\/b$/i, '');
  }
  return resolveProfilePageBaseFromEnv().replace(/\/p$/i, '');
}

/** URL curta exibida na Minha Página (chrome) e scans NFC/QR no domínio do app. */
export function publicShortLinkUrl(plaquinhaId: string): string {
  const origin = resolveShortLinkBaseFromEnv();
  return `${origin}/t/${encodeURIComponent(plaquinhaId)}`;
}
