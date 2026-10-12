import { Platform } from 'react-native';

import { nfcManager } from '@/core/nfc/NfcManager';
import { setPendingRead } from '@/core/nfc/pendingRead';
import { buildTechnicalSnapshot } from '@/core/nfc/technical';
import { saveOperation, saveTag } from '@/core/offline/database';
import { push, replace } from '@/lib/navigation';
import { useNfcStore } from '@/stores/nfcStore';
import type { NfcTag, ParsedRecord } from '@/types/nfc';

export const READ_RESULT_ROUTE = '/tag-result';

export type ReadKind =
  | 'instagram'
  | 'tiktok'
  | 'whatsapp'
  | 'url'
  | 'contact'
  | 'phone'
  | 'email'
  | 'wifi'
  | 'location'
  | 'text'
  | 'app'
  | 'event'
  | 'custom'
  | 'empty'
  | 'rfid';

export interface ReadSummary {
  kind: ReadKind;
  /** Nome do tipo reconhecido ("Instagram", "WhatsApp"...). */
  title: string;
  /** Dado principal em destaque (@usuario, número, domínio, nome). */
  highlight: string;
  /** Valor completo (link, número, texto) mostrado abaixo do destaque. */
  detail: string | null;
  /** Destino de "Abrir"; nunca aberto sem toque do usuário. */
  href: string | null;
  copyValue: string;
  shareText: string;
}

export async function persistReadOperation(tag: NfcTag, records: ParsedRecord[]) {
  const tagId = tag.uid
    ? await saveTag({
        uid: tag.uid,
        type: tag.type,
        capacity: tag.capacity,
        technologies: tag.technologies,
        isWritable: tag.capabilities.canWrite,
        isLocked: tag.capabilities.isReadOnly,
      })
    : null;
  return saveOperation({
    tagId,
    tagUid: tag.uid,
    tagType: tag.type,
    tagCapacity: tag.capacity,
    operation: 'READ',
    status: 'SUCCESS',
    contentType: records[0]?.contentType ?? null,
    payload: records[0]?.data ?? null,
    displayTitle: records[0]?.displayTitle ?? (tag.capabilities.supportsNdef ? 'Tag vazia' : 'Tag RFID'),
    displayValue: records[0]?.displayValue ?? tag.type,
    integrityPercent: 100,
    technical: buildTechnicalSnapshot(tag, Platform.OS, nfcManager.isSimulation()),
  });
}

/** Mostra o cartão virtual da leitura. A trava de leitura única já deve estar ativa. */
export function openReadResult(tag: NfcTag, records: ParsedRecord[], nav: 'push' | 'replace' = 'push'): void {
  setPendingRead(tag, records);
  useNfcStore.getState().setCurrentTag(tag);
  void persistReadOperation(tag, records).catch(() => undefined);
  (nav === 'replace' ? replace : push)(READ_RESULT_ROUTE);
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

export function simplifyDomain(value: string): string {
  const url = parseUrl(value);
  if (!url || !url.hostname) {
    return value;
  }
  return url.hostname.replace(/^www\./i, '');
}

function socialHandle(url: URL, host: string): string | null {
  const first = url.pathname.split('/').filter(Boolean)[0] ?? '';
  const name = first.replace(/^@/, '');
  if (!name || (host === 'instagram' && ['p', 'reel', 'reels', 'stories', 'explore'].includes(name))) {
    return null;
  }
  return `@${name}`;
}

function isEmptyRecord(record: ParsedRecord): boolean {
  return record.contentType === 'CUSTOM' && !record.rawValue && !record.data.text && !record.data.cardTitle;
}

function summarizeUrl(raw: string): Omit<ReadSummary, 'copyValue' | 'shareText'> {
  const url = parseUrl(raw);
  const host = url?.hostname.replace(/^www\./i, '').toLowerCase() ?? '';
  if (url && (host === 'instagram.com' || host === 'instagr.am')) {
    const handle = socialHandle(url, 'instagram');
    return { kind: 'instagram', title: 'Instagram', highlight: handle ?? 'Perfil do Instagram', detail: raw, href: raw };
  }
  if (url && (host === 'tiktok.com' || host.endsWith('.tiktok.com'))) {
    const handle = socialHandle(url, 'tiktok');
    return { kind: 'tiktok', title: 'TikTok', highlight: handle ?? 'Perfil do TikTok', detail: raw, href: raw };
  }
  return { kind: 'url', title: 'Site', highlight: simplifyDomain(raw), detail: raw, href: url && /^https?:$/.test(url.protocol) ? url.toString() : raw };
}

export function summarizeRead(tag: NfcTag | null, records: ParsedRecord[]): ReadSummary {
  const meaningful = records.filter((record) => !isEmptyRecord(record));
  const first = meaningful[0];
  if (!first) {
    if (tag && !tag.capabilities.supportsNdef) {
      return { kind: 'rfid', title: 'Tag sem dados', highlight: 'Nenhum conteúdo legível', detail: null, href: null, copyValue: '', shareText: '' };
    }
    return { kind: 'empty', title: 'Tag vazia', highlight: 'Pronta para gravar', detail: null, href: null, copyValue: '', shareText: '' };
  }
  const data = first.data;
  let base: Omit<ReadSummary, 'copyValue' | 'shareText'>;
  let copyValue = first.rawValue || first.displayValue;
  switch (first.contentType) {
    case 'WHATSAPP': {
      const phone = formatPhone(data.phone ?? first.displayValue);
      const href = first.rawValue.startsWith('http') ? first.rawValue : `https://wa.me/${(data.phone ?? '').replace(/\D/g, '')}`;
      base = { kind: 'whatsapp', title: 'WhatsApp', highlight: phone, detail: data.message ?? null, href };
      copyValue = phone;
      break;
    }
    case 'URL':
      base = summarizeUrl(data.url ?? first.rawValue);
      copyValue = data.url ?? first.rawValue;
      break;
    case 'VCARD': {
      const href = data.phone ? `tel:${data.phone}` : data.email ? `mailto:${data.email}` : null;
      const detail = [data.phone ? formatPhone(data.phone) : null, data.email, data.company].filter(Boolean).join(' · ') || null;
      base = { kind: 'contact', title: 'Contato', highlight: data.fullName || 'Contato sem nome', detail, href };
      copyValue = [data.fullName, data.phone, data.email].filter(Boolean).join('\n');
      break;
    }
    case 'PHONE': {
      const phone = formatPhone(data.phone ?? first.displayValue);
      base = { kind: 'phone', title: 'Telefone', highlight: phone, detail: null, href: data.phone ? `tel:${data.phone}` : null };
      copyValue = phone;
      break;
    }
    case 'EMAIL':
      base = { kind: 'email', title: 'E-mail', highlight: data.email ?? first.displayValue, detail: data.subject ?? null, href: data.email ? `mailto:${data.email}` : null };
      copyValue = data.email ?? first.displayValue;
      break;
    case 'WIFI':
      base = { kind: 'wifi', title: 'Wi-Fi', highlight: data.ssid ?? first.displayValue, detail: data.security && data.security !== 'nopass' ? data.security : 'Rede aberta', href: null };
      copyValue = data.password || data.ssid || first.displayValue;
      break;
    case 'LOCATION': {
      const coords = data.latitude && data.longitude ? `${data.latitude},${data.longitude}` : null;
      base = {
        kind: 'location',
        title: 'Localização',
        highlight: data.label || data.address || coords || first.displayValue,
        detail: coords,
        href: coords ? `https://maps.google.com/?q=${coords}` : null,
      };
      copyValue = coords ?? first.displayValue;
      break;
    }
    case 'LINK_APP':
      base = { kind: 'app', title: 'Aplicativo', highlight: data.androidPackage || data.appUri || first.displayValue, detail: null, href: data.appUri ?? null };
      break;
    case 'EVENT':
      base = { kind: 'event', title: 'Evento', highlight: data.eventTitle || first.displayValue, detail: data.eventStart ?? null, href: null };
      break;
    case 'CUSTOM':
      base = { kind: 'custom', title: data.cardTitle ? 'Cartão' : 'Conteúdo', highlight: data.cardTitle || data.text || first.displayValue, detail: data.mimeType ?? null, href: null };
      copyValue = data.text || data.cardTitle || first.displayValue;
      break;
    default:
      base = { kind: 'text', title: 'Texto', highlight: data.text || first.displayValue, detail: null, href: null };
      copyValue = data.text || first.displayValue;
  }
  const shareText = [base.title, base.highlight, base.href && base.href !== base.highlight ? base.href : null].filter(Boolean).join('\n');
  return { ...base, copyValue, shareText };
}
