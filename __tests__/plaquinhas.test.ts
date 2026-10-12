import {
  aggregateScans,
  buildDestination,
  buildLinkUrl,
  checkDestinationUrl,
  EMPTY_DESTINATION,
  FALLBACK_REDIRECT_BASE,
  generateLinkId,
  LINK_ID_ALPHABET,
  parseDestination,
  resolveRedirectBase,
  shortDisplayUrl,
  syncStatus,
  SYNC_LABELS,
  type ScanLog,
} from '@/lib/plaquinhaLogic';
import { BASE_URL, generateLinkId as appGenerate, getLinkUrl } from '@/lib/plaquinhas';

jest.mock('expo-crypto', () => ({
  getRandomBytes: (count: number) => Uint8Array.from({ length: count }, (_, index) => index * 37),
}));
jest.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));

describe('generateLinkId', () => {
  it('usa só o alfabeto sem caracteres ambíguos e tamanho 6', () => {
    for (let run = 0; run < 200; run += 1) {
      const id = generateLinkId((count) => Uint8Array.from({ length: count }, () => Math.floor(Math.random() * 256)));
      expect(id).toHaveLength(6);
      expect(id).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(id).not.toMatch(/[01IO]/);
    }
  });

  it('mapeia bytes deterministicamente (byte % 32)', () => {
    expect(generateLinkId(() => Uint8Array.from([0, 1, 31, 32, 255, 64]))).toBe(`AB${LINK_ID_ALPHABET[31]}A${LINK_ID_ALPHABET[31]}A`);
    expect(LINK_ID_ALPHABET).toHaveLength(32);
  });

  it('a versão do app usa expo-crypto', () => {
    expect(appGenerate()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});

describe('URLs da plaquinha', () => {
  it('deriva a base do projeto Supabase', () => {
    expect(resolveRedirectBase('https://abcdefghij12.supabase.co/')).toBe('https://abcdefghij12.supabase.co/functions/v1/redirect');
  });

  it.each([undefined, '', 'https://SEU_ID.supabase.co', 'https://xxxxx.supabase.co', 'http://abcdefghij12.supabase.co', 'https://evil.com'])('cai no fallback para %p', (value) => {
    expect(resolveRedirectBase(value)).toBe(FALLBACK_REDIRECT_BASE);
  });

  it('marca o link da tag com ?s=nfc', () => {
    expect(buildLinkUrl('https://x.supabase.co/functions/v1/redirect/', 'ABC234')).toBe('https://x.supabase.co/functions/v1/redirect/ABC234');
    expect(buildLinkUrl('https://x.supabase.co/functions/v1/redirect', 'ABC234', 'nfc')).toBe('https://x.supabase.co/functions/v1/redirect/ABC234?s=nfc');
  });

  it('getLinkUrl usa BASE_URL', () => {
    expect(getLinkUrl('ABC234')).toBe(`${BASE_URL}/ABC234`);
    expect(getLinkUrl('ABC234', 'nfc')).toBe(`${BASE_URL}/ABC234?s=nfc`);
  });

  it('abrevia sem inventar domínio', () => {
    expect(shortDisplayUrl('https://fyavoukktjysxtmtkspd.supabase.co/functions/v1/redirect/ABC234')).toBe('fyavoukktjysxtmtkspd.supabase.co/…/ABC234');
  });
});

describe('validação de destino', () => {
  it.each(['https://exemplo.com/menu', 'http://exemplo.com', 'mailto:a@b.com', 'tel:+5511999998888', 'sms:+5511999998888', 'https://wa.me/5511999998888'])('aceita %p', (url) => {
    expect(checkDestinationUrl(url)).toEqual({ ok: true, url });
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://exemplo.com',
    '',
    'https://localhost',
    'https://user:pass@exemplo.com',
    'https://exem plo.com',
    'tel:',
    `https://exemplo.com/${'a'.repeat(2100)}`,
  ])('rejeita destino inválido #%#', (url) => {
    expect(checkDestinationUrl(url).ok).toBe(false);
  });

  it('monta destinos a partir do formulário', () => {
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'url', url: 'exemplo.com/cardapio' })).toEqual({ ok: true, url: 'https://exemplo.com/cardapio' });
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'url', url: 'javascript:alert(1)' }).ok).toBe(false);
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'instagram', instagram: '@treville.br' })).toEqual({ ok: true, url: 'https://instagram.com/treville.br' });
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'whatsapp', phone: '(11) 99999-8888' })).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/wa\.me\/\d+/) });
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'phone', phone: '123' }).ok).toBe(false);
    expect(buildDestination({ ...EMPTY_DESTINATION, type: 'email', email: 'nao-e-email' }).ok).toBe(false);
  });

  it('reabre o formulário a partir do destino salvo', () => {
    const built = buildDestination({ ...EMPTY_DESTINATION, type: 'instagram', instagram: 'treville' });
    expect(built.ok && parseDestination(built.url, 'instagram').instagram).toBe('treville');
    expect(parseDestination('https://exemplo.com', 'desconhecido')).toMatchObject({ type: 'url', url: 'https://exemplo.com' });
  });
});

describe('status e estatísticas', () => {
  it('rótulos de sincronização', () => {
    expect(SYNC_LABELS[syncStatus({ nfc_synced: true, qr_synced: true })]).toBe('QR + NFC');
    expect(SYNC_LABELS[syncStatus({ nfc_synced: false, qr_synced: true })]).toBe('Só QR');
  });

  it('agrega por tipo e pelos últimos 7 dias locais', () => {
    const now = new Date(2026, 9, 11, 15, 0);
    const at = (daysAgo: number, hour = 10) => new Date(2026, 9, 11 - daysAgo, hour).toISOString();
    const logs: ScanLog[] = [
      { id: '1', link_id: 'A', scanned_at: at(0), scan_type: 'qr' },
      { id: '2', link_id: 'A', scanned_at: at(0, 1), scan_type: 'nfc' },
      { id: '3', link_id: 'A', scanned_at: at(2), scan_type: 'qr' },
      { id: '4', link_id: 'A', scanned_at: at(6, 0), scan_type: 'nfc' },
      { id: '5', link_id: 'A', scanned_at: at(7), scan_type: 'qr' },
      { id: '6', link_id: 'A', scanned_at: 'inválido', scan_type: 'qr' },
    ];
    const stats = aggregateScans(logs, now);
    expect(stats.qr).toBe(4);
    expect(stats.nfc).toBe(2);
    expect(stats.sample).toBe(6);
    expect(stats.days).toHaveLength(7);
    expect(stats.days.map((day) => day.count)).toEqual([1, 0, 0, 0, 1, 0, 2]);
    expect(stats.days[6]).toMatchObject({ key: '2026-10-11', label: 'dom' });
    expect(stats.days[0]!.key).toBe('2026-10-05');
    expect(stats.maxPerDay).toBe(2);
  });

  it('sem scans tudo zera', () => {
    const stats = aggregateScans([], new Date(2026, 0, 1));
    expect(stats).toMatchObject({ qr: 0, nfc: 0, sample: 0, maxPerDay: 0 });
    expect(stats.days.every((day) => day.count === 0)).toBe(true);
  });
});
