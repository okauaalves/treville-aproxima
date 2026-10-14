import { NfcError } from '@/core/nfc/errors';
import { NFC_DIAGNOSTIC_TIMEOUT_MS, NFC_TIMEOUT_MS, NfcManagerService, withNfcTimeout } from '@/core/nfc/NfcManager';
import type { NativeModule } from '@/core/nfc/nfcNative';

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ detectionTimeoutSec: 30 }) },
}));

jest.mock('@/core/nfc/webNfc', () => ({
  isWebNfcSupported: () => false,
  webNfcUnavailableReason: () => 'sem web nfc',
  webNfc: {},
}));

function hangingNative() {
  let rejectTech: ((error: Error) => void) | null = null;
  return {
    start: jest.fn(async () => undefined),
    requestTechnology: jest.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectTech = reject;
        }),
    ),
    cancelTechnologyRequest: jest.fn(async () => {
      rejectTech?.(new Error('cancelled'));
    }),
    setEventListener: jest.fn(),
    registerTagEvent: jest.fn(async () => undefined),
    unregisterTagEvent: jest.fn(async () => undefined),
  };
}

async function flush(times = 5) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

describe('withNfcTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rejeita com TIMEOUT e mensagem "Tempo esgotado" quando a tag não chega', async () => {
    const pending = withNfcTimeout(new Promise<void>(() => undefined), 1000);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT', message: expect.stringContaining('Tempo esgotado') });
    jest.advanceTimersByTime(1000);
    await assertion;
  });

  it('resolve normalmente e não deixa timer pendurado', async () => {
    await expect(withNfcTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('defaults: 30 s para operações e 60 s para o diagnóstico', () => {
    expect(NFC_TIMEOUT_MS).toBe(30_000);
    expect(NFC_DIAGNOSTIC_TIMEOUT_MS).toBe(60_000);
  });
});

describe('requestTechnologyWithTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function service() {
    const native = hangingNative();
    const nfc = new NfcManagerService({ mode: 'native', platform: 'android', native: native as unknown as NativeModule });
    return { native, nfc };
  }

  it('estoura em 30 s (padrão), cancela o pedido nativo e libera o mutex para o reader mode', async () => {
    const { native, nfc } = service();
    const request = nfc.requestTechnologyWithTimeout(['Ndef']);
    const assertion = expect(request).rejects.toBeInstanceOf(NfcError);
    await flush();
    expect(native.requestTechnology).toHaveBeenCalled();
    expect(nfc.getDispatchState().techSession).toBe(true);

    jest.advanceTimersByTime(NFC_TIMEOUT_MS - 1);
    await flush();
    expect(native.cancelTechnologyRequest).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await assertion;
    await expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    expect(nfc.getDispatchState().techSession).toBe(false);
    expect(nfc.isSessionOpen()).toBe(false);
    await expect(nfc.startForegroundDispatch('home', jest.fn())).resolves.toBe(true);
  });

  it('respeita um prazo maior (60 s do diagnóstico)', async () => {
    const { native, nfc } = service();
    const request = nfc.requestTechnologyWithTimeout(['Ndef'], NFC_DIAGNOSTIC_TIMEOUT_MS);
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    await flush();
    jest.advanceTimersByTime(NFC_TIMEOUT_MS);
    await flush();
    expect(native.cancelTechnologyRequest).not.toHaveBeenCalled();
    jest.advanceTimersByTime(NFC_DIAGNOSTIC_TIMEOUT_MS - NFC_TIMEOUT_MS);
    await assertion;
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it('requestTechnology usa o mesmo caminho com timeout', async () => {
    const { native, nfc } = service();
    const request = nfc.requestTechnology(['Ndef']);
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    await flush();
    jest.advanceTimersByTime(NFC_TIMEOUT_MS);
    await assertion;
    expect(native.cancelTechnologyRequest).toHaveBeenCalled();
  });
});
