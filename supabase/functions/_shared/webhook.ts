// Regra única de URL de webhook (app + Edge Function `redirect`). Sem APIs de Deno ou React Native.
// Bloqueia destinos internos (SSRF) pelo texto da URL. Não cobre DNS que resolve para IP privado.

export type WebhookCheck = { ok: true; url: string } | { ok: false; error: string };

const MAX_LENGTH = 2048;
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.supabase.co', '.supabase.in', '.supabase.net'];
const BLOCKED_HOSTS = ['localhost', 'supabase.co', 'supabase.in', 'metadata.google.internal'];

function ipv4Parts(host: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return null;
  }
  const parts = host.split('.').map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    a! >= 224
  );
}

/** IPv6 literal (sem colchetes). Bloqueia loopback, não especificado, ULA fc00::/7, link-local fe80::/10 e IPv4 mapeado privado. */
function isBlockedIpv6(host: string): boolean {
  const value = host.toLowerCase();
  if (value === '::' || value === '::1') {
    return true;
  }
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) {
    const parts = ipv4Parts(mapped[1]!);
    return !parts || isPrivateIpv4(parts);
  }
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
  if (mappedHex) {
    const high = parseInt(mappedHex[1]!, 16);
    const low = parseInt(mappedHex[2]!, 16);
    return isPrivateIpv4([high >> 8, high & 255, low >> 8, low & 255]);
  }
  const first = parseInt(value.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

export function checkWebhookUrl(raw: string | null | undefined): WebhookCheck {
  const value = (raw ?? '').trim();
  if (!value) {
    return { ok: false, error: 'Informe a URL do webhook.' };
  }
  if (value.length > MAX_LENGTH || /[\u0000-\u001F\u007F\s]/.test(value)) {
    return { ok: false, error: 'URL do webhook inválida.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: 'URL do webhook inválida.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'O webhook precisa usar https://.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Não use usuário e senha na URL.' };
  }
  if (parsed.port && parsed.port !== '443') {
    return { ok: false, error: 'Use a porta padrão do https (443).' };
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[')) {
    return isBlockedIpv6(host.slice(1, -1)) ? { ok: false, error: 'Endereços internos não são permitidos.' } : { ok: true, url: parsed.href };
  }
  const ipv4 = ipv4Parts(host);
  if (ipv4) {
    return isPrivateIpv4(ipv4) ? { ok: false, error: 'Endereços internos não são permitidos.' } : { ok: true, url: parsed.href };
  }
  if (!host.includes('.') || BLOCKED_HOSTS.includes(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, error: 'Endereços internos não são permitidos.' };
  }
  return { ok: true, url: parsed.href };
}

export interface WebhookPayload {
  link_id: string;
  scan_type: 'nfc' | 'qr';
  scanned_at: string;
  scan_count: number | null;
}

export const WEBHOOK_USER_AGENT = 'Treville-Aproxima-Webhook/1';
export const WEBHOOK_TIMEOUT_MS = 3000;
