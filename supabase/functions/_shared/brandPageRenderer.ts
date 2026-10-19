// Página pública da marca (Minha Página): renderer puro + temas liquid glass.
// Usado pela Edge Function `brand-page` / `redirect` e pelos testes Jest.
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
import { ABOUT_MAX, escapeHtml, isAllowedBannerUrl, isSafeColor } from './profilePage.ts';
import { renderSeoMetaTags } from './seoMeta.ts';

export type ThemeMode = 'dark' | 'light' | 'balanced';
export type BrandLinkType = 'social' | 'instagram' | 'google_reviews' | 'portfolio' | 'about' | 'contact';

export const BRAND_LINK_TYPES = ['social', 'instagram', 'google_reviews', 'portfolio', 'about', 'contact'] as const;
export const THEME_MODES = ['dark', 'light', 'balanced'] as const;

export const DEFAULT_PRIMARY = '#007AFF';
export const DEFAULT_SECONDARY = '#0A84FF';
export const BRAND_NAME_MAX = 80;
export const TAGLINE_MAX = 160;
/** Descrição longa no modal do logo — distinta da tagline curta sob o nome. */
export const BRAND_ABOUT_MAX = ABOUT_MAX;
export const LABEL_MAX = 60;
export const DESCRIPTION_MAX = 120;
export const BRAND_LINKS_MAX = 24;
/** Ícones genéricos (portfólio, sobre, contato) — azul claro vivo. */
export const ABOUT_ICON_BG = GENERIC_ICON_BLUE;

export interface BrandPage {
  brand_name: string;
  tagline: string | null;
  /** Texto longo do modal ao tocar no logo; null/vazio = logo não clicável. */
  about: string | null;
  logo_url: string | null;
  /** Fundo do banner (distinto do logo). */
  banner_image_url: string | null;
  theme_mode: ThemeMode;
  primary_color: string;
  secondary_color: string;
  accent_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  border_color?: string | null;
}

export interface BrandLink {
  link_type: BrandLinkType;
  label: string;
  description: string;
  destination_url: string;
  position: number;
  is_active: boolean;
}

export interface RawBrandPageInput {
  brand_name?: string | null;
  tagline?: string | null;
  about?: string | null;
  logo_url?: string | null;
  banner_image_url?: string | null;
  theme_mode?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  border_color?: string | null;
  links?: RawBrandLinkInput[] | null;
}

export interface RawBrandLinkInput {
  link_type?: string | null;
  label?: string | null;
  description?: string | null;
  destination_url?: string | null;
  position?: number | null;
  is_active?: boolean | null;
}

export interface BrandPageData {
  brand: BrandPage;
  links: BrandLink[];
}

export interface ThemeStyles {
  mode: ThemeMode;
  pageBackground: string;
  glowBlobs: string;
  text: string;
  mutedText: string;
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  glassOpacity: string;
  sheenOpacity: string;
  highlightOpacity: string;
  insetHighlight: string;
  insetDepth: string;
  primary: string;
  secondary: string;
  ctaBackground: string;
  ctaText: string;
  iconBackground: string;
  statusLabel: string;
  chromeBackground: string;
  chromeBorder: string;
  chromeText: string;
  chromePillBackground: string;
  chromePillBorder: string;
}

export interface RenderBrandPageOptions {
  preview?: boolean;
  /** URL pública curta exibida na barra chrome (https). */
  pageUrl?: string | null;
}

const DEFAULT_LABELS: Record<BrandLinkType, string> = {
  social: 'Redes Sociais',
  instagram: 'Instagram',
  google_reviews: 'Google Avaliações',
  portfolio: 'Meu Portfólio',
  about: 'Sobre Mim',
  contact: 'Contato Direto',
};

export const BRAND_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'";

function clean(value: string | null | undefined, max: number): string {
  return (value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

export function isBrandLinkType(value: string | null | undefined): value is BrandLinkType {
  return typeof value === 'string' && (BRAND_LINK_TYPES as readonly string[]).includes(value);
}

/** Logo só do bucket público `brand-assets` do próprio projeto, via https. */
export function isAllowedLogoUrl(url: string | null | undefined, projectUrl: string | null | undefined): boolean {
  if (!url || !projectUrl || /["'<>`]/.test(url)) {
    return false;
  }
  try {
    const logo = new URL(url);
    const project = new URL(projectUrl);
    return (
      logo.protocol === 'https:' &&
      logo.host === project.host &&
      !logo.username &&
      logo.href === url &&
      logo.pathname.startsWith('/storage/v1/object/public/brand-assets/')
    );
  } catch {
    return false;
  }
}

/** Só http(s) absoluto, sem caracteres de quebra de atributo. */
export function sanitizePageUrl(url: string | null | undefined): string | null {
  if (!url || /["'<>`]/.test(url) || url.length > 512) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
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

function desaturate(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const mix = (c: number) => Math.round(c + (gray - c) * amount);
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`;
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Filtra só links ativos com destination_url válida (nunca cartão sem destino). */
export function filterActiveLinks(links: RawBrandLinkInput[] | null | undefined): BrandLink[] {
  const result: BrandLink[] = [];
  const sorted = [...(links ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  for (const link of sorted) {
    if (link.is_active === false || result.length >= BRAND_LINKS_MAX) {
      continue;
    }
    if (!isBrandLinkType(link.link_type)) {
      continue;
    }
    const check = checkDestinationUrl(link.destination_url);
    if (!check.ok) {
      continue;
    }
    const label = clean(link.label, LABEL_MAX) || DEFAULT_LABELS[link.link_type];
    result.push({
      link_type: link.link_type,
      label,
      description: clean(link.description, DESCRIPTION_MAX),
      destination_url: check.url,
      position: typeof link.position === 'number' ? link.position : result.length,
      is_active: true,
    });
  }
  return result;
}

export function sanitizeBrandPage(input: RawBrandPageInput, projectUrl: string | null | undefined): BrandPageData {
  const primary = isSafeColor(input.primary_color) ? input.primary_color : DEFAULT_PRIMARY;
  const secondary = isSafeColor(input.secondary_color) ? input.secondary_color : DEFAULT_SECONDARY;
  return {
    brand: {
      brand_name: clean(input.brand_name, BRAND_NAME_MAX) || 'Minha Página',
      tagline: clean(input.tagline, TAGLINE_MAX) || null,
      about: clean(input.about, BRAND_ABOUT_MAX) || null,
      logo_url: isAllowedLogoUrl(input.logo_url, projectUrl) ? (input.logo_url as string) : null,
      banner_image_url: isAllowedBannerUrl(input.banner_image_url, projectUrl) ? (input.banner_image_url as string) : null,
      theme_mode: isThemeMode(input.theme_mode) ? input.theme_mode : 'dark',
      primary_color: primary,
      secondary_color: secondary,
      accent_color: isSafeColor(input.accent_color) ? input.accent_color : null,
      background_color: isSafeColor(input.background_color) ? input.background_color : null,
      text_color: isSafeColor(input.text_color) ? input.text_color : null,
      border_color: isSafeColor(input.border_color) ? input.border_color : null,
    },
    links: filterActiveLinks(input.links),
  };
}

export function getThemeStyles(mode: ThemeMode, brand: BrandPage): ThemeStyles {
  const primary = isSafeColor(brand.primary_color) ? brand.primary_color : DEFAULT_PRIMARY;
  const secondary = isSafeColor(brand.secondary_color) ? brand.secondary_color : DEFAULT_SECONDARY;
  const borderAccent = isSafeColor(brand.border_color) ? brand.border_color : primary;
  const ctaText = luminance(primary) > 0.55 ? '#0F172A' : '#FFFFFF';

  if (mode === 'light') {
    return {
      mode,
      pageBackground: '#F8FAFC',
      glowBlobs: `radial-gradient(ellipse 80% 45% at 50% -5%, ${borderAccent}14, transparent 65%)`,
      text: brand.text_color && isSafeColor(brand.text_color) ? brand.text_color : '#0F172A',
      mutedText: '#64748B',
      cardBackground: '#FFFFFF',
      cardBorder: `${borderAccent}55`,
      cardShadow: `0 4px 18px rgba(15,23,42,0.07), 0 1px 3px rgba(15,23,42,0.04), 0 0 0 0.5px ${borderAccent}22`,
      glassOpacity: '1',
      sheenOpacity: '0.06',
      highlightOpacity: '0.20',
      insetHighlight: 'rgba(255,255,255,0.90)',
      insetDepth: 'transparent',
      primary,
      secondary,
      ctaBackground: primary,
      ctaText,
      iconBackground: `${primary}18`,
      statusLabel: '#64748B',
      chromeBackground: 'rgba(255,255,255,0.92)',
      chromeBorder: `${borderAccent}40`,
      chromeText: '#334155',
      chromePillBackground: '#F8FAFC',
      chromePillBorder: `${borderAccent}45`,
    };
  }

  if (mode === 'balanced') {
    const base = desaturate(mixHex(primary, '#0B1220', 0.55), 0.35);
    const mid = desaturate(mixHex(primary, '#010816', 0.35), 0.25);
    return {
      mode,
      pageBackground: `radial-gradient(ellipse 120% 80% at 50% -10%, ${mixHex(primary, '#1E3A5F', 0.4)} 0%, ${base} 50%, ${mid} 100%)`,
      glowBlobs: `radial-gradient(circle at 20% 15%, ${borderAccent}35, transparent 48%), radial-gradient(circle at 80% 70%, ${secondary}28, transparent 50%)`,
      text: brand.text_color && isSafeColor(brand.text_color) ? brand.text_color : '#F1F5F9',
      mutedText: '#94A3B8',
      cardBackground: mixHex(primary, '#010816', 0.12),
      cardBorder: `${borderAccent}70`,
      cardShadow: `0 0 18px ${borderAccent}33, 0 8px 28px rgba(1,8,22,0.55)`,
      glassOpacity: '0.95',
      sheenOpacity: '0.10',
      highlightOpacity: '0.35',
      insetHighlight: 'rgba(255,255,255,0.18)',
      insetDepth: 'transparent',
      primary,
      secondary,
      ctaBackground: primary,
      ctaText,
      iconBackground: 'rgba(255,255,255,0.10)',
      statusLabel: 'rgba(241,245,249,0.65)',
      chromeBackground: 'rgba(8,16,32,0.88)',
      chromeBorder: `${borderAccent}50`,
      chromeText: '#E2E8F0',
      chromePillBackground: 'rgba(1,8,22,0.75)',
      chromePillBorder: `${borderAccent}55`,
    };
  }

  // dark — gradiente azul-marinho (não preto puro) + cards um tom mais claros
  return {
    mode,
    pageBackground: 'linear-gradient(165deg,#0B1F3A 0%,#071825 48%,#050F1C 100%)',
    glowBlobs: `radial-gradient(ellipse 90% 50% at 50% -10%, ${borderAccent}32, transparent 60%), radial-gradient(circle at 80% 80%, ${secondary}22, transparent 45%)`,
    text: brand.text_color && isSafeColor(brand.text_color) ? brand.text_color : '#F8FAFC',
    mutedText: '#A8B8CC',
    cardBackground: '#12253F',
    cardBorder: `${borderAccent}99`,
    cardShadow: `0 0 0 1px ${borderAccent}40, 0 0 22px ${borderAccent}45, 0 10px 28px rgba(0,0,0,0.45)`,
    glassOpacity: '1',
    sheenOpacity: '0.08',
    highlightOpacity: '0.25',
    insetHighlight: 'rgba(255,255,255,0.12)',
    insetDepth: 'transparent',
    primary,
    secondary,
    ctaBackground: primary,
    ctaText,
    iconBackground: GENERIC_ICON_BLUE,
    statusLabel: 'rgba(248,250,252,0.6)',
    chromeBackground: 'rgba(8,20,40,0.92)',
    chromeBorder: `${borderAccent}66`,
    chromeText: '#E2E8F0',
    chromePillBackground: 'rgba(8,20,40,0.85)',
    chromePillBorder: `${borderAccent}70`,
  };
}

function iconSvg(type: BrandLinkType): string {
  switch (type) {
    case 'social':
      // Telefone clássico (silhueta de fone) — NÃO balão de chat
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`;
    case 'instagram':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/></svg>`;
    case 'google_reviews':
      // G oficial nas 4 cores
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;
    case 'portfolio':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>`;
    case 'about':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.2-5 8-5s6.5 1.5 8 5"/></svg>`;
    case 'contact':
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></svg>`;
  }
}

function chromeIcons() {
  return {
    menu: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
    link: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93"/><path d="M14 11a5 5 0 0 0-7.07 0L5.5 12.41a5 5 0 0 0 7.07 7.07L14 18.07"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
    qr: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></svg>`,
    share: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>`,
  };
}

/** Destino do botão PAGINA: preferir WhatsApp (social), senão o primeiro link ativo. */
export function pickPrimaryCta(links: BrandLink[]): BrandLink | null {
  return links.find((l) => l.link_type === 'social') ?? links[0] ?? null;
}

export function renderBrandPage(data: BrandPageData, options: RenderBrandPageOptions = {}): string {
  const theme = getThemeStyles(data.brand.theme_mode, data.brand);
  const borderAccent = isSafeColor(data.brand.border_color) ? data.brand.border_color : theme.primary;
  const name = escapeHtml(data.brand.brand_name);
  const tagline = data.brand.tagline ? escapeHtml(data.brand.tagline) : '';
  const target = options.preview ? ' target="_blank"' : '';
  const cta = pickPrimaryCta(data.links);
  const pageUrl = sanitizePageUrl(options.pageUrl);
  const pageUrlAttr = pageUrl ? escapeHtml(pageUrl) : '';
  const pageUrlDisplay = pageUrl ? escapeHtml(pageUrl.replace(/^https?:\/\//, '')) : '';
  const icons = chromeIcons();

  const logoInitial = escapeHtml(Array.from(data.brand.brand_name.trim())[0]?.toUpperCase() ?? 'M');
  const logoInner = data.brand.logo_url
    ? `<img class="logo" src="${escapeHtml(data.brand.logo_url)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="logo-fallback" aria-hidden="true">${logoInitial}</div>`;
  const hasAbout = Boolean(data.brand.about);
  const logo = hasAbout
    ? `<button type="button" class="logo-trigger" data-about-open aria-label="Sobre ${name}" aria-haspopup="dialog">${logoInner}</button>`
    : logoInner;
  const modalLogo = data.brand.logo_url
    ? `<img class="logo" src="${escapeHtml(data.brand.logo_url)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="logo-fallback" aria-hidden="true" style="background:${theme.primary}">${logoInitial}</div>`;
  const aboutModal = hasAbout
    ? renderAboutModal({ nameHtml: name, aboutHtml: escapeHtml(data.brand.about as string), logoHtml: modalLogo })
    : '';

  const hasBanner = Boolean(data.brand.banner_image_url);
  const bannerStyle = hasBanner
    ? ` style="--banner-image:url('${escapeHtml(data.brand.banner_image_url as string)}')"`
    : '';
  const ctaHtml = cta ? renderInteractiveCta(escapeHtml(cta.destination_url), target) : '';

  const linksHtml = data.links
    .map(
      (link) =>
        `<a class="link-card liquid-glass" href="${escapeHtml(link.destination_url)}" rel="noopener noreferrer"${target}>
${wrapLinkIcon(iconSvg(link.link_type), `icon-${link.link_type}`)}
<span class="link-name">${escapeHtml(link.label)}</span>
${link.description ? `<span class="link-desc">${escapeHtml(link.description)}</span>` : ''}
</a>`,
    )
    .join('');

  const chromeHtml = pageUrl
    ? `<nav class="chrome lg" aria-label="Endereço da página" data-page-url="${pageUrlAttr}">
<div class="chrome-row">
<button type="button" class="chrome-btn" data-chrome="menu" aria-label="Menu">${icons.menu}</button>
<button type="button" class="chrome-btn" data-chrome="qr" aria-label="Escanear">${icons.qr}</button>
<div class="chrome-pill" title="${pageUrlAttr}">
<span class="chrome-link-icon" aria-hidden="true">${icons.link}</span>
<span class="chrome-url">${pageUrlDisplay}</span>
</div>
<button type="button" class="chrome-btn" data-chrome="copy" aria-label="Copiar link">${icons.copy}</button>
<button type="button" class="chrome-btn" data-chrome="share" aria-label="Compartilhar">${icons.share}</button>
</div>
</nav>
<script>
(function(){
  var bar=document.querySelector('.chrome');
  if(!bar)return;
  var url=bar.getAttribute('data-page-url')||'';
  function copy(){if(!url||!navigator.clipboard)return;navigator.clipboard.writeText(url).catch(function(){});}
  bar.addEventListener('click',function(e){
    var t=e.target.closest('[data-chrome]');
    if(!t)return;
    var a=t.getAttribute('data-chrome');
    if(a==='copy'||a==='qr'){copy();return;}
    if(a==='share'){
      if(navigator.share){navigator.share({url:url}).catch(function(){copy();});}
      else{copy();}
    }
  });
})();
</script>`
    : '';

  const pageTitle = data.brand.brand_name.trim() || 'Tréville Aproxima';
  const pageDescription =
    (data.brand.tagline ?? '').trim() ||
    (data.brand.about ?? '').trim().slice(0, 160) ||
    `Página de ${pageTitle} no Tréville Aproxima.`;
  const seo = renderSeoMetaTags({
    title: pageTitle,
    description: pageDescription,
    pageUrl,
    imageUrl: data.brand.logo_url ?? data.brand.banner_image_url,
    indexable: !options.preview,
  });

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${BRAND_PAGE_CSP}">
<meta name="referrer" content="no-referrer">
<title>${name}</title>
${seo}
<style>
*{box-sizing:border-box}
:root{
  --border:${theme.cardBorder};
  --shadow:${theme.cardShadow};
  --accent:${borderAccent};
  --accent-glow:${borderAccent}55;
  --accent-glow-light:${borderAccent}33;
  --accent-inset:${borderAccent}28;
}
body{margin:0;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${theme.text};background:${theme.pageBackground};position:relative;-webkit-font-smoothing:antialiased}
.glow{position:fixed;inset:0;pointer-events:none;background:${theme.glowBlobs};z-index:0}
.wrap{position:relative;z-index:1;margin:0 auto;width:100%;max-width:420px;padding:24px 18px ${pageUrl ? '88px' : '36px'}}
.status{text-align:center;font-size:11px;font-weight:700;letter-spacing:.22em;color:${theme.statusLabel};margin:0 0 14px}
.brand-card.liquid-glass{--card-solid:${theme.cardBackground};border-radius:24px;padding:36px 22px 32px;text-align:center;border:1.5px solid var(--border);box-shadow:var(--shadow);overflow:hidden}
.brand-card.has-banner{background-image:linear-gradient(180deg,rgba(0,0,0,0.35),rgba(0,0,0,0.52)),var(--banner-image);background-size:cover;background-position:center}
.brand-inner{position:relative;z-index:1}
${bannerDecorationCss()}
.logo{display:block;margin:0 auto 14px;max-width:112px;max-height:68px;width:auto;height:auto;object-fit:contain}
.logo-fallback{width:68px;height:68px;margin:0 auto 14px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#fff;background:${theme.primary}}
h1{margin:0;font-size:24px;font-weight:800;line-height:1.15;letter-spacing:.06em;word-wrap:break-word;text-transform:uppercase}
.tagline{margin:8px 0 0;font-size:10px;line-height:1.55;letter-spacing:.12em;font-weight:500;color:${theme.mutedText};opacity:.88;word-wrap:break-word;text-transform:uppercase}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.link-card.liquid-glass{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:20px 12px 18px;border-radius:26px;text-decoration:none;color:${theme.text};text-align:center;min-height:132px;overflow:visible;border:1.5px solid var(--border);box-shadow:var(--shadow)}
.icon-circle{background:${theme.iconBackground}}
.icon-social{background:${WHATSAPP_GREEN}}
.icon-instagram{background:${INSTAGRAM_GRADIENT}}
.icon-google_reviews{background:#FFFFFF;color:inherit;box-shadow:0 0 0 1px rgba(15,23,42,0.08)}
.icon-portfolio,.icon-about,.icon-contact{background:${ABOUT_ICON_BG}}
.link-name{font-size:13px;font-weight:700;line-height:1.25;word-wrap:break-word}
.link-desc{display:block;max-width:100%;margin:0;font-size:11px;line-height:1.35;font-weight:400;color:${theme.mutedText};opacity:.88;word-wrap:break-word}
.empty{margin-top:18px;text-align:center;font-size:14px;color:${theme.mutedText}}
.lg{position:relative;isolation:isolate}
.lg::before{content:'';position:absolute;inset:-45% -35%;background:linear-gradient(118deg,transparent 28%,rgba(255,255,255,${theme.sheenOpacity}) 46%,transparent 60%);transform:rotate(-8deg);mix-blend-mode:soft-light;pointer-events:none;z-index:2}
.lg::after{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,${theme.highlightOpacity}),transparent);pointer-events:none;z-index:3}
${liquidGlassCss()}
${interactiveCtaCss()}
${aboutModalCss()}
.about-logo .logo-fallback{background:${theme.primary}}
.about-body{color:${theme.mutedText}}
.chrome{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:420px;z-index:20;padding:10px 14px calc(12px + env(safe-area-inset-bottom,0px));background:${theme.chromeBackground};border:1.5px solid ${theme.chromeBorder};border-bottom:none;border-radius:22px 22px 0 0;box-shadow:0 -6px 24px rgba(1,8,22,0.22);color:${theme.chromeText};backdrop-filter:blur(18px) saturate(160%);-webkit-backdrop-filter:blur(18px) saturate(160%)}
.chrome-row{display:flex;align-items:center;gap:8px}
.chrome-btn{appearance:none;border:0;background:transparent;color:inherit;width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer;flex:none}
.chrome-btn svg{width:20px;height:20px}
.chrome-btn:active{opacity:.7}
.chrome-pill{flex:1;min-width:0;display:flex;align-items:center;gap:8px;min-height:36px;padding:0 12px;border-radius:999px;background:${theme.chromePillBackground};border:1px solid ${theme.chromePillBorder}}
.chrome-link-icon{display:inline-flex;flex:none;opacity:.75}
.chrome-link-icon svg{width:14px;height:14px}
.chrome-url{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(min-width:480px){.wrap{padding-top:36px}}
</style>
</head>
<body data-theme="${theme.mode}">
<div class="glow" aria-hidden="true"></div>
<div class="wrap">
<p class="status">PÁGINA</p>
<section class="brand-card liquid-glass${hasBanner ? ' has-banner' : ''}"${bannerStyle}>
${bannerDecorationMarkup()}
<div class="brand-inner">
${logo}
<h1>${name}</h1>
${tagline ? `<p class="tagline">${tagline}</p>` : ''}
</div>
</section>
${ctaHtml}
${linksHtml ? `<nav class="grid">${linksHtml}</nav>` : '<p class="empty">Nenhum link publicado ainda.</p>'}
</div>
${chromeHtml}
${aboutModal}
${glassFilterSvg()}
${linksHtml ? liquidGlassNavScript() : ''}
${hasAbout ? aboutModalScript() : ''}
</body>
</html>`;
}
