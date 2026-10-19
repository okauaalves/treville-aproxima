// Página pública da marca no EAS Hosting (API route). Lê JSON da função brand-page / redirect.
import {
  BRAND_PAGE_CSP,
  renderBrandPage,
  sanitizeBrandPage,
  type BrandPageData,
} from '@/supabase/functions/_shared/brandPageRenderer';
import { STATUS_HEADERS, renderStatusPage, STATUS_PAGES, type StatusKind } from '@/supabase/functions/_shared/statusPage';
import { TtlCache } from '@/supabase/functions/_shared/ttlCache';

export const BRAND_KEY_PLAQUINHA = /^[A-Z0-9]{4,8}$/;
export const BRAND_KEY_SLUG = /^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])?$/;
export const BRAND_CACHE_TTL_MS = 10_000;
export const BRAND_CACHE_MAX = 200;
const FETCH_TIMEOUT_MS = 5_000;

const BRAND_HEADERS: Record<string, string> = {
  ...STATUS_HEADERS,
  'Content-Security-Policy': `${BRAND_PAGE_CSP}; frame-ancestors 'none'`,
};

function statusResponse(kind: StatusKind): Response {
  return new Response(renderStatusPage(kind), { status: STATUS_PAGES[kind].status, headers: STATUS_HEADERS });
}

export function brandFunctionBase(supabaseUrl: string | null | undefined): string | null {
  const value = (supabaseUrl ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9]{10,}\.supabase\.co$/.test(value) ? `${value}/functions/v1/brand-page` : null;
}

export function redirectFunctionBase(supabaseUrl: string | null | undefined): string | null {
  const value = (supabaseUrl ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9]{10,}\.supabase\.co$/.test(value) ? `${value}/functions/v1/redirect` : null;
}

const ERROR_KINDS: Record<number, StatusKind> = { 400: 'invalid', 404: 'not_found', 410: 'inactive' };

interface BrandJson {
  type?: string;
  brand?: Record<string, unknown>;
  links?: unknown[];
}

function toPageData(json: BrandJson, projectUrl: string | null | undefined): BrandPageData | null {
  if (!json.brand || typeof json.brand !== 'object') {
    return null;
  }
  const brand = json.brand as Record<string, unknown>;
  return sanitizeBrandPage(
    {
      brand_name: typeof brand.brand_name === 'string' ? brand.brand_name : null,
      tagline: typeof brand.tagline === 'string' ? brand.tagline : null,
      about: typeof brand.about === 'string' ? brand.about : null,
      logo_url: typeof brand.logo_url === 'string' ? brand.logo_url : null,
      banner_image_url: typeof brand.banner_image_url === 'string' ? brand.banner_image_url : null,
      theme_mode: typeof brand.theme_mode === 'string' ? brand.theme_mode : null,
      primary_color: typeof brand.primary_color === 'string' ? brand.primary_color : null,
      secondary_color: typeof brand.secondary_color === 'string' ? brand.secondary_color : null,
      accent_color: typeof brand.accent_color === 'string' ? brand.accent_color : null,
      background_color: typeof brand.background_color === 'string' ? brand.background_color : null,
      text_color: typeof brand.text_color === 'string' ? brand.text_color : null,
      border_color: typeof brand.border_color === 'string' ? brand.border_color : null,
      links: Array.isArray(json.links) ? (json.links as never[]) : [],
    },
    projectUrl,
  );
}

export function createBrandPageHandler(deps: {
  fetch: typeof fetch;
  supabaseUrl: string | null | undefined;
  now?: () => number;
  cache?: TtlCache<string>;
}) {
  const cache = deps.cache ?? new TtlCache<string>(BRAND_CACHE_TTL_MS, BRAND_CACHE_MAX);
  const now = deps.now ?? Date.now;
  const brandBase = brandFunctionBase(deps.supabaseUrl);
  const redirectBase = redirectFunctionBase(deps.supabaseUrl);

  return async function handle(rawKey: string, request?: Request): Promise<Response> {
    const key = String(rawKey ?? '');
    if (!BRAND_KEY_PLAQUINHA.test(key) && !BRAND_KEY_SLUG.test(key)) {
      return statusResponse('invalid');
    }
    const cached = cache.get(key, now());
    if (cached) {
      return new Response(cached, { status: 200, headers: BRAND_HEADERS });
    }
    if (!brandBase && !redirectBase) {
      return statusResponse('unavailable');
    }

    const urls = [
      brandBase ? `${brandBase}/${encodeURIComponent(key)}?format=json` : null,
      BRAND_KEY_PLAQUINHA.test(key) && redirectBase ? `${redirectBase}/${encodeURIComponent(key)}?format=json` : null,
    ].filter(Boolean) as string[];

    let json: BrandJson | null = null;
    let lastStatus = 503;
    for (const url of urls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await deps.fetch(url, {
          headers: { Accept: 'application/json' },
          redirect: 'manual',
          signal: controller.signal,
        });
        lastStatus = response.status;
        if (response.status !== 200) {
          continue;
        }
        const body = (await response.json().catch(() => null)) as BrandJson | null;
        if (body?.type === 'brand' || body?.brand) {
          json = body;
          break;
        }
      } catch {
        // tenta a próxima fonte
      } finally {
        clearTimeout(timer);
      }
    }

    if (!json) {
      return statusResponse(ERROR_KINDS[lastStatus] ?? 'unavailable');
    }

    const page = toPageData(json, deps.supabaseUrl);
    if (!page) {
      return statusResponse('unavailable');
    }
    let pageUrl: string | null = null;
    if (request) {
      try {
        const origin = new URL(request.url).origin;
        pageUrl = BRAND_KEY_PLAQUINHA.test(key)
          ? `${origin}/t/${encodeURIComponent(key)}`
          : `${origin}/b/${encodeURIComponent(key)}`;
      } catch {
        pageUrl = null;
      }
    }
    const html = renderBrandPage(page, { pageUrl });
    cache.set(key, html, now());
    return new Response(html, { status: 200, headers: BRAND_HEADERS });
  };
}
