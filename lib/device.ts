import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Detecta cliente Android pelo user-agent (útil no web export).
 * No app nativo use `Platform.OS === 'android'`.
 */
export function isAndroidUserAgent(userAgent: string | undefined | null = typeof navigator !== 'undefined' ? navigator.userAgent : null): boolean {
  return typeof userAgent === 'string' && /Android/i.test(userAgent);
}

/** Landing web em aparelho Android — candidato a CTA de download do APK. */
export function isAndroidWebClient(): boolean {
  return Platform.OS === 'web' && isAndroidUserAgent();
}

const noopSubscribe = () => () => undefined;

/**
 * Versão para componentes: no SSR fica `false` e no cliente lê o user-agent
 * sem setState em effect (evita mismatch e o lint de cascading renders).
 */
export function useAndroidWebClient(): boolean {
  return useSyncExternalStore(noopSubscribe, isAndroidWebClient, () => false);
}
