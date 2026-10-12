// Página pública de perfil servida pelo EAS Hosting (API route, sem JS no cliente).
// Lê `?format=json` da função redirect — que não conta scan nem expõe dados privados — e renderiza
// com o mesmo renderer da Edge Function. O scan já foi contado na função antes do 302 para cá.
import { renderProfilePage, sanitizeProfile } from '@/supabase/functions/_shared/profilePage';
import { renderStatusPage, STATUS_HEADERS, STATUS_PAGES, type StatusKind } from '@/supabase/functions/_shared/statusPage';
import { TtlCache } from '@/supabase/functions/_shared/ttlCache';

export const LINK_ID_PATTERN = /^[A-Z0-9]{4,8}$/;
export const PROFILE_CACHE_TTL_MS = 10_000;
export const PROFILE_CACHE_MAX = 200;
const FETCH_TIMEOUT_MS = 5_000;

export function statusResponse(kind: StatusKind): Response {
  return new Response(renderStatusPage(kind), { status: STATUS_PAGES[kind].status, headers: STATUS_HEADERS });
}

/** Base da função redirect a partir da URL do projeto; nada fora de *.supabase.co. */
export function redirectFunctionBase(supabaseUrl: string | null | undefined): string | null {
  const value = (supabaseUrl ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9]{10,}\.supabase\.co$/.test(value) ? `${value}/functions/v1/redirect` : null;
}

interface PublicProfileJson {
  name?: string;
  bio?: string;
  avatarUrl?: string | null;
  themeColor?: string;
  links?: { title?: string; url?: string; icon?: string }[];
}

const ERROR_KINDS: Record<number, StatusKind> = { 400: 'invalid', 404: 'not_found', 410: 'inactive' };

export function createProfileHandler(deps: { fetch: typeof fetch; supabaseUrl: string | null | undefined; now?: () => number; cache?: TtlCache<string> }) {
  const cache = deps.cache ?? new TtlCache<string>(PROFILE_CACHE_TTL_MS, PROFILE_CACHE_MAX);
  const now = deps.now ?? Date.now;
  const base = redirectFunctionBase(deps.supabaseUrl);

  return async function handle(rawId: string): Promise<Response> {
    const id = String(rawId ?? '');
    if (!LINK_ID_PATTERN.test(id)) {
      return statusResponse('invalid');
    }
    const cached = cache.get(id, now());
    if (cached) {
      return new Response(cached, { status: 200, headers: STATUS_HEADERS });
    }
    if (!base) {
      return statusResponse('unavailable');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await deps.fetch(`${base}/${encodeURIComponent(id)}?format=json`, {
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch {
      return statusResponse('unavailable');
    } finally {
      clearTimeout(timer);
    }

    if (response.status !== 200) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 404 && body?.error === 'profile_disabled') {
        return statusResponse('profile_off');
      }
      return statusResponse(ERROR_KINDS[response.status] ?? 'unavailable');
    }

    const data = (await response.json().catch(() => null)) as PublicProfileJson | null;
    if (!data || typeof data !== 'object') {
      return statusResponse('unavailable');
    }
    const profile = sanitizeProfile(
      {
        displayName: data.name,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
        themeColor: data.themeColor,
        links: Array.isArray(data.links) ? data.links : [],
      },
      deps.supabaseUrl,
    );
    const html = renderProfilePage(profile);
    cache.set(id, html, now());
    return new Response(html, { status: 200, headers: STATUS_HEADERS });
  };
}
