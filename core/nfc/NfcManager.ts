import { NfcError, toNfcError } from '@/core/nfc/errors';
import { NdefStatus, NfcEvents, nativeAvailable, nativeNfc, type TagEvent } from '@/core/nfc/nfcNative';
import { simulatedNfc } from '@/core/nfc/simulatedAdapter';
import { isWebNfcSupported, webNfc, webNfcUnavailableReason } from '@/core/nfc/webNfc';
import { isExpoGo } from '@/core/platform/expoGo';
import { useSettingsStore } from '@/stores/settingsStore';
import type { NfcSimulationKind } from '@/types/nfc';

type TagHandler = (tag: TagEvent & { isWritable?: boolean }) => void;

export class NfcManagerService {
  private static instance: NfcManagerService | null = null;
  private initialized = false;
  private sessionOpen = false;
  private readonly mode: 'native' | 'web' | 'simulated' | 'unavailable';

  private constructor() {
    if (isExpoGo()) {
      this.mode = __DEV__ ? 'simulated' : 'unavailable';
    } else if (nativeAvailable && nativeNfc) {
      this.mode = 'native';
    } else if (isWebNfcSupported()) {
      this.mode = 'web';
    } else if (__DEV__) {
      this.mode = 'simulated';
    } else {
      this.mode = 'unavailable';
    }
  }

  static getInstance(): NfcManagerService {
    NfcManagerService.instance ??= new NfcManagerService();
    return NfcManagerService.instance;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isSessionOpen(): boolean {
    return this.sessionOpen;
  }

  isSimulation(): boolean {
    return this.mode === 'simulated';
  }

  getMode(): 'native' | 'web' | 'simulated' | 'unavailable' {
    return this.mode;
  }

  async initialize(): Promise<boolean> {
    if (this.mode === 'web' || this.mode === 'simulated') {
      this.initialized = true;
      return true;
    }
    if (this.mode !== 'native' || !nativeNfc) {
      this.initialized = false;
      return false;
    }
    try {
      await nativeNfc.start();
      this.initialized = true;
      return true;
    } catch {
      this.initialized = false;
      return false;
    }
  }

  async isSupported(): Promise<boolean> {
    if (this.mode === 'simulated') {
      return true;
    }
    if (this.mode === 'web') {
      return isWebNfcSupported();
    }
    if (this.mode !== 'native' || !nativeNfc) {
      return false;
    }
    try {
      return await nativeNfc.isSupported();
    } catch {
      return false;
    }
  }

  async isEnabled(): Promise<boolean> {
    if (this.mode === 'simulated') {
      return true;
    }
    if (this.mode === 'web') {
      return typeof window !== 'undefined' && window.isSecureContext === true;
    }
    if (this.mode !== 'native' || !nativeNfc) {
      return false;
    }
    try {
      return await nativeNfc.isEnabled();
    } catch {
      return false;
    }
  }

  private timeoutMs(): number {
    const seconds = useSettingsStore.getState().detectionTimeoutSec;
    const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 30;
    return safe * 1000;
  }

  async requestTechnology(techs: string[], options?: { alertMessage?: string }): Promise<void> {
    if (this.sessionOpen) {
      return;
    }
    if (this.mode === 'unavailable') {
      throw new NfcError('NFC_NOT_SUPPORTED');
    }
    if (this.mode === 'web') {
      try {
        await webNfc.requestTechnology(this.timeoutMs());
        this.sessionOpen = true;
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'timeout') {
          throw new NfcError('TIMEOUT');
        }
        throw new NfcError('NFC_NOT_SUPPORTED', webNfcUnavailableReason());
      }
    }
    if (this.mode === 'simulated') {
      try {
        await simulatedNfc.requestTechnology(this.timeoutMs());
        this.sessionOpen = true;
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'cancelled') {
          throw new NfcError('USER_CANCELLED');
        }
        throw new NfcError('TIMEOUT');
      }
    }
    if (!nativeNfc) {
      throw new NfcError('NFC_NOT_SUPPORTED');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        nativeNfc.requestTechnology(techs, options),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new NfcError('TIMEOUT')), this.timeoutMs());
        }),
      ]);
      this.sessionOpen = true;
    } catch (error) {
      await nativeNfc.cancelTechnologyRequest({ throwOnError: false }).catch(() => undefined);
      throw error instanceof NfcError ? error : toNfcError(error);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async cancelRequest(): Promise<void> {
    this.sessionOpen = false;
    if (this.mode === 'web') {
      await webNfc.cancel();
      return;
    }
    if (this.mode === 'simulated') {
      await simulatedNfc.cancel();
      return;
    }
    if (this.mode === 'native' && nativeNfc) {
      await nativeNfc.cancelTechnologyRequest({ throwOnError: false }).catch(() => undefined);
    }
    await this.unregisterTagEvent();
  }

  async getTag(): Promise<(TagEvent & { isWritable?: boolean }) | null> {
    if (this.mode === 'web') {
      return webNfc.getTag();
    }
    if (this.mode === 'simulated') {
      return simulatedNfc.getTag();
    }
    if (!nativeNfc) {
      return null;
    }
    const tag = await nativeNfc.getTag();
    if (!tag) {
      return null;
    }
    try {
      const status = await nativeNfc.ndefHandler.getNdefStatus();
      return { ...tag, isWritable: status.status === NdefStatus.ReadWrite };
    } catch {
      return { ...tag, isWritable: false };
    }
  }

  async registerTagEvent(onTag: TagHandler, onError?: (error: Error) => void): Promise<void> {
    if (this.mode === 'unavailable') {
      throw new NfcError('NFC_NOT_SUPPORTED');
    }
    if (this.mode === 'web') {
      await webNfc.register(onTag, onError);
      return;
    }
    if (this.mode === 'simulated') {
      simulatedNfc.register(onTag, onError);
      return;
    }
    if (!nativeNfc) {
      throw new NfcError('NFC_NOT_SUPPORTED');
    }
    const onDiscover = (event?: unknown) => {
      if (event) {
        onTag(event as TagEvent);
      }
    };
    const onClosed = (event?: unknown) => {
      if (event) {
        onError?.(toNfcError(event));
      }
    };
    nativeNfc.setEventListener(NfcEvents.DiscoverTag, onDiscover);
    nativeNfc.setEventListener(NfcEvents.SessionClosed, onClosed);
    await nativeNfc.registerTagEvent({ invalidateAfterFirstRead: true, isReaderModeEnabled: true });
  }

  async unregisterTagEvent(): Promise<void> {
    if (this.mode === 'web') {
      await webNfc.unregister();
      return;
    }
    if (this.mode === 'simulated') {
      simulatedNfc.unregister();
      return;
    }
    if (!nativeNfc) {
      return;
    }
    nativeNfc.setEventListener(NfcEvents.DiscoverTag, null);
    nativeNfc.setEventListener(NfcEvents.SessionClosed, null);
    await nativeNfc.unregisterTagEvent().catch(() => undefined);
  }

  async writeNdef(bytes: number[]): Promise<void> {
    if (this.mode === 'web') {
      await webNfc.write(bytes, this.timeoutMs());
      return;
    }
    if (this.mode === 'simulated') {
      simulatedNfc.write(bytes);
      return;
    }
    if (!nativeNfc) {
      throw new NfcError('NFC_NOT_SUPPORTED');
    }
    await nativeNfc.ndefHandler.writeNdefMessage(bytes, { reconnectAfterWrite: true });
  }

  async makeReadOnly(): Promise<void> {
    if (this.mode !== 'native' || !nativeNfc) {
      return;
    }
    await nativeNfc.ndefHandler.makeReadOnly();
  }

  async openSettings(): Promise<boolean> {
    if (this.mode === 'native' && nativeNfc) {
      try {
        return await nativeNfc.goToNfcSetting();
      } catch {
        return false;
      }
    }
    return false;
  }

  simulateTag(kind: NfcSimulationKind = 'default'): void {
    if (this.mode !== 'simulated') {
      return;
    }
    simulatedNfc.simulate(kind);
  }
}

export const nfcManager = NfcManagerService.getInstance();
