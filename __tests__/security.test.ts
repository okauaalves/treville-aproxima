import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateConfig } from '@/constants/config';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import { Ndef } from '@/core/nfc/nfcNative';
import { buildTechnicalReport, buildTechnicalSnapshot } from '@/core/nfc/technical';
import * as db from '@/core/offline/database.web';
import { assessUrl } from '@/core/validation/urlSafety';
import { summarizeRead } from '@/lib/readResult';
import type { NfcTag } from '@/types/nfc';
import { errorCode, logger, redact } from '@/utils/logger';

jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    randomUUID: () => nodeCrypto.randomUUID(),
    digestStringAsync: async (_algorithm: string, value: string) => nodeCrypto.createHash('sha256').update(value).digest('hex'),
    getRandomBytes: (count: number) => new Uint8Array(count),
  };
});
jest.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));

const UID = '04:A2:3B:4C:5D:6E:80';
const UID_HEX = '04A23B4C5D6E80';

function uriRecord(url: string) {
  return Ndef.uriRecord(url);
}

function tagWith(records: ReturnType<typeof uriRecord>[]): NfcTag {
  return {
    uid: UID,
    type: 'NTAG215',
    capacity: 496,
    usedSpace: 40,
    technologies: ['android.nfc.tech.Ndef', 'android.nfc.tech.NfcA'],
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
    rawTag: { id: UID_HEX, atqa: '0044', sak: '00' },
  } as unknown as NfcTag;
}

describe('URLs suspeitas lidas da tag', () => {
  it.each([
    ['javascript:alert(1)', true],
    ['JaVa\tScRiPt:alert(1)', true],
    ['data:text/html;base64,PHNjcmlwdD4=', true],
    ['file:///sdcard/a.html', true],
    ['vbscript:msgbox(1)', true],
  ])('%s nunca abre', (url, blocked) => {
    const safety = assessUrl(url);
    expect(safety.suspicious).toBe(true);
    expect(safety.blocked).toBe(blocked);
  });

  it.each([
    'intent://scan/#Intent;scheme=zxing;package=com.x;end',
    'https://exemplo.com/app.apk',
    'https://exemplo.com/download/Setup.EXE?v=2',
    'https://xn--pypal-4ve.com/login',
  ])('%s é suspeita mas pode abrir com confirmação', (url) => {
    const safety = assessUrl(url);
    expect(safety.suspicious).toBe(true);
    expect(safety.blocked).toBe(false);
    expect(safety.reasons.length).toBeGreaterThan(0);
  });

  it.each(['https://treville.com.br/perfil', 'https://wa.me/5511999999999', 'tel:+5511999999999', 'mailto:a@b.com', 'https://phishing-aula.com.br/apk-guia'])(
    '%s não é marcada (sem heurística de palavras)',
    (url) => {
      expect(assessUrl(url)).toEqual({ suspicious: false, blocked: false, reasons: [] });
    },
  );

  it('NdefEngine marca isSuspicious no parse e o resumo da leitura herda o bloqueio', () => {
    const records = ndefEngine.parseContent([uriRecord('javascript:alert(document.cookie)')]);
    expect(records[0]).toMatchObject({ isSuspicious: true });
    const summary = summarizeRead(tagWith([]), records);
    expect(summary.safety).toMatchObject({ suspicious: true, blocked: true });

    const safe = ndefEngine.parseContent([uriRecord('https://treville.com.br')]);
    expect(safe[0]?.isSuspicious).toBeUndefined();
    expect(summarizeRead(tagWith([]), safe).safety.suspicious).toBe(false);

    const apk = summarizeRead(tagWith([]), ndefEngine.parseContent([uriRecord('https://cdn.exemplo.com/app.apk')]));
    expect(apk.safety).toMatchObject({ suspicious: true, blocked: false });
  });
});

describe('logger', () => {
  const original = (global as { __DEV__?: boolean }).__DEV__;
  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = original;
    jest.restoreAllMocks();
  });

  it('redige UID, tokens, e-mails e query de URLs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlLWZha2U';
    const text = redact(`uid ${UID} e ${UID_HEX} de joao.silva@gmail.com token=${jwt} em https://site.com/p?email=a@b.com&t=1`);
    expect(text).not.toContain(UID);
    expect(text).not.toContain(UID_HEX);
    expect(text).not.toContain('joao.silva@gmail.com');
    expect(text).not.toContain(jwt);
    expect(text).not.toContain('email=');
    expect(text).toContain('https://site.com/p?[…]');
  });

  it('em produção: info/nfc/warn calados e error só com o código', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logger.info('x', UID);
    logger.nfc('tag', UID);
    logger.warn('y');
    logger.error('Falha ao salvar', Object.assign(new Error(`uid ${UID} de a@b.com`), { code: 'PGRST301' }));
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Falha ao salvar: PGRST301');
    expect(errorCode(new TypeError('boom'))).toBe('TypeError');
  });
});

describe('UID nunca é persistido em texto', () => {
  it('o retrato técnico salvo no histórico não tem o UID', () => {
    const snapshot = buildTechnicalSnapshot(tagWith([uriRecord('https://treville.com.br')]), 'android');
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain(UID_HEX);
    expect(json).not.toContain(UID);
    expect(buildTechnicalReport(snapshot, { uidHash: 'ab'.repeat(32), generatedAt: 'agora' })).not.toContain(UID);
  });

  it('saveOperation (web/IndexedDB) guarda só o hash, inclusive no export do histórico', async () => {
    await db.initDatabase();
    const tag = tagWith([uriRecord('https://treville.com.br')]);
    const id = await db.saveOperation({
      tagUid: tag.uid,
      tagType: tag.type,
      tagCapacity: tag.capacity,
      operation: 'READ',
      status: 'SUCCESS',
      contentType: 'URL',
      payload: { contentType: 'URL', url: 'https://treville.com.br' },
      technical: buildTechnicalSnapshot(tag, 'web'),
    });
    const saved = await db.getOperationById(id);
    const all = JSON.stringify(await db.getOperations({ limit: 100 }));
    expect(saved?.tagHash).toBe(createHash('sha256').update(UID.toUpperCase()).digest('hex'));
    for (const text of [JSON.stringify(saved), all]) {
      expect(text).not.toContain(UID);
      expect(text).not.toContain(UID_HEX);
    }
  });
});

describe('configuração', () => {
  const warn = () => jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  it('validateConfig não lança e lista o que falta (modo local)', () => {
    warn();
    expect(() => validateConfig({ supabaseUrl: undefined, supabaseAnonKey: undefined, adminEmail: undefined, redirectBase: '', shortLinkBase: '' })).not.toThrow();
    expect(validateConfig({ supabaseUrl: undefined, supabaseAnonKey: undefined, adminEmail: undefined, redirectBase: '', shortLinkBase: '' })).toHaveLength(2);
    expect(validateConfig({ supabaseUrl: 'https://abcdefghijkl.supabase.co', supabaseAnonKey: 'eyJ.a.b', adminEmail: 'admin@treville.com', redirectBase: '', shortLinkBase: '' })).toEqual([]);
  });

  it('detecta a service_role colada no lugar da anon key', () => {
    warn();
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    const problems = validateConfig({ supabaseUrl: 'https://abcdefghijkl.supabase.co', supabaseAnonKey: `eyJhbGciOiJIUzI1NiJ9.${payload}.assinatura`, adminEmail: undefined, redirectBase: '', shortLinkBase: '' });
    expect(problems.join(' ')).toContain('service_role');
  });

  it('scripts/check-secrets.mjs passa no código e falha com service_role ou a variável proibida', () => {
    const script = join(__dirname, '..', 'scripts', 'check-secrets.mjs');
    expect(execFileSync(process.execPath, [script], { encoding: 'utf8' })).toContain('check-secrets: ok');
    const dir = mkdtempSync(join(tmpdir(), 'check-secrets-'));
    try {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ iss: 'supabase', role: 'service_role', ref: 'abcdefghijkl' })).toString('base64url');
      writeFileSync(join(dir, 'bundle.js'), `const k="${header}.${payload}.assinaturafalsa123";`);
      expect(() => execFileSync(process.execPath, [script, dir], { encoding: 'utf8', stdio: 'pipe' })).toThrow();
      rmSync(join(dir, 'bundle.js'));
      writeFileSync(join(dir, 'index.html'), `<script>process.env.${'EXPO_PUBLIC_SUPABASE'}_SERVICE_KEY</script>`);
      expect(() => execFileSync(process.execPath, [script, dir], { encoding: 'utf8', stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
