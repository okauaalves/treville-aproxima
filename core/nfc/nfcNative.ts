import { Platform } from 'react-native';
import NdefLib from 'react-native-nfc-manager/ndef-lib';
import type { NdefRecord, TagEvent } from 'react-native-nfc-manager';

import { isExpoGo } from '@/core/platform/expoGo';

export const Ndef = NdefLib;
export type { NdefRecord, TagEvent };

export const NfcTech = {
  Ndef: 'Ndef',
  NfcA: 'NfcA',
  NfcB: 'NfcB',
  NfcF: 'NfcF',
  NfcV: 'NfcV',
  IsoDep: 'IsoDep',
  MifareClassic: 'MifareClassic',
  MifareUltralight: 'MifareUltralight',
  NdefFormatable: 'NdefFormatable',
} as const;

export const NfcEvents = {
  DiscoverTag: 'NfcManagerDiscoverTag',
  SessionClosed: 'NfcManagerSessionClosed',
} as const;

export const NdefStatus = {
  NotSupported: 1,
  ReadWrite: 2,
  ReadOnly: 3,
} as const;

type NativeModule = {
  start: () => Promise<void>;
  isSupported: () => Promise<boolean>;
  isEnabled: () => Promise<boolean>;
  requestTechnology: (techs: string[], options?: { alertMessage?: string }) => Promise<void>;
  cancelTechnologyRequest: (options?: { throwOnError?: boolean }) => Promise<void>;
  getTag: () => Promise<TagEvent | null>;
  ndefHandler: {
    getNdefStatus: () => Promise<{ status: number }>;
    writeNdefMessage: (bytes: number[], options?: { reconnectAfterWrite?: boolean }) => Promise<void>;
    makeReadOnly: () => Promise<void>;
  };
  setEventListener: (event: string, handler: unknown) => void;
  registerTagEvent: (options?: { invalidateAfterFirstRead?: boolean; isReaderModeEnabled?: boolean }) => Promise<void>;
  unregisterTagEvent: () => Promise<void>;
  goToNfcSetting: () => Promise<boolean>;
};

let cached: NativeModule | null | undefined;

/** O módulo nativo só é carregado fora do Expo Go e da web. */
export function loadNativeNfc(): NativeModule | null {
  if (cached !== undefined) {
    return cached;
  }
  if (Platform.OS === 'web' || isExpoGo()) {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga tardia para o Expo Go não executar o módulo nativo
    const loaded = require('react-native-nfc-manager') as { default?: NativeModule };
    cached = loaded.default ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

export const nativeAvailable = Platform.OS !== 'web' && !isExpoGo();
export const nativeNfc = nativeAvailable ? loadNativeNfc() : null;
