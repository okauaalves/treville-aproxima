import { assessNfc } from '@/core/nfc/readiness';
import { push, replace } from '@/lib/navigation';

export async function openNfcFlow(
  intent: 'read' | 'write',
  extra?: Record<string, string | undefined>,
  nav: 'push' | 'replace' = 'push',
): Promise<void> {
  const assessment = await assessNfc();
  const params = new URLSearchParams({ intent });
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }
  const go = nav === 'replace' ? replace : push;
  if (!assessment.ready) {
    params.set('reason', assessment.reason ?? 'unsupported');
    go(`/nfc-unavailable?${params.toString()}`);
    return;
  }
  go(`/scan?${params.toString()}`);
}
