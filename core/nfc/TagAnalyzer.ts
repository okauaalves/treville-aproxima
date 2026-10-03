import type { NdefRecord } from 'react-native-nfc-manager';

import { capabilityDetector, detectModel } from '@/core/nfc/CapabilityDetector';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import type { NfcTag, NfcTagType } from '@/types/nfc';

export function formatUid(id: unknown): string {
  if (id == null) {
    return '';
  }
  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (trimmed.includes(':')) {
      return trimmed
        .split(':')
        .filter((part) => part.length > 0)
        .map((part) => part.padStart(2, '0').toUpperCase())
        .join(':');
    }
    const hex = trimmed.replace(/[^0-9a-f]/gi, '');
    return (hex.match(/.{1,2}/g) ?? []).map((part) => part.toUpperCase()).join(':');
  }
  if (id instanceof Uint8Array || Array.isArray(id)) {
    return Array.from(id as ArrayLike<number>)
      .map((byte) => Number(byte).toString(16).padStart(2, '0').toUpperCase())
      .join(':');
  }
  return '';
}

export function readCapacity(raw: unknown): number {
  if (!raw || typeof raw !== 'object') {
    return 0;
  }
  const tag = raw as { maxSize?: unknown; ndefMessage?: unknown };
  if (typeof tag.maxSize === 'number') {
    return tag.maxSize;
  }
  if (tag.ndefMessage && typeof tag.ndefMessage === 'object' && !Array.isArray(tag.ndefMessage)) {
    const nested = (tag.ndefMessage as { maxSize?: unknown }).maxSize;
    if (typeof nested === 'number') {
      return nested;
    }
  }
  return 0;
}

export function readNdefRecords(raw: unknown): NdefRecord[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const ndef = (raw as { ndefMessage?: unknown }).ndefMessage;
  if (Array.isArray(ndef)) {
    return ndef as NdefRecord[];
  }
  if (ndef && typeof ndef === 'object' && Array.isArray((ndef as { records?: unknown }).records)) {
    return (ndef as { records: NdefRecord[] }).records;
  }
  return [];
}

export function getTechnologies(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const techTypes = (raw as { techTypes?: unknown }).techTypes;
  if (!Array.isArray(techTypes)) {
    return [];
  }
  return techTypes.filter((item): item is string => typeof item === 'string').map((tech) => tech.split('.').pop() ?? tech);
}

export function calculateUsedSpace(records: NdefRecord[]): number {
  if (records.length === 0) {
    return 0;
  }
  const body = records.reduce((sum, record) => {
    const payload = Array.isArray(record.payload) ? record.payload.length : 0;
    const type = Array.isArray(record.type) ? record.type.length : typeof record.type === 'string' ? record.type.length : 0;
    return sum + payload + type + 4;
  }, 0);
  try {
    return Math.max(body, ndefEngine.calculateMessageSize(records));
  } catch {
    return body;
  }
}

export class TagAnalyzer {
  analyze(rawTag: unknown): NfcTag {
    const records = readNdefRecords(rawTag);
    const capacity = readCapacity(rawTag);
    const source = rawTag && typeof rawTag === 'object' ? { ...(rawTag as object), maxSize: capacity, ndefMessage: records } : { maxSize: capacity, ndefMessage: records };
    const usedSpace = calculateUsedSpace(records);
    const capabilities = capabilityDetector.detect(source, usedSpace);
    const type = this.detectTagType(source);
    return {
      uid: formatUid((rawTag as { id?: unknown } | null)?.id),
      type,
      capacity: capabilities.capacity || capacity,
      usedSpace,
      availableSpace: Math.max(0, (capabilities.capacity || capacity) - usedSpace),
      technologies: getTechnologies(rawTag),
      capabilities: { ...capabilities, usedSpace, availableSpace: Math.max(0, (capabilities.capacity || capacity) - usedSpace) },
      ndefRecords: records,
      rawTag,
    };
  }

  detectTagType(rawTag: unknown): NfcTagType {
    return detectModel({
      ...(typeof rawTag === 'object' && rawTag ? (rawTag as object) : {}),
      maxSize: readCapacity(rawTag),
      ndefMessage: readNdefRecords(rawTag),
    });
  }

  formatUid(id: unknown): string {
    return formatUid(id);
  }
}

export const tagAnalyzer = new TagAnalyzer();
