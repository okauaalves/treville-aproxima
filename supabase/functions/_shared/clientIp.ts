// IP real de quem escaneou quando o scan chega pelo link curto (/t/<ID> no EAS Hosting).
// O worker do EAS Hosting chama a função pelo Cloudflare, então `cf-connecting-ip` aqui seria o IP do
// servidor: sem isto todos os scans teriam o mesmo ip_hash e o rate limit (5/10s) engoliria scans reais.
// O header do proxy só vale com o segredo compartilhado; sem ele qualquer um forjaria IPs.
// Sem APIs de Deno ou React Native para rodar nos dois lados.

export const PROXY_IP_HEADER = 'x-treville-client-ip';
export const PROXY_SECRET_HEADER = 'x-treville-proxy-secret';
export const PROXY_SECRET_MIN_LENGTH = 32;

type HeaderSource = { get(name: string): string | null };

const IP_PATTERN = /^[0-9A-Fa-f.:]{2,45}$/;

export function normalizeIp(raw: string | null | undefined): string | null {
  const value = (raw ?? '').split(',')[0]?.trim() ?? '';
  return IP_PATTERN.test(value) && /[.:]/.test(value) ? value : null;
}

/** IP do visitante como o EAS Hosting entrega: X-Real-IP, depois o primeiro do X-Forwarded-For. */
export function visitorIp(headers: HeaderSource): string | null {
  return normalizeIp(headers.get('x-real-ip')) ?? normalizeIp(headers.get('x-forwarded-for')) ?? normalizeIp(headers.get('cf-connecting-ip'));
}

function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

/** IP repassado pelo proxy, só se o segredo confere; senão null (quem chama usa o IP da conexão). */
export function trustedProxyIp(headers: HeaderSource, secret: string | null | undefined): string | null {
  const expected = (secret ?? '').trim();
  if (expected.length < PROXY_SECRET_MIN_LENGTH) {
    return null;
  }
  if (!sameSecret(headers.get(PROXY_SECRET_HEADER) ?? '', expected)) {
    return null;
  }
  return normalizeIp(headers.get(PROXY_IP_HEADER));
}
