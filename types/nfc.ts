import type { NdefRecord } from 'react-native-nfc-manager';

import type { NfcErrorCode } from '@/core/nfc/errors';
import type { ContentType } from '@/theme/colors';

export type { ContentType };

export type NfcTagType =
  | 'NTAG213'
  | 'NTAG215'
  | 'NTAG216'
  | 'MIFARE_ULTRALIGHT'
  | 'MIFARE_CLASSIC'
  | 'ISO15693'
  | 'ISO14443_4'
  | 'FELICA'
  | 'NFC_B'
  | 'UNKNOWN';

export type TagModel = NfcTagType;

export type WifiSecurity = 'WPA' | 'WPA2' | 'WPA3' | 'WEP' | 'nopass';

export interface TagCapabilities {
  canRead: boolean;
  canWrite: boolean;
  canFormat: boolean;
  canLock: boolean;
  canPasswordProtect: boolean;
  supportsNdef: boolean;
  isReadOnly: boolean;
  capacity: number;
  usedSpace: number;
  availableSpace: number;
  platformLimited: boolean;
}

export interface NfcTag {
  uid: string;
  type: NfcTagType;
  capacity: number;
  usedSpace: number;
  availableSpace: number;
  technologies: string[];
  capabilities: TagCapabilities;
  ndefRecords: NdefRecord[];
  rawTag: unknown;
}

export interface VCardData {
  fullName: string;
  phone?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  website?: string;
}

export interface WifiData {
  ssid: string;
  password?: string;
  security: WifiSecurity;
}

export interface CardField {
  label: string;
  value: string;
}

export interface WritePayload {
  contentType: ContentType;
  url?: string;
  cardTitle?: string;
  cardIcon?: string;
  cardColor?: string;
  cardFields?: CardField[];
  phone?: string;
  message?: string;
  includeCountryCode?: boolean;
  email?: string;
  subject?: string;
  body?: string;
  fullName?: string;
  company?: string;
  jobTitle?: string;
  website?: string;
  ssid?: string;
  password?: string;
  security?: WifiSecurity;
  latitude?: string;
  longitude?: string;
  label?: string;
  address?: string;
  text?: string;
  appUri?: string;
  /** Android Application Record (abre o app pelo pacote). */
  androidPackage?: string;
  /** Registro MIME livre (modo avançado): grava `text` com este tipo MIME. */
  mimeType?: string;
  eventTitle?: string;
  eventStart?: string;
}

export type NfcPayload = WritePayload;

export interface WriteOptions {
  lockAfterWrite: boolean;
  generateQr: boolean;
  saveAsTemplate: boolean;
  templateName: string;
}

export const emptyWriteOptions: WriteOptions = {
  lockAfterWrite: false,
  generateQr: false,
  saveAsTemplate: false,
  templateName: '',
};

export interface ParsedRecord {
  contentType: ContentType;
  displayTitle: string;
  displayValue: string;
  rawValue: string;
  data: WritePayload;
  /** URL de risco (javascript:, data:, intent:, download de .apk/.exe, punycode). Nunca abrir sem aviso. */
  isSuspicious?: boolean;
  suspiciousReasons?: string[];
}

export interface ReadResult {
  tag: NfcTag;
  records: ParsedRecord[];
  rawMessage: NdefRecord[];
  success: boolean;
  operationId?: string;
  error?: string;
}

export interface RawReadResult {
  tag: NfcTag;
  rawMessage: NdefRecord[];
  records: ParsedRecord[];
}

export type StepStatus = 'pending' | 'active' | 'success' | 'error';
export type WriteStepId = 'prepare' | 'detect' | 'write' | 'reread' | 'interpret' | 'compare' | 'confirm';

export interface WriteStep {
  id: WriteStepId;
  label: string;
  status: StepStatus;
}

export interface CompareResult {
  recordCountMatch: boolean;
  contentTypeMatch: boolean;
  mainValueMatch: boolean;
  fieldsMatch: boolean;
  allPassed: boolean;
}

export interface VerificationResult {
  passed: boolean;
  integrityPercent: number;
  details: CompareResult;
  readAfterWrite: ParsedRecord[];
  error?: string;
}

export interface WriteFlowResult {
  success: boolean;
  tag?: NfcTag | null;
  integrityPercent: number;
  operationId?: string;
  errorCode?: NfcErrorCode;
  qrValue?: string | null;
}

export type NfcSimulationKind = 'default' | 'unsupported' | 'locked' | 'empty' | 'rfid' | 'suspicious';
