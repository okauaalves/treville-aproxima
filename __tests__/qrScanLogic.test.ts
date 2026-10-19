import { codeFromQrScan, routeAfterQrScan } from '@/lib/qrScanLogic';

const SHORT = 'https://nfc-manager.expo.app';

describe('codeFromQrScan', () => {
  it('aceita link curto /t/<ID> e URL longa do redirect', () => {
    expect(codeFromQrScan('https://nfc-manager.expo.app/t/K7M2QX', SHORT)).toBe('K7M2QX');
    expect(codeFromQrScan('https://nfc-manager.expo.app/t/k7m2qx?s=nfc', SHORT)).toBe('K7M2QX');
    expect(codeFromQrScan('https://fyavoukktjysxtmtkspd.supabase.co/functions/v1/redirect/K7M2QX', SHORT)).toBe('K7M2QX');
  });

  it('aceita código puro', () => {
    expect(codeFromQrScan('K7M2QX', SHORT)).toBe('K7M2QX');
    expect(codeFromQrScan('ab12cd', SHORT)).toBe('AB12CD');
  });

  it('rejeita QR externo', () => {
    expect(codeFromQrScan('https://google.com', SHORT)).toBeNull();
    expect(codeFromQrScan('https://exemplo.com/t/K7M2QX', SHORT)).toBeNull();
    expect(codeFromQrScan('oi mundo', SHORT)).toBeNull();
  });
});

describe('routeAfterQrScan', () => {
  it('QR externo → não reconhecido', () => {
    expect(routeAfterQrScan('https://google.com', null, SHORT)).toEqual({
      kind: 'unrecognized',
      message: 'QR não reconhecido',
    });
  });

  it('código nosso sem linha → não encontrada', () => {
    expect(routeAfterQrScan('https://nfc-manager.expo.app/t/ZZZZZZ', null, SHORT)).toEqual({
      kind: 'not_found',
      message: 'Plaquinha não encontrada.',
    });
  });

  it('empty/claim → edição', () => {
    expect(
      routeAfterQrScan('https://nfc-manager.expo.app/t/EMPTY1', { id: 'EMPTY1', name: 'Lote 1', destination_type: 'empty', claimed: true }, SHORT),
    ).toEqual({ kind: 'open', path: '/plaquinha/qr/EMPTY1?edit=1', claimed: true });
  });

  it('não-empty → visualização sem claim', () => {
    expect(
      routeAfterQrScan('https://nfc-manager.expo.app/t/K7M2QX', { id: 'K7M2QX', name: 'Mesa', destination_type: 'url', claimed: false }, SHORT),
    ).toEqual({ kind: 'open', path: '/plaquinha/qr/K7M2QX', claimed: false });
  });
});
