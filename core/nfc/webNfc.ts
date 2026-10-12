import { Ndef } from '@/core/nfc/nfcNative';
import type { NdefRecord } from 'react-native-nfc-manager';

/** Tipos do Web NFC (NDEFReader). Sem `any`. */
export interface WebNdefRecord {
  recordType: string;
  mediaType?: string;
  id?: string;
  data?: BufferSource;
  encoding?: string;
  lang?: string;
}

export interface WebNdefMessage {
  records: WebNdefRecord[];
}

export interface WebNdefReadingEvent {
  serialNumber: string;
  message: WebNdefMessage;
}

export interface WebNdefReader {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  write: (message: WebNdefMessage, options?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((event: WebNdefReadingEvent) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
}

interface NdefReaderConstructor {
  new (): WebNdefReader;
}

function readerConstructor(): NdefReaderConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const candidate = (window as unknown as { NDEFReader?: NdefReaderConstructor }).NDEFReader;
  return candidate ?? null;
}

export function isWebNfcSupported(): boolean {
  return readerConstructor() !== null && typeof window !== 'undefined' && window.isSecureContext === true;
}

export function webNfcUnavailableReason(): string {
  if (typeof window === 'undefined') {
    return 'NFC não disponível neste dispositivo/navegador.';
  }
  if (!readerConstructor()) {
    return 'Este navegador não tem Web NFC. Use o Chrome no Android.';
  }
  if (!window.isSecureContext) {
    return 'O Web NFC exige uma página segura (HTTPS).';
  }
  return 'NFC não disponível neste dispositivo/navegador.';
}

function bytesOf(data?: BufferSource): number[] {
  if (!data) {
    return [];
  }
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return Array.from(bytes);
}

function textOf(data?: BufferSource): string {
  if (!data) {
    return '';
  }
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new TextDecoder().decode(bytes);
}

function toNdef(records: WebNdefRecord[]): NdefRecord[] {
  return records.map((record) => {
    const value = textOf(record.data);
    if (record.recordType === 'url' || record.recordType === 'absolute-url') {
      return Ndef.uriRecord(value) as NdefRecord;
    }
    if (record.recordType === 'text') {
      return Ndef.textRecord(value, record.lang ?? 'pt') as NdefRecord;
    }
    if (record.recordType === 'mime' && record.mediaType) {
      return Ndef.record(Ndef.TNF_MIME_MEDIA, record.mediaType, [], bytesOf(record.data)) as NdefRecord;
    }
    if (record.recordType === 'empty') {
      return Ndef.record(Ndef.TNF_EMPTY, '', [], []) as NdefRecord;
    }
    if (record.recordType.includes(':')) {
      return Ndef.record(Ndef.TNF_EXTERNAL_TYPE, record.recordType, [], bytesOf(record.data)) as NdefRecord;
    }
    return Ndef.textRecord(value || record.recordType, 'pt') as NdefRecord;
  });
}

function toWeb(bytes: number[]): WebNdefRecord[] {
  const decoded = Ndef.decodeMessage(bytes) as NdefRecord[];
  return decoded.map((record) => {
    if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) {
      const url = Ndef.uri.decodePayload(Uint8Array.from(Array.isArray(record.payload) ? record.payload : []));
      return { recordType: 'url', data: new TextEncoder().encode(String(url)) };
    }
    if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) {
      const text = Ndef.text.decodePayload(Uint8Array.from(Array.isArray(record.payload) ? record.payload : []));
      return { recordType: 'text', lang: 'pt', encoding: 'utf-8', data: new TextEncoder().encode(String(text)) };
    }
    const raw = Uint8Array.from(Array.isArray(record.payload) ? record.payload : []);
    const type = typeof record.type === 'string' ? record.type : String.fromCharCode(...(record.type ?? []));
    if (record.tnf === Ndef.TNF_EMPTY) {
      return { recordType: 'empty' };
    }
    if (record.tnf === Ndef.TNF_MIME_MEDIA && type) {
      return { recordType: 'mime', mediaType: type, data: raw };
    }
    if (record.tnf === Ndef.TNF_EXTERNAL_TYPE && type.includes(':')) {
      return { recordType: type, data: raw };
    }
    const payload = Array.isArray(record.payload) ? String.fromCharCode(...record.payload) : '';
    return { recordType: 'text', lang: 'pt', data: new TextEncoder().encode(payload) };
  });
}

export interface WebTagSnapshot {
  id: string;
  ndefMessage: NdefRecord[];
  techTypes: string[];
  maxSize: number;
  isWritable: boolean;
}

/**
 * Adaptador Web NFC. A gravação não confirma sozinha: o próximo scan é uma leitura nova para comparar.
 */
export class WebNfcAdapter {
  private abort: AbortController | null = null;
  private current: WebTagSnapshot | null = null;

  async requestTechnology(timeoutMs: number): Promise<void> {
    const Ctor = readerConstructor();
    if (!Ctor || !isWebNfcSupported()) {
      throw new Error(webNfcUnavailableReason());
    }
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    const reader = new Ctor();
    try {
      const reading = new Promise<WebNdefReadingEvent>((resolve, reject) => {
        reader.onreading = (event) => resolve(event);
        reader.onreadingerror = () => reject(new Error('Falha ao ler a tag.'));
        abort.signal.addEventListener('abort', () => reject(new Error('timeout')));
      });
      await reader.scan({ signal: abort.signal });
      const event = await reading;
      this.current = {
        id: event.serialNumber,
        ndefMessage: toNdef(event.message.records),
        techTypes: ['Ndef'],
        maxSize: 0,
        isWritable: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  getTag(): WebTagSnapshot | null {
    return this.current;
  }

  async write(bytes: number[], timeoutMs: number): Promise<void> {
    const Ctor = readerConstructor();
    if (!Ctor) {
      throw new Error(webNfcUnavailableReason());
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const reader = new Ctor();
      await reader.write({ records: toWeb(bytes) }, { signal: abort.signal });
      this.current = null;
    } finally {
      clearTimeout(timer);
    }
  }

  async cancel(): Promise<void> {
    this.abort?.abort();
    this.abort = null;
  }

  async register(onTag: (tag: WebTagSnapshot) => void, onError?: (error: Error) => void): Promise<void> {
    const Ctor = readerConstructor();
    if (!Ctor || !isWebNfcSupported()) {
      throw new Error(webNfcUnavailableReason());
    }
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const reader = new Ctor();
    reader.onreading = (event) => {
      const tag: WebTagSnapshot = {
        id: event.serialNumber,
        ndefMessage: toNdef(event.message.records),
        techTypes: ['Ndef'],
        maxSize: 0,
        isWritable: true,
      };
      this.current = tag;
      onTag(tag);
    };
    reader.onreadingerror = () => onError?.(new Error('Falha ao ler a tag.'));
    await reader.scan({ signal: abort.signal });
  }

  async unregister(): Promise<void> {
    await this.cancel();
  }
}

export const webNfc = new WebNfcAdapter();
