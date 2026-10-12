import { getLinkUrl } from '@/lib/plaquinhas';
import { openNfcFlow } from '@/lib/nfcEntry';
import { useNfcStore } from '@/stores/nfcStore';
import { emptyWriteOptions } from '@/types/nfc';

/**
 * Grava a URL curta da plaquinha pelo fluxo normal: checagem de NFC → identificar tag →
 * write/progress (writeFlow com releitura e comparação). nfc_synced só é marcado lá, após verificar.
 */
export async function gravarPlaquinhaNaTag(id: string, nav: 'push' | 'replace' = 'push'): Promise<void> {
  useNfcStore.getState().setPendingPayload({ contentType: 'URL', url: getLinkUrl(id, 'nfc') });
  useNfcStore.getState().setWriteOptions(emptyWriteOptions);
  await openNfcFlow('write', { plaquinha: id }, nav);
}
