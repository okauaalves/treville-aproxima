import NfcManager, {
  Ndef,
  NdefStatus,
  NfcEvents,
  NfcTech,
  type NdefRecord,
  type TagEvent,
} from 'react-native-nfc-manager';

export const nativeAvailable = true;
export const nativeNfc = NfcManager;
export { Ndef, NdefStatus, NfcEvents, NfcTech };
export type { NdefRecord, TagEvent };
