import { sanitizeForStorage, sanitizeText, sanitizeUrl } from '@/core/validation/securityValidator';
import {
  BIO_MAX,
  DEFAULT_THEME_COLOR,
  DISPLAY_NAME_MAX,
  isProfileIcon,
  isSafeColor,
  LINK_TITLE_MAX,
  PROFILE_LINKS_MAX,
  type ProfileIcon,
} from '@/supabase/functions/_shared/profilePage';

export interface Profile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  theme_color: string;
  theme_style: string;
}

export interface ProfileLink {
  id: string | null;
  title: string;
  url: string;
  icon: ProfileIcon;
  is_active: boolean;
}

export interface LinkPreset {
  icon: ProfileIcon;
  label: string;
  title: string;
  placeholder: string;
}

export const LINK_PRESETS: LinkPreset[] = [
  { icon: 'whatsapp', label: 'WhatsApp', title: 'WhatsApp', placeholder: '11 99999-8888' },
  { icon: 'instagram', label: 'Instagram', title: 'Instagram', placeholder: '@seuperfil' },
  { icon: 'tiktok', label: 'TikTok', title: 'TikTok', placeholder: '@seuperfil' },
  { icon: 'facebook', label: 'Facebook', title: 'Facebook', placeholder: 'facebook.com/suapagina' },
  { icon: 'linkedin', label: 'LinkedIn', title: 'LinkedIn', placeholder: 'linkedin.com/in/voce' },
  { icon: 'site', label: 'Site', title: 'Meu site', placeholder: 'seusite.com.br' },
  { icon: 'phone', label: 'Telefone', title: 'Ligar', placeholder: '11 99999-8888' },
  { icon: 'email', label: 'E-mail', title: 'E-mail', placeholder: 'voce@email.com' },
  { icon: 'menu', label: 'Cardápio', title: 'Cardápio', placeholder: 'seusite.com.br/cardapio' },
  { icon: 'location', label: 'Localização', title: 'Como chegar', placeholder: 'Av. Paulista, 1000 - São Paulo' },
  { icon: 'link', label: 'Outro', title: 'Link', placeholder: 'https://' },
];

export function presetFor(icon: ProfileIcon): LinkPreset {
  return LINK_PRESETS.find((preset) => preset.icon === icon) ?? LINK_PRESETS[LINK_PRESETS.length - 1]!;
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function withBrazilCode(phone: string): string {
  const only = digits(phone);
  return only.length === 10 || only.length === 11 ? `55${only}` : only;
}

function handle(value: string): string {
  return value.trim().replace(/^@/, '');
}

/** Converte o que a pessoa digitou na URL final do link, conforme o atalho. */
export function normalizeLinkUrl(icon: ProfileIcon, raw: string): string {
  const value = raw.trim();
  if (!value) {
    return '';
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return value;
  }
  switch (icon) {
    case 'whatsapp':
      return /^[\d\s()+-]+$/.test(value) ? `https://wa.me/${withBrazilCode(value)}` : `https://${value}`;
    case 'phone':
      return `tel:+${withBrazilCode(value)}`;
    case 'email':
      return `mailto:${value}`;
    case 'instagram':
      return value.includes('.') && value.includes('/') ? `https://${value}` : `https://instagram.com/${handle(value)}`;
    case 'tiktok':
      return value.includes('.') && value.includes('/') ? `https://${value}` : `https://www.tiktok.com/@${handle(value)}`;
    case 'location':
      return value.includes('.') && value.includes('/') ? `https://${value}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
    default:
      return `https://${value}`;
  }
}

export type LinkCheck = { ok: true; links: ProfileLink[] } | { ok: false; index: number; error: string };

/** Valida e normaliza a lista antes de salvar. Erro aponta o item. */
export function validateProfileLinks(links: ProfileLink[]): LinkCheck {
  if (links.length > PROFILE_LINKS_MAX) {
    return { ok: false, index: PROFILE_LINKS_MAX, error: `No máximo ${PROFILE_LINKS_MAX} links.` };
  }
  const result: ProfileLink[] = [];
  for (const [index, link] of links.entries()) {
    const title = sanitizeText(link.title);
    if (!title) {
      return { ok: false, index, error: 'Dê um título ao link.' };
    }
    if (title.length > LINK_TITLE_MAX) {
      return { ok: false, index, error: `Título com no máximo ${LINK_TITLE_MAX} caracteres.` };
    }
    const icon = isProfileIcon(link.icon) ? link.icon : 'link';
    const check = sanitizeUrl(normalizeLinkUrl(icon, sanitizeText(link.url)));
    if (!check.ok) {
      return { ok: false, index, error: check.error };
    }
    result.push({ id: link.id, title, url: check.url, icon, is_active: link.is_active });
  }
  return { ok: true, links: result };
}

export type ProfileFormCheck =
  | { ok: true; value: { display_name: string | null; bio: string | null; theme_color: string } }
  | { ok: false; error: string };

export function validateProfileForm(input: { displayName: string; bio: string; themeColor: string }): ProfileFormCheck {
  const name = sanitizeText(input.displayName);
  const bio = sanitizeForStorage(input.bio);
  if (name.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Nome com no máximo ${DISPLAY_NAME_MAX} caracteres.` };
  }
  if (bio.length > BIO_MAX) {
    return { ok: false, error: `Bio com no máximo ${BIO_MAX} caracteres.` };
  }
  if (!isSafeColor(input.themeColor)) {
    return { ok: false, error: 'Cor inválida.' };
  }
  return { ok: true, value: { display_name: name || null, bio: bio || null, theme_color: input.themeColor } };
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export const EMPTY_PROFILE = (id: string): Profile => ({
  id,
  full_name: null,
  display_name: null,
  bio: null,
  avatar_url: null,
  theme_color: DEFAULT_THEME_COLOR,
  theme_style: 'glass',
});
