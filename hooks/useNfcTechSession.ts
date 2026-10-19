import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';

import { ndefEngine } from '@/core/nfc/NdefEngine';
import { NfcError, toNfcError } from '@/core/nfc/errors';
import { NfcTech } from '@/core/nfc/nfcNative';
import { nfcManager } from '@/core/nfc/NfcManager';
import { tagAnalyzer } from '@/core/nfc/TagAnalyzer';
import { useHaptics } from '@/hooks/useHaptics';
import { useNfcStore } from '@/stores/nfcStore';
import type { NfcTag, ParsedRecord } from '@/types/nfc';

type SessionOptions = {
  enabled?: boolean;
  /** Uma tag e encerra a sessão (padrão). */
  once?: boolean;
  alertMessage?: string;
  timeoutMs?: number;
  onError?: (error: NfcError) => void;
};

/**
 * Sessão NFC ativa via `requestTechnology` + Reader Mode no Android
 * (`isReaderModeEnabled` / `readerModeFlags` em `NfcManager.requestTechnologyWithTimeout`).
 *
 * Diferente de `registerTagEvent`/dispatch: enquanto a sessão estiver aberta o SO entrega a
 * tag só ao app. Sempre chama `cancelRequest` no finally, no blur e no unmount.
 * Fora desta sessão o comportamento padrão do Android (abrir link) permanece.
 */
export function useNfcTechSession(
  onTag: (tag: NfcTag, records: ParsedRecord[]) => void,
  { enabled = true, once = true, alertMessage, timeoutMs, onError }: SessionOptions = {},
) {
  const handler = useRef(onTag);
  const errorHandler = useRef(onError);
  const haptics = useHaptics();
  const hapticsRef = useRef(haptics);
  const generation = useRef(0);

  useEffect(() => {
    handler.current = onTag;
    errorHandler.current = onError;
    hapticsRef.current = haptics;
  });

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        return;
      }

      let focused = true;
      const bump = () => {
        generation.current += 1;
      };

      const runSession = async (gen: number) => {
        useNfcStore.getState().setScanning(true);
        try {
          while (focused && generation.current === gen) {
            if (AppState.currentState === 'background') {
              return;
            }
            await nfcManager.requestTechnologyWithTimeout([NfcTech.Ndef], timeoutMs, { alertMessage });
            if (!focused || generation.current !== gen) {
              return;
            }
            const raw = await nfcManager.getTag();
            if (!raw) {
              throw new NfcError('READ_FAILED');
            }
            const tag = tagAnalyzer.analyze(raw);
            const records = ndefEngine.parseContent(tag.ndefRecords);
            useNfcStore.getState().setCurrentTag(tag);
            if (once) {
              nfcManager.lockReading();
            }
            hapticsRef.current.notify(Haptics.NotificationFeedbackType.Success);
            handler.current(tag, records);
            if (once) {
              return;
            }
          }
        } catch (error) {
          if (!focused || generation.current !== gen) {
            return;
          }
          const nfcError = error instanceof NfcError ? error : toNfcError(error);
          if (nfcError.code !== 'USER_CANCELLED') {
            errorHandler.current?.(nfcError);
          }
        } finally {
          await nfcManager.cancelRequest().catch(() => undefined);
          if (generation.current === gen) {
            useNfcStore.getState().setScanning(false);
          }
        }
      };

      const start = () => {
        if (!focused || AppState.currentState === 'background') {
          return;
        }
        const gen = ++generation.current;
        void runSession(gen);
      };

      start();

      const appState = AppState.addEventListener('change', (next) => {
        if (next === 'background') {
          bump();
          void nfcManager.cancelRequest().catch(() => undefined);
          useNfcStore.getState().setScanning(false);
        } else if (next === 'active') {
          start();
        }
      });

      return () => {
        focused = false;
        bump();
        appState.remove();
        void nfcManager.cancelRequest().catch(() => undefined);
        useNfcStore.getState().setScanning(false);
      };
    }, [enabled, once, alertMessage, timeoutMs]),
  );
}
