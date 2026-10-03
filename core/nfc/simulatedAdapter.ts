import type { NdefRecord, TagEvent } from 'react-native-nfc-manager';

import { Ndef, NfcTech } from '@/core/nfc/nfcNative';
import type { NfcSimulationKind } from '@/types/nfc';

export type SimTag = TagEvent & { isWritable?: boolean };

type Pending = {
  resolve: (tag: SimTag) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function buildSimulatedTag(kind: NfcSimulationKind): SimTag {
  if (kind === 'unsupported') {
    return {
      id: 'AABBCCDD',
      techTypes: ['android.nfc.tech.NfcA'],
      ndefMessage: [],
      isWritable: false,
    };
  }
  if (kind === 'locked') {
    return {
      id: '04A2B3C4D5',
      maxSize: 144,
      type: 'NTAG213',
      techTypes: ['android.nfc.tech.NfcA', 'android.nfc.tech.MifareUltralight', 'android.nfc.tech.Ndef'],
      ndefMessage: [Ndef.textRecord('bloqueada', 'pt')],
      isWritable: false,
    };
  }
  return {
    id: '04A2B3C4D5E6',
    maxSize: 144,
    type: 'NTAG213',
    techTypes: ['android.nfc.tech.NfcA', 'android.nfc.tech.MifareUltralight', 'android.nfc.tech.Ndef'],
    ndefMessage: kind === 'empty' ? [] : [Ndef.uriRecord('https://wa.me/5599999999999?text=Ol%C3%A1!%20Gostaria%20de%20saber%20mais%20informa%C3%A7%C3%B5es.')],
    isWritable: true,
  };
}

export class SimulatedNfcAdapter {
  private listener: ((tag: SimTag) => void) | null = null;
  private errorListener: ((error: Error) => void) | null = null;
  private pending: Pending | null = null;
  private current: SimTag = buildSimulatedTag('empty');
  private presented = false;
  sessionOpen = false;

  simulate(kind: NfcSimulationKind): void {
    this.current = buildSimulatedTag(kind);
    this.presented = true;
    this.listener?.(this.current);
    if (this.pending) {
      clearTimeout(this.pending.timer);
      const resolve = this.pending.resolve;
      this.pending = null;
      this.sessionOpen = true;
      resolve(this.current);
    }
  }

  async requestTechnology(timeoutMs: number): Promise<void> {
    if (this.sessionOpen) {
      return;
    }
    if (this.presented) {
      this.sessionOpen = true;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error('timeout'));
      }, timeoutMs);
      this.pending = {
        resolve: () => resolve(),
        reject,
        timer,
      };
    });
  }

  async cancel(): Promise<void> {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('cancelled'));
      this.pending = null;
    }
    this.sessionOpen = false;
    this.listener = null;
    this.errorListener = null;
  }

  getTag(): SimTag {
    return this.current;
  }

  register(onTag: (tag: SimTag) => void, onError?: (error: Error) => void): void {
    this.listener = onTag;
    this.errorListener = onError ?? null;
  }

  unregister(): void {
    this.listener = null;
    this.errorListener = null;
  }

  write(bytes: number[]): void {
    if (!this.current.isWritable) {
      throw new Error('Tag is not writable');
    }
    const records = bytes.length === 0 ? [] : Ndef.decodeMessage(bytes);
    const size = bytes.length + 2;
    if ((this.current.maxSize ?? 0) > 0 && size > (this.current.maxSize ?? 0)) {
      throw new Error('Tag size too small');
    }
    this.current = { ...this.current, ndefMessage: records as NdefRecord[] };
  }

  fail(error: Error): void {
    this.errorListener?.(error);
  }
}

export const simulatedNfc = new SimulatedNfcAdapter();

export const simulatedTech = NfcTech.Ndef;
