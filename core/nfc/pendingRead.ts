import type { NfcTag, ParsedRecord } from '@/types/nfc';

let pending: { tag: NfcTag; records: ParsedRecord[] } | null = null;

export function setPendingRead(tag: NfcTag, records: ParsedRecord[]): void {
  pending = { tag, records };
}

export function getPendingRead(): { tag: NfcTag; records: ParsedRecord[] } | null {
  return pending;
}
