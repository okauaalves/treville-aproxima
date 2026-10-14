import { checkDestinationUrl, type DestinationCheck } from '@/supabase/functions/_shared/destination';
import { cleanPhone, emailUri, mapsUrl, phoneUri, smsUri, whatsAppUrl } from '@/core/nfc/uriBuilders';
import { sanitizeUrl, validateEmail, validatePhone } from '@/core/validation/securityValidator';

export { checkDestinationUrl };
export type { DestinationCheck };

export const LINK_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LINK_ID_LENGTH = 6;
export const FALLBACK_REDIRECT_BASE = 'https://fyavoukktjysxtmtkspd.supabase.co/functions/v1/redirect';
export const PLAQUINHA_NAME_MAX = 40;
/** Página pública do perfil (EAS Hosting). `EXPO_PUBLIC_PROFILE_PAGE_URL` sobrescreve. */
export const DEFAULT_PROFILE_PAGE_BASE = 'https://treville-aproxima.expo.app/p';

/** 'menu' = link de cardápio; 'profile' = Perfil completo (mini página com vários links). */
export type DestinationType = 'url' | 'whatsapp' | 'instagram' | 'phone' | 'sms' | 'email' | 'location' | 'menu' | 'profile';

/** Ordem do grid do passo 2 da criação. */
export const CREATE_DESTINATION_TYPES: DestinationType[] = ['whatsapp', 'instagram', 'url', 'phone', 'email', 'menu', 'location', 'profile'];

/** 'nfc_outdated' fica reservado: a URL curta nunca muda, então hoje nunca é calculado. */
export type SyncStatus = 'qr_nfc' | 'qr_only' | 'nfc_outdated';

/** A lista (aba Plaquinhas) não traz `user_id`, `updated_at` nem `webhook_url`; a tela de detalhe traz. */
export interface RedirectLink {
  id: string;
  user_id?: string;
  name: string;
  destination_url: string;
  destination_type: DestinationType | string;
  is_active: boolean;
  scan_count: number;
  nfc_synced: boolean;
  created_at: string;
  updated_at?: string;
  profile_enabled: boolean;
  webhook_url?: string | null;
}

export interface ScanLog {
  id?: string;
  link_id?: string;
  scanned_at: string;
  scan_type: 'qr' | 'nfc' | string;
}

export interface DestinationForm {
  type: DestinationType;
  url: string;
  phone: string;
  message: string;
  email: string;
  subject: string;
  instagram: string;
  location: string;
}

export const EMPTY_DESTINATION: DestinationForm = {
  type: 'url',
  url: '',
  phone: '',
  message: '',
  email: '',
  subject: '',
  instagram: '',
  location: '',
};

export const DESTINATION_LABELS: Record<DestinationType, string> = {
  url: 'Link (URL)',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  phone: 'Telefone',
  sms: 'SMS',
  email: 'E-mail',
  location: 'Localização',
  menu: 'Cardápio',
  profile: 'Perfil completo',
};

export function resolveProfilePageBase(value: string | null | undefined): string {
  const base = (value ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9/_-]*)?$/i.test(base) ? base : DEFAULT_PROFILE_PAGE_BASE;
}

export function profilePageUrl(base: string, id: string): string {
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(id)}`;
}

/** 32 símbolos: byte % 32 não tem viés (256 é múltiplo de 32). */
export function generateLinkId(randomBytes: (count: number) => Uint8Array, length = LINK_ID_LENGTH): string {
  const bytes = randomBytes(length);
  let id = '';
  for (let index = 0; index < length; index += 1) {
    id += LINK_ID_ALPHABET[(bytes[index] ?? 0) % LINK_ID_ALPHABET.length];
  }
  return id;
}

/** Deriva a base do redirect da URL do Supabase do app; placeholders caem no fallback. */
export function resolveRedirectBase(supabaseUrl: string | undefined | null): string {
  const value = (supabaseUrl ?? '').trim().replace(/\/+$/, '');
  if (/^https:\/\/[a-z0-9]{10,}\.supabase\.co$/.test(value)) {
    return `${value}/functions/v1/redirect`;
  }
  return FALLBACK_REDIRECT_BASE;
}

export function buildLinkUrl(base: string, id: string, via: 'qr' | 'nfc' = 'qr'): string {
  const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(id)}`;
  return via === 'nfc' ? `${url}?s=nfc` : url;
}

/** Forma curta para exibir: host + '/…/' + id. Nunca inventa domínio. */
export function shortDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const id = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
    return `${parsed.host}/…/${id}`;
  } catch {
    return url;
  }
}

function withScheme(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function instagramHandle(value: string): string {
  return value
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '');
}

/** Converte o formulário em URL de destino validada. */
export function buildDestination(form: DestinationForm): DestinationCheck {
  switch (form.type) {
    case 'url':
    case 'menu': {
      if (!form.url.trim()) {
        return { ok: false, error: form.type === 'menu' ? 'Informe o link do cardápio.' : 'Informe o link.' };
      }
      const check = sanitizeUrl(withScheme(form.url));
      return check.ok ? { ok: true, url: check.url } : check;
    }
    case 'whatsapp':
    case 'phone':
    case 'sms': {
      if (!validatePhone(form.phone).ok || cleanPhone(form.phone).length < 10) {
        return { ok: false, error: 'Informe um número com DDD.' };
      }
      const url = form.type === 'whatsapp' ? whatsAppUrl(form.phone, form.message.trim() || undefined) : form.type === 'sms' ? smsUri(form.phone, form.message.trim() || undefined) : phoneUri(form.phone, true);
      return checkDestinationUrl(url);
    }
    case 'email': {
      const email = validateEmail(form.email);
      if (!email.ok) {
        return email;
      }
      return checkDestinationUrl(emailUri(email.email, form.subject.trim() || undefined));
    }
    case 'instagram': {
      const handle = instagramHandle(form.instagram);
      if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
        return { ok: false, error: 'Informe o @ do Instagram.' };
      }
      return checkDestinationUrl(`https://instagram.com/${handle}`);
    }
    case 'location':
      if (!form.location.trim()) {
        return { ok: false, error: 'Informe o endereço ou as coordenadas.' };
      }
      return checkDestinationUrl(mapsUrl(form.location.trim()));
    default:
      return { ok: false, error: 'Tipo de destino inválido.' };
  }
}

/** Preenche o formulário a partir de um destino salvo (edição). */
export function parseDestination(url: string, type: string): DestinationForm {
  if (type === 'empty') {
    return { ...EMPTY_DESTINATION };
  }
  const form: DestinationForm = { ...EMPTY_DESTINATION, type: isDestinationType(type) ? type : 'url' };
  try {
    const parsed = new URL(url);
    switch (form.type) {
      case 'whatsapp':
        return { ...form, phone: parsed.pathname.replace(/\D/g, ''), message: parsed.searchParams.get('text') ?? '' };
      case 'phone':
        return { ...form, phone: url.replace(/^tel:\+?/i, '') };
      case 'sms':
        return { ...form, phone: url.replace(/^sms:\+?/i, '').replace(/\?.*$/, ''), message: new URLSearchParams(url.split('?')[1] ?? '').get('body') ?? '' };
      case 'email':
        return { ...form, email: decodeURIComponent(url.replace(/^mailto:/i, '').replace(/\?.*$/, '')), subject: new URLSearchParams(url.split('?')[1] ?? '').get('subject') ?? '' };
      case 'instagram':
        return { ...form, instagram: parsed.pathname.replace(/\//g, '') };
      case 'location':
        return { ...form, location: parsed.searchParams.get('q') ?? '' };
      case 'menu':
        return { ...form, url };
      default:
        return { ...form, type: 'url', url };
    }
  } catch {
    return { ...form, type: 'url', url };
  }
}

export function isDestinationType(value: string): value is DestinationType {
  return value in DESTINATION_LABELS;
}

export function syncStatus(link: Pick<RedirectLink, 'nfc_synced'>): SyncStatus {
  return link.nfc_synced ? 'qr_nfc' : 'qr_only';
}

export const SYNC_LABELS: Record<SyncStatus, string> = {
  qr_nfc: 'QR + NFC',
  qr_only: 'Só QR',
  nfc_outdated: 'NFC desatualizado',
};

export interface ScanDay {
  key: string;
  label: string;
  count: number;
  qr: number;
  nfc: number;
}

export interface ScanStats {
  qr: number;
  nfc: number;
  sample: number;
  days: ScanDay[];
  maxPerDay: number;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Agrega os logs por tipo e pelos últimos 7 dias (hoje incluso, fuso local). */
export function aggregateScans(logs: ScanLog[], now: Date = new Date()): ScanStats {
  const days: ScanDay[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    days.push({ key: dayKey(date), label: WEEKDAYS[date.getDay()] ?? '', count: 0, qr: 0, nfc: 0 });
  }
  const index = new Map(days.map((day, position) => [day.key, position]));
  let qr = 0;
  let nfc = 0;
  for (const log of logs) {
    if (log.scan_type === 'nfc') {
      nfc += 1;
    } else {
      qr += 1;
    }
    const scanned = new Date(log.scanned_at);
    if (Number.isNaN(scanned.getTime())) {
      continue;
    }
    const position = index.get(dayKey(scanned));
    if (position !== undefined) {
      const day = days[position]!;
      day.count += 1;
      if (log.scan_type === 'nfc') {
        day.nfc += 1;
      } else {
        day.qr += 1;
      }
    }
  }
  return { qr, nfc, sample: logs.length, days, maxPerDay: Math.max(0, ...days.map((day) => day.count)) };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** "12/10/2026 às 14:05" no fuso do aparelho, sem depender de Intl. */
export function formatDateTimePtBr(value: string | Date | null | undefined): string {
  if (!value) {
    return 'Nunca';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Nunca';
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} às ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const SCAN_TYPE_LABELS: Record<'qr' | 'nfc', string> = { qr: 'QR Code', nfc: 'Tag NFC' };