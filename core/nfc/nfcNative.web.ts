import type { NdefRecord, TagEvent } from 'react-native-nfc-manager';

import NdefLib from 'react-native-nfc-manager/ndef-lib';

export const nativeAvailable = false;
export const nativeNfc = null;

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

export const Ndef = NdefLib;
export type { NdefRecord, TagEvent };
