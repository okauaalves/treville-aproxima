import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';

import { ndefEngine } from '@/core/nfc/NdefEngine';
import { nfcManager } from '@/core/nfc/NfcManager';
import { tagAnalyzer } from '@/core/nfc/TagAnalyzer';
import type { TagEvent } from '@/core/nfc/nfcNative';
import { useHaptics } from '@/hooks/useHaptics';
import { useNfcStore } from '@/stores/nfcStore';
import type { NfcTag, ParsedRecord } from '@/types/nfc';

/**
 * Mantém o reader mode ligado enquanto a tela está focada e o app em primeiro plano,
 * para o Android entregar a tag ao app e não ao Chrome. Ao perder o foco, ir para
 * segundo plano ou abrir uma sessão de gravação, o dispatch é liberado; volta sozinho depois.
 */
export function useTagDispatch(
  onTag: (tag: NfcTag, records: ParsedRecord[]) => void,
  { enabled = true, passive = false, once = false }: { enabled?: boolean; passive?: boolean; once?: boolean } = {},
) {
  const owner = useId();
  const handler = useRef(onTag);
  const haptics = useHaptics();
  const hapticsRef = useRef(haptics);

  useEffect(() => {
    handler.current = onTag;
    hapticsRef.current = haptics;
  });

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        return;
      }
      let focused = true;
      const deliver = (raw: TagEvent) => {
        const tag = tagAnalyzer.analyze(raw);
        const records = ndefEngine.parseContent(tag.ndefRecords);
        useNfcStore.getState().setCurrentTag(tag);
        hapticsRef.current.notify(Haptics.NotificationFeedbackType.Success);
        handler.current(tag, records);
      };
      const start = () => {
        if (focused && AppState.currentState !== 'background') {
          void nfcManager.startForegroundDispatch(owner, deliver, { passive, once }).catch(() => undefined);
        }
      };
      start();
      const appState = AppState.addEventListener('change', (next) => {
        if (next === 'active') {
          start();
        } else if (next === 'background') {
          void nfcManager.stopForegroundDispatch(owner);
        }
      });
      let busy = nfcManager.getDispatchState().techSession;
      const unsubscribe = nfcManager.subscribe(() => {
        const nextBusy = nfcManager.getDispatchState().techSession;
        if (busy && !nextBusy) {
          start();
        }
        busy = nextBusy;
      });
      return () => {
        focused = false;
        appState.remove();
        unsubscribe();
        void nfcManager.stopForegroundDispatch(owner);
      };
    }, [enabled, owner, passive, once]),
  );
}

export function useDispatchState() {
  return useSyncExternalStore(nfcManager.subscribe, nfcManager.getDispatchState, nfcManager.getDispatchState);
}

export function useReadLock(): boolean {
  return useSyncExternalStore(nfcManager.subscribe, nfcManager.isReadLocked, nfcManager.isReadLocked);
}
