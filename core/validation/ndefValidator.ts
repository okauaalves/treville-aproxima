import type { NdefRecord } from 'react-native-nfc-manager';

import { Ndef } from '@/core/nfc/nfcNative';

export function validateNdefRecords(records: NdefRecord[]): { ok: boolean; error?: string } {
  if (!Array.isArray(records) || records.length === 0) {
    return { ok: false, error: 'A mensagem NDEF está vazia.' };
  }
  for (const record of records) {
    if (typeof record.tnf !== 'number' || record.type == null || record.payload == null) {
      return { ok: false, error: 'Registro NDEF inválido.' };
    }
  }
  try {
    Ndef.encodeMessage(records);
  } catch {
    return { ok: false, error: 'Não foi possível codificar a mensagem NDEF.' };
  }
  return { ok: true };
}
