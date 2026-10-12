import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ndefEngine } from '@/core/nfc/NdefEngine';
import { nfcManager } from '@/core/nfc/NfcManager';
import { getPendingRead } from '@/core/nfc/pendingRead';
import { tagAnalyzer } from '@/core/nfc/TagAnalyzer';
import { openReadResult } from '@/lib/readResult';

/**
 * App aberto por uma tag (seletor do Android com o app fechado) ou tag recebida em segundo plano:
 * mostra o cartão da leitura e trava a leitura. A mesma tag redespachada pelo sistema enquanto a
 * leitura está travada é ignorada. Montado nas tabs, que só existem com sessão e navegação prontas.
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
      if (nfcManager.isReadLocked() && tag.uid && getPendingRead()?.tag.uid === tag.uid) {
        return;
      }
      nfcManager.lockReading();
      openReadResult(tag, ndefEngine.parseContent(tag.ndefRecords));
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
