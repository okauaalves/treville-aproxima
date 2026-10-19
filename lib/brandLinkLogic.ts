import { cleanPhone, whatsAppUrl } from '@/core/nfc/uriBuilders';
import { buildSocialUrl, extractSocialUsername, validateSocialUsername } from '@/lib/socialHandle';
import { checkDestinationUrl } from '@/supabase/functions/_shared/destination';
import type { BrandLinkType } from '@/supabase/functions/_shared/brandPageRenderer';

export type { BrandLinkType };

export type BrandLinkDraft = {
  link_type: BrandLinkType;
  label: string;
  description: string;
  /** Valor digitado (pode ser @user, número ou URL). */
  raw: string;
  /** URL normalizada pronta para salvar (vazia se raw vazio). */
  destination_url: string;
  is_active: boolean;
  position: number;
};

export const LINK_DEFS: {
  type: BrandLinkType;
  title: string;
  placeholder: string;
  hint: string;
}[] = [
  { type: 'social', title: 'Redes Sociais', placeholder: 'https://…', hint: 'Link completo da sua página de redes' },
  { type: 'instagram', title: 'Instagram', placeholder: '@seuusuario ou URL', hint: 'Alguns usam só o @ — montamos a URL' },
  { type: 'google_reviews', title: 'Google Avaliações', placeholder: 'https://g.page/…', hint: 'URL das avaliações no Google' },
  { type: 'portfolio', title: 'Meu Portfólio', placeholder: 'https://…', hint: 'Site, Behance, LinkedIn…' },
  { type: 'about', title: 'Sobre Mim', placeholder: 'https://…', hint: 'Bio, site ou página sobre você' },
  { type: 'contact', title: 'Contato Direto', placeholder: 'Telefone ou wa.me', hint: 'WhatsApp: número com DDD ou link wa.me' },
];

export type LinkNormalizeResult = { ok: true; url: string } | { ok: false; error: string } | { ok: true; url: ''; empty: true };

/** Garante https:// em URLs http(s); rejeita esquemas não-web para os cartões gerais. */
export function normalizeHttpsUrl(raw: string): LinkNormalizeResult {
  const value = raw.trim();
  if (!value) {
    return { ok: true, url: '', empty: true };
  }
  let candidate = value;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  const check = checkDestinationUrl(candidate);
  if (!check.ok) {
    return { ok: false, error: check.error };
  }
  if (!check.url.toLowerCase().startsWith('https://')) {
    return { ok: false, error: 'Use um link https:// antes de salvar.' };
  }
  return { ok: true, url: check.url };
}

/** Instagram: @usuario → URL completa via socialHandle. */
export function normalizeInstagramInput(raw: string): LinkNormalizeResult {
  const value = raw.trim();
  if (!value) {
    return { ok: true, url: '', empty: true };
  }
  if (/^https?:\/\//i.test(value) || /^(?:www\.)?instagr/i.test(value)) {
    const social = validateSocialUsername('instagram', value);
    if (social.ok) {
      return { ok: true, url: social.url };
    }
    return normalizeHttpsUrl(value);
  }
  const social = validateSocialUsername('instagram', value);
  if (!social.ok) {
    return { ok: false, error: social.error };
  }
  return { ok: true, url: social.url };
}

/**
 * Contato Direto (WhatsApp): só número → wa.me/55…
 * Nunca inventa dígitos — só normaliza o que o usuário digitou.
 */
export function normalizeWhatsAppInput(raw: string): LinkNormalizeResult {
  const value = raw.trim();
  if (!value) {
    return { ok: true, url: '', empty: true };
  }
  if (/^https?:\/\//i.test(value) || /^wa\.me\//i.test(value)) {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const check = checkDestinationUrl(withScheme);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    try {
      const host = new URL(check.url).hostname.toLowerCase();
      if (host !== 'wa.me' && host !== 'api.whatsapp.com' && host !== 'www.whatsapp.com') {
        return { ok: false, error: 'Para Contato Direto use um número ou link wa.me.' };
      }
    } catch {
      return { ok: false, error: 'Link de WhatsApp inválido.' };
    }
    return { ok: true, url: check.url };
  }
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return { ok: false, error: 'Informe o número do WhatsApp (com DDD).' };
  }
  if (digits.length < 10 || digits.length > 13) {
    return { ok: false, error: 'Número incompleto. Use DDD + número (ex.: 11999998888).' };
  }
  return { ok: true, url: whatsAppUrl(digits) };
}

export function normalizeBrandLinkInput(type: BrandLinkType, raw: string): LinkNormalizeResult {
  switch (type) {
    case 'instagram':
      return normalizeInstagramInput(raw);
    case 'contact':
      return normalizeWhatsAppInput(raw);
    default:
      return normalizeHttpsUrl(raw);
  }
}

/** Valor amigável para reabrir o formulário a partir da URL salva. */
export function displayRawFromUrl(type: BrandLinkType, url: string | null | undefined): string {
  const value = (url ?? '').trim();
  if (!value) {
    return '';
  }
  if (type === 'instagram') {
    const user = extractSocialUsername('instagram', value);
    return user ? `@${user}` : value;
  }
  if (type === 'contact') {
    try {
      const parsed = new URL(value.startsWith('http') ? value : `https://${value}`);
      if (parsed.hostname === 'wa.me') {
        const phone = parsed.pathname.replace(/^\//, '');
        return phone || value;
      }
    } catch {
      /* keep url */
    }
  }
  return value;
}

export function emptyLinkDrafts(): BrandLinkDraft[] {
  return LINK_DEFS.map((def, index) => ({
    link_type: def.type,
    label: def.title,
    description: '',
    raw: '',
    destination_url: '',
    is_active: true,
    position: index,
  }));
}

/** Mescla linhas do banco nos 6 cartões fixos (ordem LINK_DEFS). */
export function mergeLinkDrafts(
  rows: { link_type: string; label?: string | null; description?: string | null; destination_url?: string | null; is_active?: boolean | null; position?: number | null }[],
): BrandLinkDraft[] {
  const byType = new Map(rows.map((row) => [row.link_type, row]));
  return LINK_DEFS.map((def, index) => {
    const row = byType.get(def.type);
    const destination = (row?.destination_url ?? '').trim();
    return {
      link_type: def.type,
      label: (row?.label ?? '').trim() || def.title,
      description: (row?.description ?? '').trim(),
      raw: displayRawFromUrl(def.type, destination),
      destination_url: destination,
      is_active: row?.is_active !== false,
      position: typeof row?.position === 'number' ? row.position : index,
    };
  });
}

export function applyRawToDraft(draft: BrandLinkDraft, raw: string): BrandLinkDraft {
  const normalized = normalizeBrandLinkInput(draft.link_type, raw);
  return {
    ...draft,
    raw,
    destination_url: normalized.ok ? normalized.url : draft.destination_url,
  };
}

/** Valida cartões ativos com conteúdo antes de persistir. Inativos / vazios passam. */
export function validateLinkDrafts(drafts: BrandLinkDraft[]): { ok: true } | { ok: false; error: string; link_type: BrandLinkType } {
  for (const draft of drafts) {
    const raw = draft.raw.trim();
    if (!raw) {
      continue;
    }
    const result = normalizeBrandLinkInput(draft.link_type, raw);
    if (!result.ok) {
      return { ok: false, error: result.error, link_type: draft.link_type };
    }
  }
  return { ok: true };
}

export function draftsForPersist(drafts: BrandLinkDraft[]): {
  link_type: BrandLinkType;
  label: string;
  description: string;
  destination_url: string | null;
  is_active: boolean;
  position: number;
}[] {
  return drafts.map((draft, index) => {
    const normalized = normalizeBrandLinkInput(draft.link_type, draft.raw);
    const url = normalized.ok ? normalized.url : draft.destination_url.trim();
    return {
      link_type: draft.link_type,
      label: draft.label.trim() || LINK_DEFS.find((d) => d.type === draft.link_type)?.title || draft.link_type,
      description: draft.description.trim(),
      destination_url: url || null,
      is_active: draft.is_active,
      position: index,
    };
  });
}

/** Reexport útil para testes / Instagram. */
export { buildSocialUrl, cleanPhone };
