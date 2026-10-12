// Mini página de perfil: função pura usada pela Edge Function `redirect` e pelo preview do app.
// Todo texto e atributo passa por escapeHtml; URLs passam pela regra de destino.
import { checkDestinationUrl } from './destination.ts';

export const PROFILE_COLORS = ['#1E40AF', '#3B82F6', '#15803D', '#7C3AED', '#DC2626', '#0F172A', '#B45309', '#BE185D'] as const;
export const DEFAULT_THEME_COLOR = '#1E40AF';
export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 120;
export const LINK_TITLE_MAX = 60;
export const PROFILE_LINKS_MAX = 50;

export const PROFILE_ICONS = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'linkedin', 'site', 'phone', 'email', 'menu', 'location', 'link'] as const;
export type ProfileIcon = (typeof PROFILE_ICONS)[number];

export interface ProfilePageLink {
  title: string;
  url: string;
  icon: ProfileIcon;
}

export interface ProfilePageData {
  name: string;
  bio: string;
  avatarUrl: string | null;
  themeColor: string;
  links: ProfilePageLink[];
}

export interface RawProfileInput {
  displayName?: string | null;
  fallbackName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  themeColor?: string | null;
  links?: { title?: string | null; url?: string | null; icon?: string | null; is_active?: boolean | null }[] | null;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`=]/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function isSafeColor(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function isProfileIcon(value: string | null | undefined): value is ProfileIcon {
  return typeof value === 'string' && (PROFILE_ICONS as readonly string[]).includes(value);
}

/** Avatar só do bucket público `avatars` do próprio projeto, via https. */
export function isAllowedAvatarUrl(url: string | null | undefined, projectUrl: string | null | undefined): boolean {
  if (!url || !projectUrl) {
    return false;
  }
  try {
    const avatar = new URL(url);
    const project = new URL(projectUrl);
    return avatar.protocol === 'https:' && avatar.host === project.host && !avatar.username && avatar.pathname.startsWith('/storage/v1/object/public/avatars/');
  } catch {
    return false;
  }
}

function clean(value: string | null | undefined, max: number): string {
  return (value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

/** Normaliza dados vindos do banco: limita tamanhos, descarta links inativos ou inválidos. */
export function sanitizeProfile(input: RawProfileInput, projectUrl: string | null | undefined): ProfilePageData {
  const name = clean(input.displayName, DISPLAY_NAME_MAX) || clean(input.fallbackName, DISPLAY_NAME_MAX) || 'Perfil';
  const links: ProfilePageLink[] = [];
  for (const link of input.links ?? []) {
    if (link.is_active === false || links.length >= PROFILE_LINKS_MAX) {
      continue;
    }
    const title = clean(link.title, LINK_TITLE_MAX);
    const check = checkDestinationUrl(link.url);
    if (!title || !check.ok) {
      continue;
    }
    links.push({ title, url: check.url, icon: isProfileIcon(link.icon) ? link.icon : 'link' });
  }
  return {
    name,
    bio: clean(input.bio, BIO_MAX),
    avatarUrl: isAllowedAvatarUrl(input.avatarUrl, projectUrl) ? (input.avatarUrl as string) : null,
    themeColor: isSafeColor(input.themeColor) ? input.themeColor : DEFAULT_THEME_COLOR,
    links,
  };
}

const ICON_PATHS: Record<ProfileIcon, string> = {
  whatsapp: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  instagram: '<rect width="20" height="20" x="2" y="2" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/>',
  tiktok: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
  site: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  email: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  menu: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  location: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};

export const PROFILE_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** `preview`: links abrem fora (target _blank) para o iframe/WebView do app. */
export function renderProfilePage(data: ProfilePageData, options: { preview?: boolean } = {}): string {
  const color = isSafeColor(data.themeColor) ? data.themeColor : DEFAULT_THEME_COLOR;
  const accent = luminance(color) < 0.3 ? '#93C5FD' : color;
  const name = escapeHtml(data.name);
  const initial = escapeHtml(Array.from(data.name.trim())[0]?.toUpperCase() ?? 'T');
  const target = options.preview ? ' target="_blank"' : '';
  const avatar = data.avatarUrl
    ? `<img class="avatar" src="${escapeHtml(data.avatarUrl)}" alt="" width="96" height="96" referrerpolicy="no-referrer">`
    : `<div class="avatar initial" aria-hidden="true">${initial}</div>`;
  const links = data.links
    .map(
      (link) =>
        `<a class="link" href="${escapeHtml(link.url)}" rel="noopener noreferrer"${target}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[link.icon] ?? ICON_PATHS.link}</svg><span>${escapeHtml(link.title)}</span></a>`,
    )
    .join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${PROFILE_PAGE_CSP}">
<meta name="referrer" content="no-referrer">
<title>${name} — Tréville Aproxima</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#0F172A 0%,#1E3A8A 50%,#0F172A 100%);color:#F8FAFC}
.card{width:100%;max-width:420px;padding:32px 24px 24px;border-radius:28px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);box-shadow:0 20px 60px rgba(2,6,23,.45);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);text-align:center}
.avatar{width:96px;height:96px;border-radius:50%;border:3px solid ${color};object-fit:cover;display:block;margin:0 auto 16px;background:#1E293B}
.initial{display:flex;align-items:center;justify-content:center;background:${color};font-size:40px;font-weight:800;color:#fff;border-color:rgba(255,255,255,.35)}
h1{margin:0;font-size:24px;font-weight:700;line-height:1.25;word-wrap:break-word}
.bio{margin:8px 0 0;font-size:14px;line-height:1.5;color:#CBD5E1;white-space:pre-line;word-wrap:break-word}
.links{display:flex;flex-direction:column;gap:12px;margin-top:24px}
.link{display:flex;align-items:center;gap:12px;min-height:52px;padding:14px 16px;border-radius:14px;background:${color};border:1px solid rgba(255,255,255,.18);color:#fff;font-size:16px;font-weight:600;text-decoration:none;transition:transform .12s ease}
.link:active{transform:scale(.97)}
.link svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.link span{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{margin-top:24px;font-size:14px;color:#94A3B8}
footer{margin-top:28px;font-size:12px;color:#94A3B8}
footer span{color:${accent};font-weight:700}
</style>
</head>
<body>
<main class="card">
${avatar}
<h1>${name}</h1>
${data.bio ? `<p class="bio">${escapeHtml(data.bio)}</p>` : ''}
${links ? `<nav class="links">${links}</nav>` : '<p class="empty">Nenhum link por aqui ainda.</p>'}
<footer>Feito com <span>Tréville Aproxima</span></footer>
</main>
</body>
</html>`;
}
