/**
 * Rate limit simples por IP (janela fixa) para a Edge Function pública `redirect`.
 * Cache em memória por isolate — primeira camada; não substitui WAF/CDN.
 *
 * Limite: ABUSE_LIMIT_PER_MINUTE req / IP / ABUSE_WINDOW_MS → HTTP 429.
 * Separado do rate_limit_hit do banco (5 scans/10s por plaquinha+IP, só estatística).
 */

export const ABUSE_LIMIT_PER_MINUTE = 90;
export const ABUSE_WINDOW_MS = 60_000;
/** Evita crescimento ilimitado do Map em isolates longevos. */
export const ABUSE_MAX_KEYS = 5_000;

export type AbuseBucket = { windowStart: number; hits: number };

export type AbuseDecision = {
  allowed: boolean;
  /** Segundos até a janela atual expirar (útil em Retry-After). */
  retryAfterSec: number;
  hits: number;
};

/**
 * Conta um hit na chave (ex.: hash do IP). Retorna se ainda está dentro do limite.
 * Mutável: atualiza `buckets` in-place.
 */
export function hitAbuseLimit(
  buckets: Map<string, AbuseBucket>,
  key: string,
  now: number = Date.now(),
  limit: number = ABUSE_LIMIT_PER_MINUTE,
  windowMs: number = ABUSE_WINDOW_MS,
): AbuseDecision {
  const safeKey = (key || 'unknown').slice(0, 64);
  let bucket = buckets.get(safeKey);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { windowStart: now, hits: 0 };
  }
  bucket.hits += 1;
  buckets.set(safeKey, bucket);
  pruneAbuseBuckets(buckets, now, windowMs);

  const elapsed = now - bucket.windowStart;
  const retryAfterSec = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
  return {
    allowed: bucket.hits <= limit,
    retryAfterSec,
    hits: bucket.hits,
  };
}

/** Remove janelas expiradas; se ainda passar do teto, remove as mais antigas. */
export function pruneAbuseBuckets(
  buckets: Map<string, AbuseBucket>,
  now: number = Date.now(),
  windowMs: number = ABUSE_WINDOW_MS,
  maxKeys: number = ABUSE_MAX_KEYS,
): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) {
      buckets.delete(key);
    }
  }
  while (buckets.size > maxKeys) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    buckets.delete(oldest);
  }
}
