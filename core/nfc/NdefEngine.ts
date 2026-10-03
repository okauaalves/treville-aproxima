import type { NdefRecord } from 'react-native-nfc-manager';

import type { ContentType } from '@/theme/colors';

import { Ndef } from '@/core/nfc/nfcNative';
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

/**
 * Números BR sem DDI: 10 dígitos (DDD + 8) ou 11 (DDD + 9) recebem o prefixo 55.
 * Se já começa com 55 e tem 12+ dígitos, permanece.
 */
export function cleanPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
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
        return [this.buildUrlRecord(payload.appUri ?? '')];
      case 'EVENT':
        return [this.buildTextRecord(`${payload.eventTitle ?? 'Evento'} ${payload.eventStart ?? ''}`.trim())];
      default:
        return [this.buildTextRecord(payload.text ?? payload.url ?? '')];
    }
  }

  buildUrlRecord(url: string): NdefRecord {
    return Ndef.uriRecord(url.trim());
  }

  buildTextRecord(text: string): NdefRecord {
    return Ndef.textRecord(text, 'pt');
  }

  buildWhatsAppRecord(phone: string, message?: string): NdefRecord {
    const clean = cleanPhone(phone);
    const text = message ? `?text=${encodeURIComponent(message)}` : '';
    return this.buildUrlRecord(`https://wa.me/${clean}${text}`);
  }

  buildPhoneRecord(phone: string, includeCountryCode = false): NdefRecord {
    const digits = includeCountryCode ? cleanPhone(phone) : phone.replace(/\D/g, '');
    return this.buildUrlRecord(`tel:+${digits}`);
  }

  buildEmailRecord(address: string, subject?: string, body?: string): NdefRecord {
    const params = new URLSearchParams();
    if (subject) {
      params.set('subject', subject);
    }
    if (body) {
      params.set('body', body);
    }
    const query = params.toString();
    return this.buildUrlRecord(`mailto:${address.trim()}${query ? `?${query}` : ''}`);
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
    const query = encodeURIComponent(payload.address ?? payload.label ?? '');
    return this.buildUrlRecord(`https://maps.google.com/?q=${query}`);
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
    const raw = bytesToString(asBytes(record.payload));
    return recordOf('CUSTOM', 'Personalizado', raw, raw, { contentType: 'CUSTOM', text: raw });
  }

  parseUriRecord(record: NdefRecord): ParsedRecord {
    const url = Ndef.uri.decodePayload(Uint8Array.from(asBytes(record.payload)));
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
    if (text.includes('BEGIN:VCARD')) {
      return this.parseVCard(text);
    }
    return recordOf('TEXT', 'Texto', text, text, { contentType: 'TEXT', text });
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
    const encoded = Ndef.encodeMessage(records);
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
