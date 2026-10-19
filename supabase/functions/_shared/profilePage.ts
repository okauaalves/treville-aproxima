// Mini página de perfil: função pura usada pela Edge Function `redirect` e pelo preview do app.
// Todo texto e atributo passa por escapeHtml; URLs passam pela regra de destino.
import { bannerDecorationCss, bannerDecorationMarkup } from './bannerDecoration.ts';
import { checkDestinationUrl } from './destination.ts';
import {
  GENERIC_ICON_BLUE,
  INSTAGRAM_GRADIENT,
  WHATSAPP_GREEN,
  aboutModalCss,
  aboutModalScript,
  glassFilterSvg,
  interactiveCtaCss,
  liquidGlassCss,
  liquidGlassNavScript,
  renderAboutModal,
  renderInteractiveCta,
  wrapLinkIcon,
} from './liquidGlass.ts';
import { renderSeoMetaTags } from './seoMeta.ts';

export const PROFILE_COLORS = ['#1E40AF', '#3B82F6', '#15803D', '#7C3AED', '#DC2626', '#0F172A', '#B45309', '#BE185D'] as const;
export const DEFAULT_THEME_COLOR = '#1E40AF';
export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 120;
/** Descrição longa no modal do logo — distinta da bio curta sob o nome. */
export const ABOUT_MAX = 800;
export const LINK_TITLE_MAX = 60;
export const LINK_SUBTITLE_MAX = 120;
export const PROFILE_LINKS_MAX = 50;

export const PROFILE_ICONS = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'linkedin', 'site', 'phone', 'email', 'menu', 'location', 'link'] as const;
export type ProfileIcon = (typeof PROFILE_ICONS)[number];

export interface ProfilePageLink {
  title: string;
  subtitle: string;
  url: string;
  icon: ProfileIcon;
}

export interface ProfilePageData {
  name: string;
  bio: string;
  /** Texto longo do modal ao tocar no logo; vazio = logo não clicável. */
  about: string;
  avatarUrl: string | null;
  /** Fundo do banner (distinto do avatar/logo). */
  bannerImageUrl: string | null;
  themeColor: string;
  links: ProfilePageLink[];
}

export interface RawProfileInput {
  displayName?: string | null;
  fallbackName?: string | null;
  bio?: string | null;
  about?: string | null;
  avatarUrl?: string | null;
  bannerImageUrl?: string | null;
  themeColor?: string | null;
  links?: {
    title?: string | null;
    subtitle?: string | null;
    description?: string | null;
    url?: string | null;
    icon?: string | null;
    is_active?: boolean | null;
  }[] | null;
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

function isAllowedPublicStorageUrl(
  url: string | null | undefined,
  projectUrl: string | null | undefined,
  bucketPrefix: string,
): boolean {
  if (!url || !projectUrl || /["'<>`]/.test(url)) {
    return false;
  }
  try {
    const asset = new URL(url);
    const project = new URL(projectUrl);
    return (
      asset.protocol === 'https:' &&
      asset.host === project.host &&
      !asset.username &&
      asset.pathname.startsWith(`/storage/v1/object/public/${bucketPrefix}/`)
    );
  } catch {
    return false;
  }
}

/** Avatar só do bucket público `avatars` do próprio projeto, via https. */
export function isAllowedAvatarUrl(url: string | null | undefined, projectUrl: string | null | undefined): boolean {
  return isAllowedPublicStorageUrl(url, projectUrl, 'avatars');
}

/** Banner de fundo: buckets públicos `avatars` ou `brand-assets` do próprio projeto. */
export function isAllowedBannerUrl(url: string | null | undefined, projectUrl: string | null | undefined): boolean {
  return isAllowedPublicStorageUrl(url, projectUrl, 'avatars') || isAllowedPublicStorageUrl(url, projectUrl, 'brand-assets');
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
    links.push({
      title,
      subtitle: clean(link.subtitle ?? link.description, LINK_SUBTITLE_MAX),
      url: check.url,
      icon: isProfileIcon(link.icon) ? link.icon : 'link',
    });
  }
  return {
    name,
    bio: clean(input.bio, BIO_MAX),
    about: clean(input.about, ABOUT_MAX),
    avatarUrl: isAllowedAvatarUrl(input.avatarUrl, projectUrl) ? (input.avatarUrl as string) : null,
    bannerImageUrl: isAllowedBannerUrl(input.bannerImageUrl, projectUrl) ? (input.bannerImageUrl as string) : null,
    themeColor: isSafeColor(input.themeColor) ? input.themeColor : DEFAULT_THEME_COLOR,
    links,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function mixHex(a: string, b: string, t: number): string {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(mix(left.r, right.r))}${to(mix(left.g, right.g))}${to(mix(left.b, right.b))}`;
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** CTA principal: WhatsApp se houver; senão o primeiro link ativo. */
export function pickProfilePrimaryCta(links: ProfilePageLink[]): ProfilePageLink | null {
  return links.find((l) => l.icon === 'whatsapp') ?? links[0] ?? null;
}

function iconSvg(icon: ProfileIcon): string {
  switch (icon) {
    case 'whatsapp':
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`;
    case 'instagram':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/></svg>`;
    case 'tiktok':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    case 'facebook':
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`;
    case 'linkedin':
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9" fill="currentColor"/><circle cx="4" cy="4" r="2" fill="currentColor"/></svg>`;
    case 'site':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`;
    case 'phone':
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`;
    case 'email':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></svg>`;
    case 'menu':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>`;
    case 'location':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
  }
}

export const PROFILE_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'";

/** `preview`: links abrem fora (target _blank) para o iframe/WebView do app. */
export function renderProfilePage(
  data: ProfilePageData,
  options: { preview?: boolean; pageUrl?: string | null } = {},
): string {
  const color = isSafeColor(data.themeColor) ? data.themeColor : DEFAULT_THEME_COLOR;
  const secondary = mixHex(color, '#2563EB', 0.35);
  const accent = luminance(color) < 0.3 ? '#93C5FD' : color;
  const name = escapeHtml(data.name);
  const initial = escapeHtml(Array.from(data.name.trim())[0]?.toUpperCase() ?? 'T');
  const target = options.preview ? ' target="_blank"' : '';
  const cta = pickProfilePrimaryCta(data.links);
  const avatarInner = data.avatarUrl
    ? `<img class="avatar" src="${escapeHtml(data.avatarUrl)}" alt="" width="88" height="88" referrerpolicy="no-referrer">`
    : `<div class="avatar initial" aria-hidden="true">${initial}</div>`;
  const hasAbout = Boolean(data.about);
  const avatar = hasAbout
    ? `<button type="button" class="avatar-trigger" data-about-open aria-label="Sobre ${name}" aria-haspopup="dialog">${avatarInner}</button>`
    : avatarInner;
  const modalLogo = data.avatarUrl
    ? `<img class="avatar" src="${escapeHtml(data.avatarUrl)}" alt="" width="112" height="112" referrerpolicy="no-referrer">`
    : `<div class="avatar initial" aria-hidden="true" style="background:${color}">${initial}</div>`;
  const aboutModal = hasAbout
    ? renderAboutModal({ nameHtml: name, aboutHtml: escapeHtml(data.about), logoHtml: modalLogo })
    : '';
  const hasBanner = Boolean(data.bannerImageUrl);
  const bannerStyle = hasBanner
    ? ` style="--banner-image:url('${escapeHtml(data.bannerImageUrl as string)}')"`
    : '';

  const ctaBlock = cta ? renderInteractiveCta(escapeHtml(cta.url), target) : '';

  const linksHtml = data.links
    .map(
      (link) =>
        `<a class="link-card liquid-glass" href="${escapeHtml(link.url)}" rel="noopener noreferrer"${target}>
${wrapLinkIcon(iconSvg(link.icon), `icon-${link.icon}`)}
<span class="link-name">${escapeHtml(link.title)}</span>
${link.subtitle ? `<span class="link-desc">${escapeHtml(link.subtitle)}</span>` : ''}
</a>`,
    )
    .join('');

  const pageTitle = `${data.name} — Tréville Aproxima`;
  const pageDescription = data.bio.trim() || `Perfil digital de ${data.name} no Tréville Aproxima.`;
  const seo = renderSeoMetaTags({
    title: pageTitle,
    description: pageDescription,
    pageUrl: options.pageUrl,
    imageUrl: data.avatarUrl ?? data.bannerImageUrl,
    indexable: !options.preview,
  });

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${PROFILE_PAGE_CSP}">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<title>${name} — Tréville Aproxima</title>
${seo}
<style>
*{box-sizing:border-box}
:root{
  --text:#F8FAFC;--muted:#A8B8CC;--card:#12253F;--border:${color}99;
  --accent:${color};--accent-glow:${color}55;--accent-glow-light:${color}33;--accent-inset:${color}28;
  --shadow:0 0 0 1px ${color}40,0 0 22px ${color}45,0 10px 28px rgba(0,0,0,0.45);
  --page:linear-gradient(165deg,#0B1F3A 0%,#071825 48%,#050F1C 100%);
  --glow:radial-gradient(ellipse 90% 50% at 50% -10%,${color}32,transparent 60%),radial-gradient(circle at 80% 80%,${secondary}22,transparent 45%);
  --sheen:.08;--hi:.25;--status:rgba(248,250,252,0.6);
  --footer:#94A3B8;--icon-fallback:${GENERIC_ICON_BLUE}
}
@media(prefers-color-scheme:light){
  :root{
    --text:#0F172A;--muted:#64748B;--card:#FFFFFF;--border:${color}55;
    --accent:${color};--accent-glow:${color}40;--accent-glow-light:${color}28;--accent-inset:${color}18;
    --shadow:0 4px 18px rgba(15,23,42,0.07),0 1px 3px rgba(15,23,42,0.04),0 0 0 0.5px ${color}22;
    --page:linear-gradient(180deg,#F8FAFC 0%,#EEF4FB 100%);
    --glow:radial-gradient(ellipse 80% 45% at 50% -5%,${color}14,transparent 65%);
    --sheen:.06;--hi:.20;--status:#64748B;
    --footer:#64748B;--icon-fallback:${GENERIC_ICON_BLUE}
  }
}
body{margin:0;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--text);background:var(--page);position:relative;-webkit-font-smoothing:antialiased}
.glow{position:fixed;inset:0;pointer-events:none;background:var(--glow);z-index:0}
.wrap{position:relative;z-index:1;margin:0 auto;width:100%;max-width:420px;padding:24px 18px 36px}
.status{text-align:center;font-size:11px;font-weight:700;letter-spacing:.22em;color:var(--status);margin:0 0 14px}
.brand-card.liquid-glass{border-radius:24px;padding:36px 22px 32px;text-align:center;border:1.5px solid var(--border);box-shadow:var(--shadow);overflow:hidden}
.brand-card.has-banner{background-image:linear-gradient(180deg,rgba(0,0,0,0.35),rgba(0,0,0,0.52)),var(--banner-image);background-size:cover;background-position:center}
.brand-inner{position:relative;z-index:1}
${bannerDecorationCss()}
.avatar{display:block;margin:0 auto 14px;width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid ${color};background:#1E293B}
.avatar.initial{display:flex;align-items:center;justify-content:center;border-radius:18px;border:none;background:${color};font-size:36px;font-weight:800;color:#fff}
h1{margin:0;font-size:24px;font-weight:800;line-height:1.15;letter-spacing:.06em;word-wrap:break-word;text-transform:uppercase}
.bio{margin:8px 0 0;font-size:10px;line-height:1.55;letter-spacing:.12em;font-weight:500;color:var(--muted);opacity:.88;white-space:pre-line;word-wrap:break-word;text-transform:uppercase}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.link-card.liquid-glass{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:20px 12px 18px;border-radius:26px;text-decoration:none;color:var(--text);text-align:center;min-height:132px;overflow:visible}
.icon-circle{background:var(--icon-fallback)}
.icon-whatsapp,.icon-phone{background:${WHATSAPP_GREEN}}
.icon-instagram{background:${INSTAGRAM_GRADIENT}}
.icon-tiktok{background:#111827}
.icon-facebook{background:#1877F2}
.icon-linkedin{background:#0A66C2}
.icon-site,.icon-menu,.icon-link,.icon-email,.icon-location{background:${GENERIC_ICON_BLUE}}
.link-name{font-size:13px;font-weight:700;line-height:1.25;word-wrap:break-word}
.link-desc{display:block;max-width:100%;margin:0;font-size:11px;line-height:1.35;font-weight:400;color:var(--muted);opacity:.88;word-wrap:break-word}
.empty{margin-top:18px;text-align:center;font-size:14px;color:var(--muted)}
footer{margin-top:28px;text-align:center;font-size:12px;color:var(--footer)}
footer span{color:${accent};font-weight:700}
${liquidGlassCss()}
${interactiveCtaCss()}
${aboutModalCss()}
.about-logo .avatar{border:3px solid ${color};background:#1E293B}
.about-logo .avatar.initial{background:${color}}
.about-body{color:var(--muted)}
@media(min-width:480px){.wrap{padding-top:36px}}
</style>
</head>
<body>
<div class="glow" aria-hidden="true"></div>
<div class="wrap">
<p class="status">PÁGINA</p>
<section class="brand-card liquid-glass${hasBanner ? ' has-banner' : ''}"${bannerStyle}>
${bannerDecorationMarkup()}
<div class="brand-inner">
${avatar}
<h1>${name}</h1>
${data.bio ? `<p class="bio">${escapeHtml(data.bio)}</p>` : ''}
</div>
</section>
${ctaBlock}
${linksHtml ? `<nav class="grid">${linksHtml}</nav>` : '<p class="empty">Nenhum link por aqui ainda.</p>'}
<footer>Feito com <span>Tréville Aproxima</span></footer>
</div>
${aboutModal}
${glassFilterSvg()}
${linksHtml ? liquidGlassNavScript() : ''}
${hasAbout ? aboutModalScript() : ''}
</body>
</html>`;
}
