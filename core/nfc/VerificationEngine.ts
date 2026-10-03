import { ndefEngine } from '@/core/nfc/NdefEngine';
import { nfcReader } from '@/core/nfc/NfcReader';
import type { CompareResult, NfcPayload, ParsedRecord, RawReadResult, VerificationResult } from '@/types/nfc';

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    let path = url.pathname.replace(/\/$/, '');
    if (path === '') {
      path = '';
    }
    const search = url.search;
    return `${url.protocol}//${url.host}${path}${search}`;
  } catch {
    return value.trim().replace(/\/$/, '').toLowerCase();
  }
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function mainValue(record: ParsedRecord): string {
  const data = record.data;
  switch (record.contentType) {
    case 'URL':
    case 'LINK_APP':
      return normalizeUrl(data.url ?? data.appUri ?? record.rawValue);
    case 'WHATSAPP':
      return normalizePhone(data.phone ?? '');
    case 'PHONE':
      return normalizePhone(data.phone ?? '');
    case 'EMAIL':
      return (data.email ?? '').trim().toLowerCase();
    case 'WIFI':
      return (data.ssid ?? '').trim();
    case 'TEXT':
    case 'CUSTOM':
    case 'EVENT':
      return (data.text ?? data.eventTitle ?? '').trim();
    case 'VCARD':
      return (data.fullName ?? '').trim().toLowerCase();
    case 'LOCATION':
      return `${data.latitude ?? ''},${data.longitude ?? ''}` || (data.address ?? '');
    default:
      return record.rawValue.trim();
  }
}

function fieldsMatch(expected: ParsedRecord, actual: ParsedRecord): boolean {
  if (expected.contentType === 'VCARD') {
    const keys: (keyof NfcPayload)[] = ['fullName', 'phone', 'email', 'company', 'jobTitle', 'website', 'address'];
    return keys.every((key) => (expected.data[key] ?? '') === (actual.data[key] ?? ''));
  }
  if (expected.contentType === 'WIFI') {
    return expected.data.ssid === actual.data.ssid && expected.data.security === actual.data.security;
  }
  return true;
}

export class VerificationEngine {
  compare(expected: ParsedRecord[], actual: ParsedRecord[]): CompareResult {
    const recordCountMatch = expected.length === actual.length && expected.length > 0;
    const contentTypeMatch =
      recordCountMatch && expected.every((record, index) => record.contentType === actual[index]?.contentType);
    const mainValueMatch =
      contentTypeMatch &&
      expected.every((record, index) => mainValue(record) === mainValue(actual[index] as ParsedRecord));
    const fields =
      mainValueMatch &&
      expected.every((record, index) => fieldsMatch(record, actual[index] as ParsedRecord));
    return {
      recordCountMatch,
      contentTypeMatch,
      mainValueMatch,
      fieldsMatch: fields,
      allPassed: recordCountMatch && contentTypeMatch && mainValueMatch && fields,
    };
  }

  calculateIntegrity(details: CompareResult): number {
    if (details.allPassed) {
      return 100;
    }
    if (details.mainValueMatch && details.contentTypeMatch) {
      return 75;
    }
    if (details.contentTypeMatch || details.mainValueMatch) {
      return 50;
    }
    return 0;
  }

  comparePayload(payload: NfcPayload, actual: ParsedRecord[]): CompareResult {
    const expected = ndefEngine.buildMessage(payload).map((record) => ndefEngine.parseRecord(record));
    return this.compare(expected, actual);
  }

  async verify(originalPayload: NfcPayload, alreadyRead?: ParsedRecord[]): Promise<VerificationResult> {
    if (!alreadyRead) {
      await delay(400);
    }
    let readAfterWrite: RawReadResult | null = null;
    try {
      if (!alreadyRead) {
        readAfterWrite = await nfcReader.readRaw();
      }
      const actual = alreadyRead ?? readAfterWrite?.records ?? [];
      const details = this.comparePayload(originalPayload, actual);
      const integrityPercent = this.calculateIntegrity(details);
      return {
        passed: integrityPercent >= 90,
        integrityPercent,
        details,
        readAfterWrite: actual,
      };
    } catch (error) {
      const empty = this.compare([], []);
      return {
        passed: false,
        integrityPercent: 0,
        details: empty,
        readAfterWrite: alreadyRead ?? readAfterWrite?.records ?? [],
        error: error instanceof Error ? error.message : 'Falha na verificação',
      };
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const verificationEngine = new VerificationEngine();
