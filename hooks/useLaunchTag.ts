import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ndefEngine } from '@/core/nfc/NdefEngine';
import { nfcManager } from '@/core/nfc/NfcManager';
import { setPendingRead } from '@/core/nfc/pendingRead';
import { tagAnalyzer } from '@/core/nfc/TagAnalyzer';
import { push } from '@/lib/navigation';
import { useNfcStore } from '@/stores/nfcStore';

/**
 * App aberto por uma tag (seletor do Android com o app fechado) ou tag recebida em segundo plano:
 * mostra o resultado da leitura. Montado nas tabs, que só existem com sessão e navegação prontas.
 */
export function useLaunchTag() {
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const raw = await nfcManager.consumeLaunchTag();
      if (!raw || !alive) {
        return;
      }
      const tag = tagAnalyzer.analyze(raw);
      const records = ndefEngine.parseContent(tag.ndefRecords);
      useNfcStore.getState().setCurrentTag(tag);
      setPendingRead(tag, records);
      push('/read');
    };
    void check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void check();
      }
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
}
