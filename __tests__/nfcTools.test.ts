/// <reference types="jest" />
import { buildAutomationPayload } from '@/core/nfc/automation';
import { Ndef } from '@/core/nfc/nfcNative';
import { AAR_TYPE, encodeRecords, ndefEngine, ndefMessageSize, normalizeRecord } from '@/core/nfc/NdefEngine';
import {
  buildTechnicalReport,
  buildTechnicalSnapshot,
  classifyTag,
  identifyTechnologies,
  recordsFromSnapshot,
  rfidGuidance,
  summarizeRecords,
  tnfName,
  toHex,
  UNAVAILABLE,
} from '@/core/nfc/technical';
import { verificationEngine } from '@/core/nfc/VerificationEngine';
import { mapOperationRow, matchesHistoryFilter, operationLabel, statusFromIntegrity, statusLabel } from '@/core/offline/mappers';
import { MIGRATIONS } from '@/core/offline/migrations';
import { payloadValidator } from '@/core/validation/payloadValidator';
import type { NfcTag } from '@/types/nfc';

function makeTag(overrides: Partial<NfcTag> = {}): NfcTag {
  const records = ndefEngine.buildMessage({ contentType: 'URL', url: 'https://example.com' });
  return {
    uid: '04A1B2C3D4E5F6',
    type: 'NTAG213',
    technologies: ['android.nfc.tech.NfcA', 'android.nfc.tech.MifareUltralight', 'android.nfc.tech.Ndef'],
    capacity: 137,
    usedSpace: 20,
    availableSpace: 117,
    ndefRecords: records,
    capabilities: {
      canRead: true,
      canWrite: true,
      canFormat: false,
      canLock: true,
      canPasswordProtect: false,
      platformLimited: false,
      supportsNdef: true,
      isReadOnly: false,
    },
    rawTag: { type: 'NFC Forum Type 2' },
    ...overrides,
  } as NfcTag;
}

describe('múltiplos records', () => {
  it('soma o tamanho com o TLV e compara com a capacidade', () => {
    const payloads = [
      { contentType: 'URL' as const, url: 'https://example.com' },
      { contentType: 'TEXT' as const, text: 'Olá' },
      { contentType: 'PHONE' as const, phone: '+5511999999999', includeCountryCode: true },
    ];
    const build = ndefEngine.buildMultipleRecords(payloads, 137);
    expect(build.records).toHaveLength(3);
    expect(build.messageBytes).toBe(encodeRecords(build.records).length);
    expect(build.totalSize).toBe(build.messageBytes + 2);
    expect(build.fits).toBe(true);
    expect(build.recordSizes.reduce((sum, size) => sum + size, 0)).toBe(build.messageBytes);

    const tight = ndefEngine.buildMultipleRecords(payloads, 20);
    expect(tight.fits).toBe(false);
    expect(tight.overBy).toBe(tight.totalSize - 20);
  });

  it('usa TLV de 4 bytes para mensagens com 255 bytes ou mais', () => {
    const long = ndefEngine.buildMessage({ contentType: 'TEXT', text: 'a'.repeat(300) });
    expect(ndefMessageSize(long)).toBe(encodeRecords(long).length + 4);
  });

  it('monta record MIME e Android Application Record', () => {
    const [mime] = ndefEngine.buildMessage({ contentType: 'CUSTOM', mimeType: 'text/plain', text: 'abc' });
    expect(Number(mime!.tnf)).toBe(Ndef.TNF_MIME_MEDIA);
    const app = ndefEngine.buildMessage({ contentType: 'LINK_APP', appUri: 'instagram://', androidPackage: 'com.instagram.android' });
    const aar = app.map(normalizeRecord).find((record) => record.type === AAR_TYPE);
    expect(aar?.tnf).toBe(Ndef.TNF_EXTERNAL_TYPE);
  });
});

describe('normalização e verificação byte a byte', () => {
  it('aceita type em bytes e id em hex (formato do Android)', () => {
    const normalized = normalizeRecord({ tnf: 1, type: [0x55], id: '0A0B', payload: [0x04, 0x61] } as never);
    expect(normalized.type).toBe('U');
    expect(normalized.id).toEqual([0x0a, 0x0b]);
  });

  it('confere quantidade, type e payload de todos os records', () => {
    const records = ndefEngine.buildMultipleRecords([
      { contentType: 'URL', url: 'https://example.com' },
      { contentType: 'TEXT', text: 'oi' },
    ]).records;
    const decoded = Ndef.decodeMessage(Ndef.encodeMessage(records.map(normalizeRecord) as never));
    expect(verificationEngine.compareRecords(records, decoded).allPassed).toBe(true);
    expect(verificationEngine.verifyRecords(records, decoded).integrityPercent).toBe(100);
    expect(verificationEngine.compareRecords(records, decoded.slice(0, 1)).allPassed).toBe(false);
    const changed = ndefEngine.buildMultipleRecords([
      { contentType: 'URL', url: 'https://example.org' },
      { contentType: 'TEXT', text: 'oi' },
    ]).records;
    const result = verificationEngine.compareRecords(records, changed);
    expect(result.contentTypeMatch).toBe(true);
    expect(result.mainValueMatch).toBe(false);
  });
});

describe('dados técnicos', () => {
  it('formata hex e nomes de TNF', () => {
    expect(toHex([0, 15, 255])).toBe('00 0F FF');
    expect(toHex([1, 2], '')).toBe('0102');
    expect(tnfName(1)).toBe('NFC Forum Well-Known');
    expect(tnfName(9)).toContain('Desconhecido');
  });

  it('identifica tecnologias e classifica RFID', () => {
    const techs = identifyTechnologies(['android.nfc.tech.NfcV', 'android.nfc.tech.NfcV', 'android.nfc.tech.IsoDep']);
    expect(techs.map((tech) => tech.key)).toEqual(['NfcV', 'IsoDep']);
    expect(techs[0]?.standard).toBe('ISO/IEC 15693');
    expect(classifyTag(['android.nfc.tech.NfcV'], false)).toBe('rfid');
    expect(classifyTag(['android.nfc.tech.NfcA', 'android.nfc.tech.NdefFormatable'], false)).toBe('formatable');
    expect(classifyTag(['android.nfc.tech.Ndef'], true)).toBe('ndef');
    const guidance = rfidGuidance(['android.nfc.tech.NfcV']);
    expect(guidance.title).toBe('Tag RFID detectada — leitura de conteúdo não disponível neste tipo de tag');
    expect(guidance.message).toContain('125 kHz');
  });

  it('gera retrato sem UID e relatório com Indisponível', () => {
    const tag = makeTag();
    const snapshot = buildTechnicalSnapshot(tag, 'ios');
    expect(JSON.stringify(snapshot)).not.toContain(tag.uid);
    expect(snapshot.records[0]?.tnfName).toBe('NFC Forum Well-Known');
    expect(snapshot.records[0]?.decoded).toBe('https://example.com');
    expect(snapshot.pages?.total).toBe(45);
    expect(snapshot.atqa).toBeNull();

    const fromHistory = buildTechnicalReport(snapshot, { uidHash: 'abcdef0123456789ffff', generatedAt: 'agora' });
    expect(fromHistory).toContain(`ATQA: ${UNAVAILABLE}`);
    expect(fromHistory).toContain('protegido (SHA-256 abcdef0123456789');
    expect(fromHistory).not.toContain(tag.uid);

    const live = buildTechnicalReport(snapshot, { uid: '04:A1:B2', generatedAt: 'agora' });
    expect(live).toContain('UID: 04:A1:B2');
    expect(live).toContain('Payload (hex):');
  });

  it('reconstrói os records exatos a partir do retrato', () => {
    const tag = makeTag();
    const snapshot = buildTechnicalSnapshot(tag, 'android');
    const rebuilt = recordsFromSnapshot(snapshot);
    expect(verificationEngine.compareRecords(tag.ndefRecords, rebuilt).allPassed).toBe(true);
  });

  it('resume o conteúdo para os diálogos', () => {
    expect(summarizeRecords([])).toBe('Tag vazia');
    const erased = [Ndef.record(Ndef.TNF_EMPTY, '', [], [])];
    expect(summarizeRecords(erased)).toBe('Tag vazia');
    expect(ndefEngine.parseContent(erased)).toHaveLength(0);
    const records = ndefEngine.buildMultipleRecords([
      { contentType: 'URL', url: 'https://example.com' },
      { contentType: 'TEXT', text: 'oi' },
    ]).records;
    expect(summarizeRecords(records)).toBe('2 registros: https://example.com · oi');
    expect(summarizeRecords(records, 10).length).toBeLessThanOrEqual(10 + '2 registros: '.length);
  });
});

describe('histórico técnico', () => {
  it('traduz tipos e resultados', () => {
    expect(operationLabel('CLONE')).toBe('Clone');
    expect(operationLabel('FORMAT')).toBe('Formatação');
    expect(statusLabel('PARTIAL')).toBe('Parcial');
    expect(statusFromIntegrity(true, 100)).toBe('SUCCESS');
    expect(statusFromIntegrity(false, 75)).toBe('PARTIAL');
    expect(statusFromIntegrity(false, 0)).toBe('FAILED');
  });

  it('filtra gravações incluindo clone, lock, erase e formatação', () => {
    expect(matchesHistoryFilter('write', 'CLONE')).toBe(true);
    expect(matchesHistoryFilter('write', 'LOCK')).toBe(true);
    expect(matchesHistoryFilter('write', 'READ')).toBe(false);
    expect(matchesHistoryFilter('read', 'READ')).toBe(true);
    expect(matchesHistoryFilter('all', 'DIAGNOSE')).toBe(true);
  });

  it('lê colunas técnicas e mantém compatibilidade com linhas antigas', () => {
    const snapshot = buildTechnicalSnapshot(makeTag(), 'android');
    const base = {
      id: '1',
      tag_id: null,
      operation: 'CLONE',
      status: 'PARTIAL',
      content_type: 'URL',
      payload: null,
      error_message: null,
      integrity_percent: 75,
      duration_ms: 1200,
      created_at: '2026-10-11T00:00:00.000Z',
      synced: 0,
      tag_type: 'NTAG213',
      tag_capacity: 137,
      tag_hash: null,
      display_title: 'Clone',
      display_value: 'https://example.com',
      tag_uid_hash: 'hash',
    };
    const mapped = mapOperationRow({ ...base, technical: JSON.stringify(snapshot) });
    expect(mapped.operation).toBe('CLONE');
    expect(mapped.status).toBe('PARTIAL');
    expect(mapped.technical?.records).toHaveLength(1);
    const old = mapOperationRow(base);
    expect(old.technical).toBeNull();
    expect(old.payloads).toBeNull();
    expect(mapOperationRow({ ...base, technical: '{' }).technical).toBeNull();
  });

  it('migração 4 adiciona colunas locais', () => {
    const v4 = MIGRATIONS.find((migration) => migration.version === 4);
    expect(v4?.statements.join(' ')).toContain('ADD COLUMN technical');
    expect(v4?.statements.join(' ')).toContain('ADD COLUMN payloads');
  });
});

describe('automação', () => {
  it('monta e valida as automações', () => {
    expect(buildAutomationPayload({ kind: 'app', androidPackage: 'com.whatsapp', appUri: 'whatsapp://' }).payload?.contentType).toBe('LINK_APP');
    expect(buildAutomationPayload({ kind: 'app', androidPackage: 'pacote inválido' }).payload).toBeNull();
    expect(buildAutomationPayload({ kind: 'url', url: 'https://example.com' }).payload?.url).toBe('https://example.com');
    expect(buildAutomationPayload({ kind: 'wifi', ssid: '', password: '' }).payload).toBeNull();
    expect(buildAutomationPayload({ kind: 'whatsapp', phone: '+55 11 99999-9999', message: 'Oi' }).payload?.contentType).toBe('WHATSAPP');
  });

  it('valida MIME personalizado', () => {
    expect(payloadValidator.validate({ contentType: 'CUSTOM', mimeType: 'text/plain', text: 'abc' }).ok).toBe(true);
    expect(payloadValidator.validate({ contentType: 'CUSTOM', mimeType: 'invalido', text: 'abc' }).ok).toBe(false);
  });
});
