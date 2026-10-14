import type { NdefRecord } from 'react-native-nfc-manager';

import type { ContentType } from '@/theme/colors';

import { buildCustomCardBody, isCustomCardVCard, parseCustomCard } from '@/core/nfc/customCard';
import { Ndef } from '@/core/nfc/nfcNative';
import { cleanPhone, emailUri, mapsUrl, phoneUri, whatsAppUrl } from '@/core/nfc/uriBuilders';
import { assessUrl } from '@/core/validation/urlSafety';
import type { NfcPayload, ParsedRecord, WifiSecurity } from '@/types/nfc';

const AUTH: Record<WifiSecurity, number[]> = {
  nopass: [0x00, 0x01],
  WEP: [0x00, 0x04],
  WPA: [0x00, 0x02],
  WPA2: [0x00, 0x20],
  WPA3: [0x00, 0x40],
};

const ENCRYPT: Record<WifiSecurity, number[]> = {
  nopass: [0x00, 0x01],
  WEP: [0x00, 0x02],
  WPA: [0x00, 0x08],
  WPA2: [0x00, 0x08],
  WPA3: [0x00, 0x08],
};

function asBytes(payload: unknown): number[] {
  if (payload instanceof Uint8Array) {
    return Array.from(payload);
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => Number(item));
  }
  return [];
}

function tlv(type: number[], value: number[]): number[] {
  const length = value.length;
  return [...type, (length >> 8) & 0xff, length & 0xff, ...value];
}

function stringBytes(value: string): number[] {
  return Ndef.util.stringToBytes(value).map((item: number) => Number(item));
}

function bytesToString(bytes: number[]): string {
  return Ndef.util.bytesToString(bytes);
}

export { cleanPhone };

export const AAR_TYPE = 'android.com:pkg';

/** Record no formato que o ndef-lib codifica: type string, id e payload em bytes. */
export interface NormalizedRecord {
  tnf: number;
  type: string;
  id: number[];
  payload: number[];
}

function hexToBytes(value: string): number[] {
  const clean = value.replace(/[^0-9a-f]/gi, '');
  return (clean.match(/.{1,2}/g) ?? []).map((pair) => Number.parseInt(pair, 16));
}

/**
 * O Android devolve `type` como array de bytes e `id` como string hex; o ndef-lib só codifica
 * type string e id em bytes. Sem normalizar, encodeMessage quebra com records lidos da tag.
 */
export function normalizeRecord(record: NdefRecord | NormalizedRecord): NormalizedRecord {
  const rawType: unknown = record.type;
  const type = typeof rawType === 'string' ? rawType : String.fromCharCode(...asBytes(rawType));
  const rawId: unknown = (record as { id?: unknown }).id;
  const id = typeof rawId === 'string' ? hexToBytes(rawId) : asBytes(rawId);
  return { tnf: Number(record.tnf), type, id, payload: asBytes(record.payload) };
}

export function encodeRecords(records: (NdefRecord | NormalizedRecord)[]): number[] {
  return Ndef.encodeMessage(records.map(normalizeRecord) as NdefRecord[]).map((byte: number) => Number(byte));
}

/** Mensagem NDEF + cabeçalho TLV (2 bytes até 254, 4 bytes a partir de 255). */
export function ndefMessageSize(records: (NdefRecord | NormalizedRecord)[]): number {
  if (records.length === 0) {
    return 0;
  }
  const encoded = encodeRecords(records);
  const tlvOverhead = encoded.length < 255 ? 2 : 4;
  return encoded.length + tlvOverhead;
}

export interface MultiRecordBuild {
  records: NdefRecord[];
  recordSizes: number[];
  messageBytes: number;
  totalSize: number;
  capacity: number;
  fits: boolean;
  overBy: number;
}

function recordOf(contentType: ContentType, title: string, value: string, raw: string, data: NfcPayload): ParsedRecord {
  return { contentType, displayTitle: title, displayValue: value, rawValue: raw, data };
}

export function detectContentType(url: string): ContentType {
  const lower = url.toLowerCase();
  if (lower.includes('wa.me/') || lower.includes('api.whatsapp.com')) {
    return 'WHATSAPP';
  }
  if (lower.startsWith('tel:')) {
    return 'PHONE';
  }
  if (lower.startsWith('mailto:')) {
    return 'EMAIL';
  }
  if (lower.startsWith('geo:')) {
    return 'LOCATION';
  }
  return 'URL';
}

export class NdefEngine {
  buildMessage(payload: NfcPayload): NdefRecord[] {
    if (payload.mimeType) {
      return [this.buildMimeRecord(payload.mimeType, payload.text ?? '')];
    }
    switch (payload.contentType) {
      case 'URL':
        return [this.buildUrlRecord(payload.url ?? '')];
      case 'TEXT':
        return [this.buildTextRecord(payload.text ?? '')];
      case 'WHATSAPP':
        return [this.buildWhatsAppRecord(payload.phone ?? '', payload.message)];
      case 'PHONE':
        return [this.buildPhoneRecord(payload.phone ?? '', payload.includeCountryCode)];
      case 'EMAIL':
        return [this.buildEmailRecord(payload.email ?? '', payload.subject, payload.body)];
      case 'VCARD':
        return [this.buildVCardRecord(payload)];
      case 'WIFI':
        return [this.buildWifiRecord(payload)];
      case 'LOCATION':
        return [this.buildLocationRecord(payload)];
      case 'LINK_APP':
        return this.buildAppRecords(payload.appUri, payload.androidPackage);
      case 'EVENT':
        return [this.buildTextRecord(`${payload.eventTitle ?? 'Evento'} ${payload.eventStart ?? ''}`.trim())];
      case 'CUSTOM':
        return [this.buildCustomCardRecord(payload)];
      default:
        return [this.buildTextRecord(payload.text ?? payload.url ?? '')];
    }
  }

  buildUrlRecord(url: string): NdefRecord {
    return Ndef.uriRecord(url.trim());
  }

  /** Deep link (se houver) seguido do Android Application Record, que o Android usa para abrir o app. */
  buildAppRecords(appUri?: string, androidPackage?: string): NdefRecord[] {
    const records: NdefRecord[] = [];
    if (appUri?.trim()) {
      records.push(this.buildUrlRecord(appUri));
    }
    if (androidPackage?.trim()) {
      records.push(Ndef.record(Ndef.TNF_EXTERNAL_TYPE, AAR_TYPE, [], stringBytes(androidPackage.trim())));
    }
    return records.length > 0 ? records : [this.buildUrlRecord(appUri ?? '')];
  }

  buildMimeRecord(mimeType: string, text: string): NdefRecord {
    return Ndef.record(Ndef.TNF_MIME_MEDIA, mimeType.trim().toLowerCase(), [], stringBytes(text));
  }

  /** Monta todos os records na ordem e mede a mensagem inteira (com TLV) contra a capacidade. */
  buildMultipleRecords(payloads: NfcPayload[], capacity = 0): MultiRecordBuild {
    const records = payloads.flatMap((payload) => this.buildMessage(payload));
    const recordSizes = records.map((record) => encodeRecords([record]).length);
    const messageBytes = records.length > 0 ? encodeRecords(records).length : 0;
    const totalSize = ndefMessageSize(records);
    const fits = capacity <= 0 || totalSize <= capacity;
    return {
      records,
      recordSizes,
      messageBytes,
      totalSize,
      capacity,
      fits,
      overBy: fits ? 0 : totalSize - capacity,
    };
  }

  buildTextRecord(text: string): NdefRecord {
    return Ndef.textRecord(text, 'pt');
  }

  buildWhatsAppRecord(phone: string, message?: string): NdefRecord {
    return this.buildUrlRecord(whatsAppUrl(phone, message));
  }

  buildPhoneRecord(phone: string, includeCountryCode = false): NdefRecord {
    return this.buildUrlRecord(phoneUri(phone, includeCountryCode));
  }

  buildEmailRecord(address: string, subject?: string, body?: string): NdefRecord {
    return this.buildUrlRecord(emailUri(address, subject, body));
  }

  buildCustomCardRecord(payload: NfcPayload): NdefRecord {
    return this.buildTextRecord(buildCustomCardBody(payload));
  }

  buildVCardRecord(payload: NfcPayload): NdefRecord {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${payload.fullName ?? ''}`,
      payload.phone ? `TEL:${payload.phone}` : '',
      payload.email ? `EMAIL:${payload.email}` : '',
      payload.company ? `ORG:${payload.company}` : '',
      payload.jobTitle ? `TITLE:${payload.jobTitle}` : '',
      payload.website ? `URL:${payload.website}` : '',
      payload.address ? `ADR:${payload.address}` : '',
      'END:VCARD',
    ].filter((line) => line.length > 0);
    return this.buildTextRecord(lines.join('\n'));
  }

  buildWifiRecord(payload: NfcPayload): NdefRecord {
    const security = payload.security ?? 'WPA2';
    const ssid = stringBytes(payload.ssid ?? '');
    const key = stringBytes(security === 'nopass' ? '' : payload.password ?? '');
    const credential = [
      ...tlv([0x10, 0x03], AUTH[security]),
      ...tlv([0x10, 0x0f], ENCRYPT[security]),
      ...tlv([0x10, 0x45], ssid),
      ...tlv([0x10, 0x27], key),
    ];
    const bytes = tlv([0x10, 0x0e], credential);
    return Ndef.record(Ndef.TNF_MIME_MEDIA, Ndef.MIME_WFA_WSC, [], bytes);
  }

  buildLocationRecord(payload: NfcPayload): NdefRecord {
    if (payload.latitude && payload.longitude) {
      const label = payload.label ? `?q=${encodeURIComponent(payload.label)}` : '';
      return this.buildUrlRecord(`geo:${payload.latitude},${payload.longitude}${label}`);
    }
    return this.buildUrlRecord(mapsUrl(payload.address ?? payload.label ?? ''));
  }

  /** Registros com conteúdo: o record vazio (TNF 0) deixado por "Apagar" conta como tag vazia. */
  parseContent(records: NdefRecord[]): ParsedRecord[] {
    return records.filter((record) => Number(record.tnf) !== Ndef.TNF_EMPTY).map((record) => this.parseRecord(record));
  }

  parseRecord(record: NdefRecord): ParsedRecord {
    if (Ndef.isType(record, Ndef.TNF_MIME_MEDIA, Ndef.MIME_WFA_WSC)) {
      return this.parseWifiRecord(record);
    }
    if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) {
      return this.parseUriRecord(record);
    }
    if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) {
      return this.parseTextRecord(record);
    }
    const normalized = normalizeRecord(record);
    const raw = bytesToString(normalized.payload);
    if (normalized.tnf === Ndef.TNF_EXTERNAL_TYPE && normalized.type === AAR_TYPE) {
      return recordOf('LINK_APP', 'App Android', raw, raw, { contentType: 'LINK_APP', androidPackage: raw });
    }
    if (normalized.tnf === Ndef.TNF_EMPTY) {
      return recordOf('CUSTOM', 'Vazio', '', '', { contentType: 'CUSTOM', text: '' });
    }
    if (normalized.tnf === Ndef.TNF_MIME_MEDIA) {
      return recordOf('CUSTOM', normalized.type, raw, raw, { contentType: 'CUSTOM', text: raw, mimeType: normalized.type });
    }
    return recordOf('CUSTOM', 'Personalizado', raw, raw, { contentType: 'CUSTOM', text: raw });
  }

  /** Conteúdo da tag não é confiável: marca a URL de risco para a UI avisar em vez de abrir. */
  parseUriRecord(record: NdefRecord): ParsedRecord {
    const url = Ndef.uri.decodePayload(Uint8Array.from(asBytes(record.payload)));
    const parsed = this.parseUri(url);
    const safety = assessUrl(url);
    return safety.suspicious ? { ...parsed, isSuspicious: true, suspiciousReasons: safety.reasons } : parsed;
  }

  private parseUri(url: string): ParsedRecord {
    const contentType = detectContentType(url);
    if (contentType === 'WHATSAPP') {
      const parsed = new URL(url);
      const phone = parsed.pathname.replace(/\//g, '');
      const message = parsed.searchParams.get('text') ?? undefined;
      return recordOf('WHATSAPP', 'WhatsApp', phone, url, { contentType: 'WHATSAPP', phone, message });
    }
    if (contentType === 'PHONE') {
      const phone = url.replace(/^tel:/i, '');
      return recordOf('PHONE', 'Telefone', phone, url, { contentType: 'PHONE', phone });
    }
    if (contentType === 'EMAIL') {
      const parsed = new URL(url);
      const email = decodeURIComponent(parsed.pathname);
      return recordOf('EMAIL', 'E-mail', email, url, {
        contentType: 'EMAIL',
        email,
        subject: parsed.searchParams.get('subject') ?? undefined,
        body: parsed.searchParams.get('body') ?? undefined,
      });
    }
    if (contentType === 'LOCATION') {
      const geo = url.replace(/^geo:/i, '').split('?')[0] ?? '';
      const [latitude, longitude] = geo.split(',');
      return recordOf('LOCATION', 'Localização', geo, url, { contentType: 'LOCATION', latitude, longitude });
    }
    return recordOf('URL', 'Website', url, url, { contentType: 'URL', url });
  }

  parseTextRecord(record: NdefRecord): ParsedRecord {
    const text = Ndef.text.decodePayload(Uint8Array.from(asBytes(record.payload)));
    if (isCustomCardVCard(text)) {
      return this.parseCustomCardRecord(text);
    }
    if (text.includes('BEGIN:VCARD')) {
      return this.parseVCard(text);
    }
    return recordOf('TEXT', 'Texto', text, text, { contentType: 'TEXT', text });
  }

  parseCustomCardRecord(text: string): ParsedRecord {
    const parsed = parseCustomCard(text);
    const summary = parsed.cardFields.map((field) => `${field.label}: ${field.value}`).join(' · ');
    return recordOf('CUSTOM', parsed.cardTitle || 'Cartão personalizado', summary || parsed.cardTitle, text, {
      contentType: 'CUSTOM',
      cardTitle: parsed.cardTitle,
      cardFields: parsed.cardFields,
      text: summary,
    });
  }

  parseVCard(text: string): ParsedRecord {
    const field = (name: string) => text.match(new RegExp(`^${name}:(.*)$`, 'm'))?.[1]?.trim();
    const data: NfcPayload = {
      contentType: 'VCARD',
      fullName: field('FN'),
      phone: field('TEL'),
      email: field('EMAIL'),
      company: field('ORG'),
      jobTitle: field('TITLE'),
      website: field('URL'),
      address: field('ADR'),
    };
    return recordOf('VCARD', 'Cartão de visita', data.fullName ?? 'vCard', text, data);
  }

  parseWifiRecord(record: NdefRecord): ParsedRecord {
    let bytes = asBytes(record.payload);
    let ssid = '';
    let password = '';
    let security: WifiSecurity = 'WPA2';
    const read = (buffer: number[]) => {
      while (buffer.length >= 4) {
        const type = buffer.slice(0, 2);
        const length = (buffer[2] ?? 0) * 256 + (buffer[3] ?? 0);
        const value = buffer.slice(4, 4 + length);
        buffer = buffer.slice(4 + length);
        if (type[0] === 0x10 && type[1] === 0x0e) {
          read(value);
        } else if (type[0] === 0x10 && type[1] === 0x45) {
          ssid = bytesToString(value);
        } else if (type[0] === 0x10 && type[1] === 0x27) {
          password = bytesToString(value);
        } else if (type[0] === 0x10 && type[1] === 0x03) {
          security = securityFromBytes(value);
        }
      }
    };
    read(bytes);
    return recordOf('WIFI', 'Wi-Fi', ssid, ssid, {
      contentType: 'WIFI',
      ssid,
      password,
      security,
    });
  }

  calculateMessageSize(records: NdefRecord[]): number {
    const encoded = encodeRecords(records);
    const tlvOverhead = encoded.length < 255 ? 2 : 4;
    return encoded.length + tlvOverhead;
  }
}

function securityFromBytes(value: number[]): WifiSecurity {
  const code = ((value[0] ?? 0) << 8) + (value[1] ?? 0);
  if (code === 0x0001 || code === 0x0000) {
    return 'nopass';
  }
  if (code === 0x0004) {
    return 'WEP';
  }
  if (code === 0x0002) {
    return 'WPA';
  }
  if (code === 0x0040) {
    return 'WPA3';
  }
  return 'WPA2';
}

export const ndefEngine = new NdefEngine();
