import { NfcManagerService, READER_MODE_DELAY_MS, READER_MODE_FLAGS } from '@/core/nfc/NfcManager';
import { NfcEvents, type NativeModule } from '@/core/nfc/nfcNative';

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ detectionTimeoutSec: 30 }) },
}));

jest.mock('@/core/nfc/webNfc', () => ({
  isWebNfcSupported: () => false,
  webNfcUnavailableReason: () => 'sem web nfc',
  webNfc: {},
}));

type Listener = ((event?: unknown) => void) | null;

function fakeNative() {
  const listeners = new Map<string, Listener>();
  let resolveTech: (() => void) | null = null;
  let rejectTech: ((error: Error) => void) | null = null;
  const native = {
    start: jest.fn(async () => undefined),
    isSupported: jest.fn(async () => true),
    isEnabled: jest.fn(async () => true),
    requestTechnology: jest.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          resolveTech = resolve;
          rejectTech = reject;
        }),
    ),
    cancelTechnologyRequest: jest.fn(async () => {
      rejectTech?.(new Error('cancelled'));
    }),
    getTag: jest.fn(async () => null),
    ndefHandler: {
      getNdefStatus: jest.fn(async () => ({ status: 2 })),
      writeNdefMessage: jest.fn(async () => undefined),
      makeReadOnly: jest.fn(async () => undefined),
    },
    setEventListener: jest.fn((event: string, handler: unknown) => {
      listeners.set(event, handler as Listener);
    }),
    registerTagEvent: jest.fn(async () => undefined),
    unregisterTagEvent: jest.fn(async () => undefined),
    goToNfcSetting: jest.fn(async () => true),
    getLaunchTagEvent: jest.fn(async () => null as unknown),
    getBackgroundTag: jest.fn(async () => null as unknown),
    clearBackgroundTag: jest.fn(async () => undefined),
  };
  return {
    native,
    emit: (event: string, payload: unknown) => listeners.get(event)?.(payload),
    listener: (event: string) => listeners.get(event) ?? null,
    finishTech: () => resolveTech?.(),
  };
}

function android() {
  const fake = fakeNative();
  const service = new NfcManagerService({ mode: 'native', platform: 'android', native: fake.native as unknown as NativeModule });
  return { fake, service };
}

describe('foreground dispatch (reader mode)', () => {
  it('liga o reader mode com NfcA|NfcB|NfcF|NfcV e entrega a tag ao dono atual', async () => {
    const { fake, service } = android();
    const first = jest.fn();
    expect(await service.startForegroundDispatch('home', first, { passive: true })).toBe(true);
    expect(READER_MODE_FLAGS).toBe(0x1 | 0x2 | 0x4 | 0x8);
    expect(fake.native.registerTagEvent).toHaveBeenCalledWith(
      expect.objectContaining({ isReaderModeEnabled: true, readerModeFlags: READER_MODE_FLAGS, readerModeDelay: READER_MODE_DELAY_MS }),
    );
    fake.emit(NfcEvents.DiscoverTag, { id: '04AA' });
    expect(first).toHaveBeenCalledWith({ id: '04AA' });
    expect(service.getDispatchState()).toEqual({ active: true, owner: 'home', techSession: false });
  });

  it('é idempotente: um segundo start só troca o handler, sem registrar de novo', async () => {
    const { fake, service } = android();
    const first = jest.fn();
    const second = jest.fn();
    await service.startForegroundDispatch('home', first);
    await service.startForegroundDispatch('scan', second);
    expect(fake.native.registerTagEvent).toHaveBeenCalledTimes(1);
    fake.emit(NfcEvents.DiscoverTag, { id: '04BB' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ id: '04BB' });
  });

  it('stop de quem não é dono é ignorado (blur atrasado da tela anterior)', async () => {
    const { fake, service } = android();
    await service.startForegroundDispatch('home', jest.fn());
    await service.startForegroundDispatch('scan', jest.fn());
    await service.stopForegroundDispatch('home');
    expect(fake.native.unregisterTagEvent).not.toHaveBeenCalled();
    expect(service.isForegroundDispatchActive()).toBe(true);
    await service.stopForegroundDispatch('scan');
    expect(fake.native.unregisterTagEvent).toHaveBeenCalledTimes(1);
    expect(fake.listener(NfcEvents.DiscoverTag)).toBeNull();
    expect(service.isForegroundDispatchActive()).toBe(false);
  });

  it('serializa focus/blur concorrentes e termina com o dono certo', async () => {
    const { fake, service } = android();
    await Promise.all([
      service.startForegroundDispatch('home', jest.fn()),
      service.startForegroundDispatch('scan', jest.fn()),
      service.stopForegroundDispatch('home'),
    ]);
    expect(service.getDispatchState().owner).toBe('scan');
    expect(fake.native.registerTagEvent).toHaveBeenCalledTimes(1);
  });

  it('modo passivo (Home) não liga no iOS nem no web/simulação', async () => {
    const fake = fakeNative();
    const ios = new NfcManagerService({ mode: 'native', platform: 'ios', native: fake.native as unknown as NativeModule });
    expect(await ios.startForegroundDispatch('home', jest.fn(), { passive: true })).toBe(false);
    const simulated = new NfcManagerService({ mode: 'simulated', platform: 'web', native: null });
    expect(await simulated.startForegroundDispatch('home', jest.fn(), { passive: true })).toBe(false);
    expect(fake.native.registerTagEvent).not.toHaveBeenCalled();
  });
});

describe('mutex dispatch × requestTechnology', () => {
  it('requestTechnology desliga o dispatch antes e abre a sessão em reader mode', async () => {
    const { fake, service } = android();
    await service.startForegroundDispatch('scan', jest.fn());
    const request = service.requestTechnology(['Ndef']);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.native.unregisterTagEvent).toHaveBeenCalledTimes(1);
    expect(fake.native.requestTechnology).toHaveBeenCalledWith(['Ndef'], expect.objectContaining({ isReaderModeEnabled: true, readerModeFlags: READER_MODE_FLAGS }));
    expect(service.getDispatchState()).toEqual({ active: false, owner: null, techSession: true });

    expect(await service.startForegroundDispatch('home', jest.fn())).toBe(false);
    expect(fake.native.registerTagEvent).toHaveBeenCalledTimes(1);

    fake.finishTech();
    await request;
    expect(service.isSessionOpen()).toBe(true);
    expect(await service.startForegroundDispatch('home', jest.fn())).toBe(false);

    await service.cancelRequest();
    expect(fake.native.cancelTechnologyRequest).toHaveBeenCalled();
    expect(service.getDispatchState().techSession).toBe(false);
    expect(await service.startForegroundDispatch('home', jest.fn())).toBe(true);
    expect(fake.native.registerTagEvent).toHaveBeenCalledTimes(2);
  });

  it('cancelRequest durante a espera não fica preso atrás da sessão', async () => {
    const { fake, service } = android();
    const request = service.requestTechnology(['Ndef']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await service.cancelRequest();
    await expect(request).rejects.toBeTruthy();
    expect(fake.native.cancelTechnologyRequest).toHaveBeenCalled();
    expect(service.getDispatchState().techSession).toBe(false);
  });
});

describe('tag que abriu o app', () => {
  it('entrega a tag de lançamento uma vez só e prioriza a tag de segundo plano', async () => {
    const { fake, service } = android();
    const tag = { id: '04CC', ndefMessage: [] };
    fake.native.getLaunchTagEvent.mockResolvedValue(tag);
    expect(await service.consumeLaunchTag()).toEqual(tag);
    expect(await service.consumeLaunchTag()).toBeNull();

    const background = { id: '04DD', ndefMessage: [] };
    fake.native.getBackgroundTag.mockResolvedValueOnce(background);
    expect(await service.consumeLaunchTag()).toEqual(background);
    expect(fake.native.clearBackgroundTag).toHaveBeenCalled();
  });

  it('fora do Android nativo não consulta nada', async () => {
    const fake = fakeNative();
    const ios = new NfcManagerService({ mode: 'native', platform: 'ios', native: fake.native as unknown as NativeModule });
    expect(await ios.consumeLaunchTag()).toBeNull();
    expect(fake.native.getLaunchTagEvent).not.toHaveBeenCalled();
  });
});
