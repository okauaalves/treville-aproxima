import type { NdefRecord } from 'react-native-nfc-manager';

import { AAR_TYPE, encodeRecords, normalizeRecord, type NormalizedRecord } from '@/core/nfc/NdefEngine';
import { Ndef } from '@/core/nfc/nfcNative';
import type { NfcTag, TagCapabilities } from '@/types/nfc';

export const UNAVAILABLE = 'Indisponível nesta plataforma';

export const TNF_NAMES: Record<number, string> = {
  0: 'Empty',
  1: 'NFC Forum Well-Known',
  2: 'MIME Media',
  3: 'Absolute URI',
  4: 'NFC Forum External',
  5: 'Unknown',
  6: 'Unchanged',
  7: 'Reserved',
};

export function tnfName(tnf: number): string {
  return TNF_NAMES[tnf] ?? `Desconhecido (${tnf})`;
}

export function toHex(bytes: ArrayLike<number>, separator = ' '): string {
  return Array.from(bytes)
    .map((byte) => (Number(byte) & 0xff).toString(16).padStart(2, '0').toUpperCase())
    .join(separator);
}

export interface TechInfo {
  key: string;
  label: string;
  standard: string;
}

const TECH_LABELS: Record<string, { label: string; standard: string }> = {
  Ndef: { label: 'NDEF', standard: 'NFC Forum NDEF' },
  NdefFormatable: { label: 'NDEF formatável', standard: 'Pode ser formatada como NDEF' },
  NfcA: { label: 'NFC-A', standard: 'ISO/IEC 14443-3A' },
  NfcB: { label: 'NFC-B', standard: 'ISO/IEC 14443-3B' },
  NfcF: { label: 'NFC-F (FeliCa)', standard: 'JIS X 6319-4' },
  NfcV: { label: 'NFC-V (vicinity)', standard: 'ISO/IEC 15693' },
  IsoDep: { label: 'ISO-DEP', standard: 'ISO/IEC 14443-4' },
  MifareClassic: { label: 'MIFARE Classic', standard: 'NXP MIFARE Classic' },
  MifareUltralight: { label: 'MIFARE Ultralight', standard: 'NXP Ultralight / NTAG' },
  NfcBarcode: { label: 'NFC Barcode', standard: 'Kovio NFC Barcode' },
};

export function techKey(tech: string): string {
  return tech.split('.').pop() ?? tech;
}

export function identifyTechnologies(techTypes: string[]): TechInfo[] {
  const seen = new Set<string>();
  const result: TechInfo[] = [];
  for (const raw of techTypes) {
    const key = techKey(raw);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const known = TECH_LABELS[key];
    result.push({ key, label: known?.label ?? key, standard: known?.standard ?? 'Tecnologia não catalogada' });
  }
  return result;
}

export type TagClass = 'ndef' | 'formatable' | 'rfid';

/** ndef: lê/grava conteúdo. formatable: pode virar NDEF (Android). rfid: só UID e tecnologias. */
export function classifyTag(techTypes: string[], supportsNdef: boolean): TagClass {
  const keys = techTypes.map(techKey);
  if (supportsNdef || keys.includes('Ndef')) {
    return 'ndef';
  }
  if (keys.includes('NdefFormatable')) {
    return 'formatable';
  }
  return 'rfid';
}

export interface RfidGuidance {
  title: string;
  message: string;
  possible: string[];
}

export function rfidGuidance(techTypes: string[]): RfidGuidance {
  const keys = techTypes.map(techKey);
  const possible = ['Ver o UID e as tecnologias do chip', 'Copiar ou exportar o relatório técnico', 'Usar o UID como identificador em automações (ex.: Tasker)'];
  let detail = 'O chip responde por rádio, mas não guarda conteúdo NDEF que o app consiga interpretar.';
  if (keys.includes('IsoDep')) {
    detail = 'Chip ISO 14443-4 (cartões de pagamento, transporte, documentos ou crachás inteligentes). O conteúdo é protegido por aplicações próprias e não é lido por este app.';
  } else if (keys.includes('NfcV')) {
    detail = 'Chip ISO 15693 (etiquetas de biblioteca, logística, alguns crachás). Sem NDEF, o conteúdo bruto não é interpretado.';
  } else if (keys.includes('NfcF')) {
    detail = 'Chip FeliCa (comum em cartões de transporte no Japão). O conteúdo usa sistemas proprietários.';
  } else if (keys.includes('MifareClassic')) {
    detail = 'MIFARE Classic com setores protegidos por chave. Muitos celulares nem conseguem ler esse chip.';
  }
  return {
    title: 'Tag RFID detectada — leitura de conteúdo não disponível neste tipo de tag',
    message: `${detail} Crachás de 125 kHz (HID Prox, EM4100) nem chegam a ser detectados por celulares: o NFC só opera em 13,56 MHz.`,
    possible,
  };
}

export interface RecordInfo {
  index: number;
  tnf: number;
  tnfName: string;
  type: string;
  typeHex: string;
  id: string;
  payloadHex: string;
  decoded: string | null;
  payloadSize: number;
  recordSize: number;
}

function printable(text: string): boolean {
  return text.length > 0 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(text);
}

export function decodeRecord(record: NormalizedRecord): string | null {
  const bytes = Uint8Array.from(record.payload);
  try {
    if (record.tnf === Ndef.TNF_EMPTY) {
      return '(registro vazio)';
    }
    if (record.tnf === Ndef.TNF_WELL_KNOWN && record.type === Ndef.RTD_TEXT) {
      return String(Ndef.text.decodePayload(bytes));
    }
    if (record.tnf === Ndef.TNF_WELL_KNOWN && record.type === Ndef.RTD_URI) {
      return String(Ndef.uri.decodePayload(bytes));
    }
    if (record.tnf === Ndef.TNF_EXTERNAL_TYPE && record.type === AAR_TYPE) {
      return `Abrir app Android: ${Ndef.util.bytesToString(record.payload)}`;
    }
    if (record.tnf === Ndef.TNF_MIME_MEDIA && record.type === Ndef.MIME_WFA_WSC) {
      return 'Credenciais de rede Wi-Fi (WSC)';
    }
    const text = String(Ndef.util.bytesToString(record.payload));
    return printable(text) ? text : null;
  } catch {
    return null;
  }
}

export function describeRecord(record: NdefRecord | NormalizedRecord, index: number): RecordInfo {
  const normalized = normalizeRecord(record);
  let recordSize = 0;
  try {
    recordSize = encodeRecords([normalized]).length;
  } catch {
    recordSize = normalized.payload.length + normalized.type.length + normalized.id.length + 3;
  }
  return {
    index,
    tnf: normalized.tnf,
    tnfName: tnfName(normalized.tnf),
    type: normalized.type,
    typeHex: toHex(Array.from(normalized.type).map((char) => char.charCodeAt(0))),
    id: normalized.id.length > 0 ? toHex(normalized.id) : '',
    payloadHex: toHex(normalized.payload),
    decoded: decodeRecord(normalized),
    payloadSize: normalized.payload.length,
    recordSize,
  };
}

export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  return (clean.match(/.{2}/g) ?? []).map((pair) => Number.parseInt(pair, 16));
}

/** Reconstrói os records exatos a partir do retrato técnico (clone a partir do histórico). */
export function recordsFromSnapshot(snapshot: Pick<TechnicalSnapshot, 'records'>): NormalizedRecord[] {
  return snapshot.records.map((record) => ({
    tnf: record.tnf,
    type: record.type,
    id: hexToBytes(record.id),
    payload: hexToBytes(record.payloadHex),
  }));
}

/** Resumo curto do conteúdo para diálogos ("Conteúdo atual: ..."). */
export function summarizeRecords(all: (NdefRecord | NormalizedRecord)[], max = 80): string {
  const records = all.filter((record) => Number(record.tnf) !== Ndef.TNF_EMPTY);
  if (records.length === 0) {
    return 'Tag vazia';
  }
  const parts = records.map((record) => decodeRecord(normalizeRecord(record)) ?? `${tnfName(Number(record.tnf))} (binário)`);
  const joined = parts.join(' · ');
  const text = joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
  return records.length > 1 ? `${records.length} registros: ${text}` : text;
}

const PAGES: Partial<Record<string, { total: number; user: number }>> = {
  NTAG213: { total: 45, user: 36 },
  NTAG215: { total: 135, user: 126 },
  NTAG216: { total: 231, user: 222 },
};

export type CapabilityFlags = Pick<TagCapabilities, 'canRead' | 'canWrite' | 'canFormat' | 'canLock' | 'canPasswordProtect' | 'platformLimited' | 'supportsNdef' | 'isReadOnly'>;

/** Retrato técnico serializável. Nunca contém o UID em texto (vai para o histórico). */
export interface TechnicalSnapshot {
  version: 1;
  platform: string;
  simulated: boolean;
  chip: string;
  chipEstimated: boolean;
  technologies: TechInfo[];
  tagClass: TagClass;
  ndefType: string | null;
  writable: boolean;
  capacity: number;
  used: number;
  free: number;
  pages: { total: number; user: number; pageSize: number } | null;
  records: RecordInfo[];
  capabilities: CapabilityFlags;
  atqa: string | null;
  sak: string | null;
}

function rawField(raw: unknown, key: string): unknown {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[key] : undefined;
}

export function buildTechnicalSnapshot(tag: NfcTag, platform: string, simulated = false): TechnicalSnapshot {
  const rawType = rawField(tag.rawTag, 'type');
  const ndefType = typeof rawType === 'string' && /forum|type|mifare/i.test(rawType) ? rawType : null;
  const atqa = rawField(tag.rawTag, 'atqa');
  const sak = rawField(tag.rawTag, 'sak');
  const pages = PAGES[tag.type];
  const caps = tag.capabilities;
  return {
    version: 1,
    platform,
    simulated,
    chip: tag.type,
    chipEstimated: tag.type.startsWith('NTAG'),
    technologies: identifyTechnologies(tag.technologies),
    tagClass: classifyTag(tag.technologies, caps.supportsNdef),
    ndefType,
    writable: caps.canWrite,
    capacity: tag.capacity,
    used: tag.usedSpace,
    free: Math.max(0, tag.capacity - tag.usedSpace),
    pages: pages ? { ...pages, pageSize: 4 } : null,
    records: tag.ndefRecords.map((record, index) => describeRecord(record, index)),
    capabilities: {
      canRead: caps.canRead,
      canWrite: caps.canWrite,
      canFormat: caps.canFormat,
      canLock: caps.canLock,
      canPasswordProtect: caps.canPasswordProtect,
      platformLimited: caps.platformLimited,
      supportsNdef: caps.supportsNdef,
      isReadOnly: caps.isReadOnly,
    },
    atqa: platform === 'android' && typeof atqa === 'string' ? atqa : null,
    sak: platform === 'android' && typeof sak === 'string' ? sak : null,
  };
}

export const CHIP_LABELS: Record<string, string> = {
  NTAG213: 'NTAG213',
  NTAG215: 'NTAG215',
  NTAG216: 'NTAG216',
  MIFARE_ULTRALIGHT: 'MIFARE Ultralight',
  MIFARE_CLASSIC: 'MIFARE Classic',
  ISO15693: 'ISO 15693 (NFC-V)',
  ISO14443_4: 'ISO 14443-4 (ISO-DEP)',
  FELICA: 'FeliCa (NFC-F)',
  NFC_B: 'NFC-B',
  UNKNOWN: 'Não identificado',
};

export function chipLabel(snapshot: Pick<TechnicalSnapshot, 'chip' | 'chipEstimated'>): string {
  const label = CHIP_LABELS[snapshot.chip] ?? snapshot.chip;
  return snapshot.chipEstimated ? `${label} (estimado pela capacidade)` : label;
}

export const CAPABILITY_LABELS: { key: keyof CapabilityFlags; label: string }[] = [
  { key: 'canRead', label: 'Leitura' },
  { key: 'canWrite', label: 'Gravação' },
  { key: 'canFormat', label: 'Formatar como NDEF' },
  { key: 'canLock', label: 'Travar (somente leitura)' },
  { key: 'canPasswordProtect', label: 'Proteção por senha' },
  { key: 'platformLimited', label: 'Limitada pela plataforma' },
];

export function formatBytes(value: number): string {
  return `${value} ${value === 1 ? 'byte' : 'bytes'}`;
}

export interface ReportIdentity {
  /** UID em texto: só para a tag lida agora, nunca vem do histórico. */
  uid?: string | null;
  uidHash?: string | null;
  generatedAt: string;
}

/** Relatório em texto puro para copiar/compartilhar. Valores ausentes viram "Indisponível nesta plataforma". */
export function buildTechnicalReport(snapshot: TechnicalSnapshot, identity: ReportIdentity): string {
  const yes = (value: boolean) => (value ? 'Sim' : 'Não');
  const uidLine = identity.uid
    ? identity.uid
    : identity.uidHash
      ? `protegido (SHA-256 ${identity.uidHash.slice(0, 16)}…)`
      : UNAVAILABLE;
  const lines: string[] = [
    'RELATÓRIO TÉCNICO NFC — Tréville Aproxima',
    `Gerado em: ${identity.generatedAt}`,
    `Plataforma: ${snapshot.platform}${snapshot.simulated ? ' (modo de teste)' : ''}`,
    '',
    '== Identificação ==',
    `UID: ${uidLine}`,
    `ATQA: ${snapshot.atqa ?? UNAVAILABLE}`,
    `SAK: ${snapshot.sak ?? UNAVAILABLE}`,
    `Chip: ${chipLabel(snapshot)}`,
    `Tecnologias: ${snapshot.technologies.length > 0 ? snapshot.technologies.map((tech) => `${tech.label} (${tech.standard})`).join(', ') : UNAVAILABLE}`,
    '',
    '== Memória ==',
    `Capacidade: ${snapshot.capacity > 0 ? formatBytes(snapshot.capacity) : UNAVAILABLE}`,
    `Em uso: ${formatBytes(snapshot.used)}`,
    `Livre: ${snapshot.capacity > 0 ? formatBytes(snapshot.free) : UNAVAILABLE}`,
    `Páginas: ${snapshot.pages ? `${snapshot.pages.total} de ${snapshot.pages.pageSize} bytes (${snapshot.pages.user} de dados do usuário)` : UNAVAILABLE}`,
    '',
    '== NDEF ==',
    `Suporta NDEF: ${yes(snapshot.capabilities.supportsNdef)}`,
    `Versão NDEF: ${UNAVAILABLE}`,
    `Tipo NDEF: ${snapshot.ndefType ?? UNAVAILABLE}`,
    `Gravável: ${yes(snapshot.writable)}`,
    `Tamanho máximo: ${snapshot.capacity > 0 ? formatBytes(snapshot.capacity) : UNAVAILABLE}`,
    `Registros: ${snapshot.records.length}`,
  ];
  snapshot.records.forEach((record) => {
    lines.push(
      '',
      `-- Registro ${record.index + 1} --`,
      `TNF: ${record.tnf} (${record.tnfName})`,
      `Type: ${record.type || '(vazio)'}${record.typeHex ? ` [${record.typeHex}]` : ''}`,
      `ID: ${record.id || '(sem id)'}`,
      `Tamanho: ${formatBytes(record.recordSize)} (payload ${formatBytes(record.payloadSize)})`,
      `Payload (hex): ${record.payloadHex || '(vazio)'}`,
      `Texto: ${record.decoded ?? '(binário, sem texto legível)'}`,
    );
  });
  lines.push('', '== Capacidades ==');
  CAPABILITY_LABELS.forEach(({ key, label }) => lines.push(`${label}: ${yes(snapshot.capabilities[key])}`));
  return lines.join('\n');
}
