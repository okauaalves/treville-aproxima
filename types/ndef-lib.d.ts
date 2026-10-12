declare module 'react-native-nfc-manager/ndef-lib' {
  import type { NdefRecord } from 'react-native-nfc-manager';

  interface NdefLibrary {
    TNF_EMPTY: 0x0;
    TNF_WELL_KNOWN: 0x01;
    TNF_MIME_MEDIA: 0x02;
    TNF_ABSOLUTE_URI: 0x03;
    TNF_EXTERNAL_TYPE: 0x04;
    RTD_TEXT: string;
    RTD_URI: string;
    MIME_WFA_WSC: string;
    textRecord: (text: string, lang?: string) => NdefRecord;
    uriRecord: (uri: string) => NdefRecord;
    record: (tnf: number, type: string, id: number[] | string, payload: number[]) => NdefRecord;
    encodeMessage: (records: NdefRecord[]) => number[];
    decodeMessage: (bytes: number[]) => NdefRecord[];
    isType: (record: NdefRecord, tnf: number, type: string) => boolean;
    text: { decodePayload: (data: Uint8Array) => string };
    uri: { decodePayload: (data: Uint8Array) => string };
    util: { stringToBytes: (value: string) => number[]; bytesToString: (bytes: number[]) => string };
  }

  const ndef: NdefLibrary;
  export default ndef;
}
