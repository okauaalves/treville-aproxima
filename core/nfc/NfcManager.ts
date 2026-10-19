import { Platform } from 'react-native';

import { NfcError, toNfcError } from '@/core/nfc/errors';
import { NdefStatus, NfcEvents, ReaderModeFlags, nativeAvailable, nativeNfc, type NativeModule, type TagEvent } from '@/core/nfc/nfcNative';
import { simulatedNfc } from '@/core/nfc/simulatedAdapter';
import { isWebNfcSupported, webNfc, webNfcUnavailableReason } from '@/core/nfc/webNfc';
import { isExpoGo } from '@/core/platform/expoGo';
import { useSettingsStore } from '@/stores/settingsStore';
import type { NfcSimulationKind } from '@/types/nfc';

type TagHandler = (tag: TagEvent & { isWritable?: boolean }) => void;
type ErrorHandler = (error: Error) => void;
type Mode = 'native' | 'web' | 'simulated' | 'unavailable';

/**
 * Reader mode com NfcA|NfcB|NfcF|NfcV: enquanto ativo, o Android entrega a tag só ao app
 * em primeiro plano, sem despachar para Chrome ou outro handler. Sem flags (padrão 0 da lib)
 * o reader mode não faz polling de nenhuma tecnologia.
 */
export const READER_MODE_FLAGS = ReaderModeFlags.NfcA | ReaderModeFlags.NfcB | ReaderModeFlags.NfcF | ReaderModeFlags.NfcV;
export const READER_MODE_DELAY_MS = 250;
const READER_ALERT = 'Aproxime a tag NFC';
export const NFC_TIMEOUT_MS = 30_000;
export const NFC_DIAGNOSTIC_TIMEOUT_MS = 60_000;

/** Rejeita com NfcError TIMEOUT ("Tempo esgotado...") se `task` não terminar em `ms`. */
export function withNfcTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NfcError('TIMEOUT')), ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

export type DispatchState = { active: boolean; owner: string | null; techSession: boolean };

export class NfcManagerService {
  private static instance: NfcManagerService | null = null;
  private initialized = false;
  private sessionOpen = false;
  private techPending = false;
  private dispatchOwner: string | null = null;
  private dispatchHandler: { onTag: TagHandler; onError?: ErrorHandler; once?: boolean } | null = null;
  private readLocked = false;
  private lock: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private state: DispatchState = { active: false, owner: null, techSession: false };
  private handledLaunchTag: string | null = null;
  private readonly mode: Mode;
  private readonly platform: string;
  private readonly native: NativeModule | null;

  constructor(deps?: { mode?: Mode; platform?: string; native?: NativeModule | null }) {
    this.platform = deps?.platform ?? Platform.OS;
    this.native = deps?.native !== undefined ? deps.native : nativeNfc;
    if (deps?.mode) {
      this.mode = deps.mode;
    } else if (isExpoGo()) {
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

  getMode(): Mode {
    return this.mode;
  }

  /** Uma alteração de sessão por vez: dispatch e requestTechnology nunca ficam ativos juntos. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lock.then(task, task);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private publish(): void {
    this.state = { active: this.dispatchOwner !== null, owner: this.dispatchOwner, techSession: this.techPending || this.sessionOpen };
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getDispatchState = (): DispatchState => this.state;

  isForegroundDispatchActive(): boolean {
    return this.dispatchOwner !== null;
  }

  /**
   * Trava de leitura única: depois da primeira tag entregue por um handler `once`, as próximas são
   * descartadas até `rearmReading()` ("Ler novamente"). O reader mode continua ligado enquanto a tela
   * estiver focada só para "engolir" a tag: desligá-lo com a tag encostada faz o Android redespachá-la
   * (Chrome abre o link ou o app é reaberto pelo intent).
   */
  isReadLocked = (): boolean => this.readLocked;

  lockReading(): void {
    if (!this.readLocked) {
      this.readLocked = true;
      this.publish();
    }
  }

  rearmReading(): void {
    if (this.readLocked) {
      this.readLocked = false;
      this.publish();
    }
  }

  async initialize(): Promise<boolean> {
    if (this.mode === 'web' || this.mode === 'simulated') {
      this.initialized = true;
      return true;
    }
    if (this.mode !== 'native' || !this.native) {
      this.initialized = false;
      return false;
    }
    try {
      await this.native.start();
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
    if (this.mode !== 'native' || !this.native) {
      return false;
    }
    try {
      return await this.native.isSupported();
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
    if (this.mode !== 'native' || !this.native) {
      return false;
    }
    try {
      return await this.native.isEnabled();
    } catch {
      return false;
    }
  }

  private timeoutMs(): number {
    const seconds = useSettingsStore.getState().detectionTimeoutSec;
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : NFC_TIMEOUT_MS;
  }

  /**
   * Liga o reader mode via `registerTagEvent` para a tela `owner`.
   * Preferir `requestTechnologyWithTimeout` (Reader Mode na sessão de tech) para captura ativa;
   * este caminho serve sobretudo ao hold passivo no Android (ex. resultado da leitura).
   * `passive`: só no Android nativo — no iOS registerTagEvent abre a folha do sistema.
   */
  startForegroundDispatch(owner: string, onTag: TagHandler, options?: { passive?: boolean; onError?: ErrorHandler; once?: boolean }): Promise<boolean> {
    return this.exclusive(async () => {
      if (this.mode === 'unavailable') {
        return false;
      }
      if (options?.passive && (this.mode !== 'native' || this.platform !== 'android')) {
        return false;
      }
      if (this.techPending || this.sessionOpen) {
        return false;
      }
      this.dispatchHandler = { onTag, onError: options?.onError, once: options?.once };
      if (this.dispatchOwner !== null) {
        this.dispatchOwner = owner;
        this.publish();
        return true;
      }
      const deliver: TagHandler = (tag) => {
        const handler = this.dispatchHandler;
        if (!handler || this.readLocked) {
          return;
        }
        if (handler.once) {
          this.lockReading();
          if (this.mode !== 'native' || this.platform !== 'android') {
            void this.stopForegroundDispatch(this.dispatchOwner ?? undefined);
          }
        }
        handler.onTag(tag);
      };
      const fail: ErrorHandler = (error) => this.dispatchHandler?.onError?.(error);
      if (this.mode === 'web') {
        await webNfc.register(deliver, fail);
      } else if (this.mode === 'simulated') {
        simulatedNfc.register(deliver, fail);
      } else {
        if (!this.native) {
          return false;
        }
        this.native.setEventListener(NfcEvents.DiscoverTag, (event?: unknown) => {
          if (event) {
            deliver(event as TagEvent);
          }
        });
        this.native.setEventListener(NfcEvents.SessionClosed, (event?: unknown) => {
          if (this.platform === 'ios') {
            this.dispatchOwner = null;
            this.publish();
          }
          if (event) {
            fail(toNfcError(event));
          }
        });
        try {
          await this.native.registerTagEvent({
            isReaderModeEnabled: true,
            readerModeFlags: READER_MODE_FLAGS,
            readerModeDelay: READER_MODE_DELAY_MS,
            invalidateAfterFirstRead: this.platform === 'ios',
            alertMessage: READER_ALERT,
          });
        } catch (error) {
          this.native.setEventListener(NfcEvents.DiscoverTag, null);
          this.native.setEventListener(NfcEvents.SessionClosed, null);
          this.dispatchHandler = null;
          throw toNfcError(error);
        }
      }
      this.dispatchOwner = owner;
      this.publish();
      return true;
    });
  }

  /** Desliga só se `owner` ainda for o dono (blur da tela anterior pode chegar depois do focus da nova). */
  stopForegroundDispatch(owner?: string): Promise<void> {
    return this.exclusive(() => this.releaseDispatch(owner));
  }

  private async releaseDispatch(owner?: string): Promise<void> {
    if (this.dispatchOwner === null || (owner !== undefined && owner !== this.dispatchOwner)) {
      return;
    }
    this.dispatchOwner = null;
    this.dispatchHandler = null;
    if (this.mode === 'web') {
      await webNfc.unregister();
    } else if (this.mode === 'simulated') {
      simulatedNfc.unregister();
    } else if (this.native) {
      this.native.setEventListener(NfcEvents.DiscoverTag, null);
      this.native.setEventListener(NfcEvents.SessionClosed, null);
      await this.native.unregisterTagEvent().catch(() => undefined);
    }
    this.publish();
  }

  async registerTagEvent(onTag: TagHandler, onError?: ErrorHandler, owner = 'screen', options?: { once?: boolean }): Promise<void> {
    if (this.mode === 'unavailable') {
      throw new NfcError('NFC_NOT_SUPPORTED');
    }
    await this.startForegroundDispatch(owner, onTag, { onError, once: options?.once });
  }

  async unregisterTagEvent(owner = 'screen'): Promise<void> {
    await this.stopForegroundDispatch(owner);
  }

  requestTechnology(techs: string[], options?: { alertMessage?: string }): Promise<void> {
    return this.requestTechnologyWithTimeout(techs, undefined, options);
  }

  /**
   * Para o dispatch antes de abrir a sessão de tecnologia; a espera pela tag fica fora do mutex.
   * Sem tag em `ms` (padrão: ajuste do usuário, 30 s) rejeita com TIMEOUT e cancela o pedido nativo.
   * A sessão aberta com sucesso fica para o chamador, que fecha com cancelRequest() no finally.
   */
  async requestTechnologyWithTimeout(techs: string[], ms?: number, options?: { alertMessage?: string }): Promise<void> {
    const timeoutMs = ms && ms > 0 ? ms : this.timeoutMs();
    const proceed = await this.exclusive(async () => {
      if (this.sessionOpen || this.techPending) {
        return false;
      }
      await this.releaseDispatch();
      this.techPending = true;
      this.publish();
      return true;
    });
    if (!proceed) {
      return;
    }
    try {
      await this.openTechnology(techs, timeoutMs, options);
      this.sessionOpen = true;
    } finally {
      this.techPending = false;
      this.publish();
    }
  }

  private async openTechnology(techs: string[], timeoutMs: number, options?: { alertMessage?: string }): Promise<void> {
    if (this.mode === 'unavailable') {
      throw new NfcError('NFC_NOT_SUPPORTED');
    }
    if (this.mode === 'web') {
      try {
        await webNfc.requestTechnology(timeoutMs);
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
        await simulatedNfc.requestTechnology(timeoutMs);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'cancelled') {
          throw new NfcError('USER_CANCELLED');
        }
        throw new NfcError('TIMEOUT');
      }
    }
    if (!this.native) {
      throw new NfcError('NFC_NOT_SUPPORTED');
    }
    const native = this.native;
    try {
      await withNfcTimeout(
        native.requestTechnology(techs, {
          alertMessage: options?.alertMessage ?? READER_ALERT,
          isReaderModeEnabled: true,
          readerModeFlags: READER_MODE_FLAGS,
          readerModeDelay: READER_MODE_DELAY_MS,
        }),
        timeoutMs,
      );
    } catch (error) {
      await native.cancelTechnologyRequest({ throwOnError: false }).catch(() => undefined);
      throw error instanceof NfcError ? error : toNfcError(error);
    }
  }

  /**
   * Cancela a espera em curso sem passar pela fila (senão esperaria o timeout), mas entra na fila
   * para que um dispatch novo só registre depois: no Android a lib desregistra ~1 s após cancelar.
   */
  async cancelRequest(): Promise<void> {
    const native = this.mode === 'native' ? this.native : null;
    const cancelling = (async () => {
      if (this.mode === 'web') {
        await webNfc.cancel();
      } else if (this.mode === 'simulated') {
        await simulatedNfc.cancel();
      } else if (native) {
        await native.cancelTechnologyRequest({ throwOnError: false });
      }
    })().catch(() => undefined);
    const previous = this.lock;
    this.lock = Promise.all([previous, cancelling]).catch(() => undefined);
    await cancelling;
    await this.exclusive(async () => {
      this.sessionOpen = false;
      this.publish();
    });
  }

  /**
   * Tag que abriu o app (intent NDEF/TECH/TAG_DISCOVERED) ou que chegou com o app em segundo plano.
   * Cada tag é entregue uma vez.
   */
  async consumeLaunchTag(): Promise<TagEvent | null> {
    if (this.mode !== 'native' || this.platform !== 'android' || !this.native) {
      return null;
    }
    const native = this.native;
    const keyOf = (tag: TagEvent) => `${tag.id ?? ''}:${JSON.stringify(tag.ndefMessage ?? [])}`;
    const background = await native.getBackgroundTag?.().catch(() => null);
    if (background) {
      await native.clearBackgroundTag?.().catch(() => undefined);
      this.handledLaunchTag = keyOf(background);
      return background;
    }
    const launch = await native.getLaunchTagEvent?.().catch(() => null);
    if (!launch || keyOf(launch) === this.handledLaunchTag) {
      return null;
    }
    this.handledLaunchTag = keyOf(launch);
    return launch;
  }

  async getTag(): Promise<(TagEvent & { isWritable?: boolean; canMakeReadOnly?: boolean | null }) | null> {
    if (this.mode === 'web') {
      return webNfc.getTag();
    }
    if (this.mode === 'simulated') {
      return simulatedNfc.getTag();
    }
    if (!this.native) {
      return null;
    }
    const tag = await this.native.getTag();
    if (!tag) {
      return null;
    }
    try {
      const status = await this.native.ndefHandler.getNdefStatus();
      const canMakeReadOnly = typeof status.canMakeReadOnly === 'boolean' ? status.canMakeReadOnly : (tag as { canMakeReadOnly?: boolean | null }).canMakeReadOnly;
      return { ...tag, isWritable: status.status === NdefStatus.ReadWrite, canMakeReadOnly };
    } catch {
      return { ...tag, isWritable: false };
    }
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
    if (!this.native) {
      throw new NfcError('NFC_NOT_SUPPORTED');
    }
    await this.native.ndefHandler.writeNdefMessage(bytes, { reconnectAfterWrite: true });
  }

  /** Irreversível. Só Android nativo; na simulação, web e iOS nunca executa. */
  async makeReadOnly(): Promise<boolean> {
    if (this.mode !== 'native' || !this.native || this.platform !== 'android') {
      throw new NfcError('OPERATION_NOT_SUPPORTED', 'O travamento só está disponível no app Android.');
    }
    const result = await this.native.ndefHandler.makeReadOnly();
    return result !== false;
  }

  /** NdefFormatable.format() do Android. Exige sessão aberta com NfcTech.NdefFormatable. */
  async formatNdef(bytes: number[]): Promise<void> {
    if (this.mode !== 'native' || !this.native || this.platform !== 'android' || !this.native.ndefFormatableHandlerAndroid) {
      throw new NfcError('OPERATION_NOT_SUPPORTED', 'A formatação NDEF só está disponível no app Android.');
    }
    await this.native.ndefFormatableHandlerAndroid.formatNdef(bytes, { readOnly: false });
  }

  async openSettings(): Promise<boolean> {
    if (this.mode === 'native' && this.native) {
      try {
        return await this.native.goToNfcSetting();
      } catch {
        return false;
      }
    }
    return false;
  }

  expectNewSimulatedTag(): void {
    if (this.mode === 'simulated') {
      simulatedNfc.forget();
    }
  }

  simulateTag(kind: NfcSimulationKind = 'default'): void {
    if (this.mode !== 'simulated') {
      return;
    }
    simulatedNfc.simulate(kind);
  }
}

export const nfcManager = NfcManagerService.getInstance();
