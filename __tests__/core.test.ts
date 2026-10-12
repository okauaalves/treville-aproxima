/// <reference types="jest" />
import { Ndef } from '@/core/nfc/nfcNative';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import { verificationEngine } from '@/core/nfc/VerificationEngine';
import { payloadValidator } from '@/core/validation/payloadValidator';
import { formatUid, tagAnalyzer } from '@/core/nfc/TagAnalyzer';
import { MIGRATIONS, runMigrations, type MigrationDb } from '@/core/offline/migrations';
import { mapOperationRow } from '@/core/offline/mappers';
import { parseSettings } from '@/core/offline/settingsParse';
import NetInfo from '@react-native-community/netinfo';

import { REMOTE_SYNC_ENABLED, startAutoSync, syncIfOnline, syncInBatches } from '@/core/offline/syncEngine';

describe('NdefEngine', () => {
  it('faz roundtrip de URL, WhatsApp e vCard', () => {
    const url = ndefEngine.buildMessage({ contentType: 'URL', url: 'https://example.com' });
    const decodedUrl = Ndef.decodeMessage(Ndef.encodeMessage(url));
    expect(ndefEngine.parseRecord(decodedUrl[0]!).displayValue).toContain('example.com');

    const whats = ndefEngine.buildWhatsAppRecord('5511999999999', 'Oi');
    const decodedWhats = Ndef.decodeMessage(Ndef.encodeMessage([whats]));
    expect(ndefEngine.parseRecord(decodedWhats[0]!).contentType).toBe('WHATSAPP');

    const card = ndefEngine.buildVCardRecord({ contentType: 'VCARD', fullName: 'Ana Silva', phone: '11999999999' });
    const decodedCard = Ndef.decodeMessage(Ndef.encodeMessage([card]));
    expect(ndefEngine.parseRecord(decodedCard[0]!).displayValue).toContain('Ana');
  });

  it('codifica Wi-Fi como MIME WSC', () => {
    const record = ndefEngine.buildWifiRecord({ contentType: 'WIFI', ssid: 'Casa', password: 'senha1234', security: 'WPA2' });
    expect(String(record.type)).toContain('wfa');
  });
});

describe('VerificationEngine', () => {
  it('calcula integridade 100, 75, 50 e 0', () => {
    expect(verificationEngine.calculateIntegrity({ recordCountMatch: true, contentTypeMatch: true, mainValueMatch: true, fieldsMatch: true, allPassed: true })).toBe(100);
    expect(verificationEngine.calculateIntegrity({ recordCountMatch: false, contentTypeMatch: true, mainValueMatch: true, fieldsMatch: false, allPassed: false })).toBe(75);
    expect(verificationEngine.calculateIntegrity({ recordCountMatch: false, contentTypeMatch: true, mainValueMatch: false, fieldsMatch: false, allPassed: false })).toBe(50);
    expect(verificationEngine.calculateIntegrity({ recordCountMatch: false, contentTypeMatch: false, mainValueMatch: false, fieldsMatch: false, allPassed: false })).toBe(0);
  });
});

describe('payloadValidator', () => {
  it('aceita WhatsApp com DDI e recusa URL inválida', () => {
    expect(payloadValidator.validate({ contentType: 'WHATSAPP', phone: '5511999999999' }).ok).toBe(true);
    expect(payloadValidator.validate({ contentType: 'URL', url: 'notaurl' }).ok).toBe(false);
  });
});

describe('TagAnalyzer', () => {
  it('formata UID e detecta NTAG213', () => {
    expect(formatUid('04A2B3')).toBe('04:A2:B3');
    expect(tagAnalyzer.detectTagType({ maxSize: 144 })).toBe('NTAG213');
  });
});

describe('migrations', () => {
  it('aplica em ordem e é idempotente', async () => {
    const executed: string[] = [];
    let version = 0;
    const db: MigrationDb = {
      getUserVersion: async () => version,
      setUserVersion: async (next) => {
        version = next;
      },
      exec: async (sql) => {
        executed.push(sql);
      },
    };
    const first = await runMigrations(db);
    const count = executed.length;
    const second = await runMigrations(db);
    expect(first).toBe(MIGRATIONS[MIGRATIONS.length - 1]?.version);
    expect(second).toBe(first);
    expect(executed.length).toBe(count);
    expect(version).toBe(first);
  });
});

describe('mapOperationRow', () => {
  it('converte snake_case protegendo JSON inválido', () => {
    const mapped = mapOperationRow({
      id: '1',
      tag_id: null,
      operation: 'READ',
      status: 'SUCCESS',
      content_type: 'URL',
      payload: '{',
      error_message: null,
      integrity_percent: 100,
      duration_ms: null,
      created_at: '2026-09-30T00:00:00.000Z',
      synced: 0,
      tag_type: 'NTAG213',
      tag_capacity: 144,
      tag_hash: null,
      display_title: 'Site',
      display_value: 'https://example.com',
      tag_uid_hash: 'abc',
    });
    expect(mapped.displayTitle).toBe('Site');
    expect(mapped.payload).toBeNull();
    expect(mapped.tagHash).toBe('abc');
  });
});

describe('settings', () => {
  it('usa fallback quando o valor é inválido', () => {
    const parsed = parseSettings({ theme: 'azul', historyRetentionDays: 'nope' }, true);
    expect(parsed.theme).toBe('light');
    expect(parsed.historyRetentionDays).toBe(90);
    expect(parsed.reduceAnimations).toBe(true);
  });
});

describe('syncInBatches', () => {
  it('percorre lotes até esvaziar', async () => {
    const pages = [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }], []];
    const sent: string[] = [];
    const total = await syncInBatches(
      async () => pages.shift() ?? [],
      async (items) => {
        sent.push(...items.map((item) => item.id));
        return items.map((item) => item.id);
      },
    );
    expect(total).toBe(3);
    expect(sent).toEqual(['a', 'b', 'c']);
  });
});

describe('sync remoto desligado', () => {
  it('não consulta rede nem servidor enquanto REMOTE_SYNC_ENABLED for false', async () => {
    expect(REMOTE_SYNC_ENABLED).toBe(false);
    const fetchSpy = jest.spyOn(NetInfo, 'fetch');
    const listenerSpy = jest.spyOn(NetInfo, 'addEventListener');
    await syncIfOnline();
    const stop = startAutoSync(10);
    stop();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(listenerSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    listenerSpy.mockRestore();
  });
});
