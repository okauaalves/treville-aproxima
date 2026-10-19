// Página pública da marca (Minha Página). Deploy com verify_jwt = false.
// Aceita plaquinha_id (4–8 alfanumérico) ou custom_slug no path.
// Em *.supabase.co, GET text/html vira text/plain — use ?format=json + host EAS, ou domínio próprio.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { sanitizeBrandPage, type BrandPageData, type RawBrandLinkInput } from '../_shared/brandPageRenderer.ts';
import { resolveHostingOriginFromEnv } from '../_shared/hostingUrl.ts';
import { TtlCache } from '../_shared/ttlCache.ts';

const PLAQUINHA_ID = /^[A-Z0-9]{4,8}$/;
const CUSTOM_SLUG = /^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])?$/;
const CACHE = new TtlCache<BrandPageData>(10_000, 500);

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

/** Origem do host EAS (sem `/p`). Aceita PROFILE_PAGE_URL, SHORT_LINK_BASE ou BRAND_PAGE_URL. */
function hostingOrigin(): string {
  return resolveHostingOriginFromEnv();
}

interface BrandPageRow {
  id: string;
  brand_name: string | null;
  tagline: string | null;
  about: string | null;
  logo_url: string | null;
  banner_image_url: string | null;
  theme_mode: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  border_color: string | null;
  plaquinha_id: string | null;
  custom_slug: string | null;
  is_published: boolean;
}

async function loadPublishedPage(supabase: SupabaseClient, key: string): Promise<{ data: BrandPageData | null; failed: boolean; cacheKey: string }> {
  const byPlaquinha = PLAQUINHA_ID.test(key);
  const bySlug = !byPlaquinha && CUSTOM_SLUG.test(key);
  if (!byPlaquinha && !bySlug) {
    return { data: null, failed: false, cacheKey: key };
  }

  const cacheKey = byPlaquinha ? `p:${key}` : `s:${key}`;
  const cached = CACHE.get(cacheKey);
  if (cached) {
    return { data: cached, failed: false, cacheKey };
  }

  const brandSelectWithAbout =
    'id, brand_name, tagline, about, logo_url, banner_image_url, theme_mode, primary_color, secondary_color, accent_color, background_color, text_color, border_color, plaquinha_id, custom_slug, is_published';
  const brandSelectWithBanner =
    'id, brand_name, tagline, logo_url, banner_image_url, theme_mode, primary_color, secondary_color, accent_color, background_color, text_color, border_color, plaquinha_id, custom_slug, is_published';
  const brandSelectFallback =
    'id, brand_name, tagline, logo_url, theme_mode, primary_color, secondary_color, accent_color, background_color, text_color, border_color, plaquinha_id, custom_slug, is_published';

  const runQuery = (cols: string) => {
    let q = supabase.from('brand_pages').select(cols).eq('is_published', true);
    q = byPlaquinha ? q.eq('plaquinha_id', key) : q.eq('custom_slug', key);
    return q.maybeSingle();
  };

  let { data: page, error } = await runQuery(brandSelectWithAbout);
  if (error && /about/i.test(error.message ?? '')) {
    ({ data: page, error } = await runQuery(brandSelectWithBanner));
  }
  if (error && /banner_image_url/i.test(error.message ?? '')) {
    ({ data: page, error } = await runQuery(brandSelectFallback));
  }
  if (error) {
    return { data: null, failed: true, cacheKey };
  }
  if (!page || !(page as BrandPageRow).is_published) {
    return { data: null, failed: false, cacheKey };
  }

  const row = page as BrandPageRow;
  const { data: links, error: linksError } = await supabase
    .from('brand_links')
    .select('link_type, label, description, destination_url, position, is_active')
    .eq('brand_page_id', row.id)
    .eq('is_active', true)
    .order('position', { ascending: true })
    .limit(24);

  if (linksError) {
    return { data: null, failed: true, cacheKey };
  }

  const data = sanitizeBrandPage(
    {
      brand_name: row.brand_name,
      tagline: row.tagline,
      about: row.about ?? null,
      logo_url: row.logo_url,
      banner_image_url: row.banner_image_url ?? null,
      theme_mode: row.theme_mode,
      primary_color: row.primary_color,
      secondary_color: row.secondary_color,
      accent_color: row.accent_color,
      background_color: row.background_color,
      text_color: row.text_color,
      border_color: row.border_color,
      links: (links ?? []) as RawBrandLinkInput[],
    },
    Deno.env.get('SUPABASE_URL'),
  );
  CACHE.set(cacheKey, data);
  return { data, failed: false, cacheKey };
}

Deno.serve(async (request) => {
  const requestUrl = new URL(request.url);
  const pathParts = requestUrl.pathname.split('/').filter(Boolean);
  const key = pathParts[pathParts.length - 1] ?? '';
  const wantsJson = requestUrl.searchParams.get('format') === 'json';

  if (!key || key === 'brand-page') {
    return json(400, { error: 'missing_key' });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return wantsJson ? json(405, { error: 'method_not_allowed' }) : new Response('Método não permitido.\n', { status: 405, headers: { ...SECURITY_HEADERS, Allow: 'GET, HEAD' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, failed } = await loadPublishedPage(supabase, key);
  if (failed) {
    return wantsJson ? json(503, { error: 'unavailable' }) : new Response('Indisponível.\n', { status: 503, headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  if (!data) {
    return wantsJson ? json(404, { error: 'not_found' }) : new Response('Página não encontrada.\n', { status: 404, headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  if (wantsJson) {
    return json(200, { type: 'brand', brand: data.brand, links: data.links });
  }

  const origin = hostingOrigin();
  return new Response(null, {
    status: 302,
    headers: { ...SECURITY_HEADERS, Location: `${origin}/b/${encodeURIComponent(key)}` },
  });
});
