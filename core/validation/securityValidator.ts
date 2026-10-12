// Validação e saneamento de tudo que a pessoa digita antes de ir para o banco.
// Puro (sem React Native) para rodar nos testes e reaproveitar regras da Edge Function.
import { checkDestinationUrl } from '@/supabase/functions/_shared/destination';
import { checkWebhookUrl, type WebhookCheck } from '@/supabase/functions/_shared/webhook';

export const BLOCKED_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:'] as const;

export type UrlCheck = { ok: true; url: string; warning: string | null } | { ok: false; error: string };

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Uma linha: quebras e tabs viram espaço, caracteres de controle/invisíveis somem. `max` corta no fim. */
export function sanitizeText(value: unknown, max?: number): string {
  const text = typeof value === 'string' ? value : '';
  const clean = text.replace(/[\t\r\n]+/g, ' ').replace(CONTROL_CHARS, '').replace(/ {2,}/g, ' ').trim();
  return max === undefined ? clean : clean.slice(0, max).trim();
}

/** Texto de várias linhas (bio): mantém até uma linha em branco seguida. */
export function sanitizeForStorage(value: unknown, max?: number): string {
  const text = typeof value === 'string' ? value : '';
  const clean = text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL_CHARS, '')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return max === undefined ? clean : clean.slice(0, max).trim();
}

/** Esquema real do link, ignorando espaços/controles usados para disfarçar (ex.: "java\tscript:"). */
function schemeOf(value: string): string {
  const squashed = value.replace(/[\s\u0000-\u001F\u007F]+/g, '').toLowerCase();
  const match = /^([a-z][a-z0-9+.-]*):/.exec(squashed);
  return match ? `${match[1]}:` : '';
}

/**
 * Bloqueia javascript:/data:/vbscript:/file: e aplica a regra de destino do redirect.
 * Não troca http por https: só devolve um aviso para a interface mostrar.
 */
export function sanitizeUrl(raw: unknown): UrlCheck {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    return { ok: false, error: 'Informe o link.' };
  }
  if ((BLOCKED_SCHEMES as readonly string[]).includes(schemeOf(value))) {
    return { ok: false, error: 'Esse tipo de link não é permitido.' };
  }
  const check = checkDestinationUrl(value);
  if (!check.ok) {
    return check;
  }
  const warning = schemeOf(check.url) === 'http:' ? 'Esse link usa http:// (sem cadeado). Se o site tiver https://, prefira.' : null;
  return { ok: true, url: check.url, warning };
}

export type PhoneCheck = { ok: true; digits: string } | { ok: false; error: string };

/** 10 a 13 dígitos (DDD + número, com ou sem 55). */
export function validatePhone(raw: unknown): PhoneCheck {
  const digits = (typeof raw === 'string' ? raw : '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) {
    return { ok: false, error: 'Informe um telefone com DDD (10 a 13 dígitos).' };
  }
  return { ok: true, digits };
}

export type EmailCheck = { ok: true; email: string } | { ok: false; error: string };

export function validateEmail(raw: unknown): EmailCheck {
  const email = sanitizeText(raw).toLowerCase();
  if (email.length > 254 || !/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(email)) {
    return { ok: false, error: 'Informe um e-mail válido.' };
  }
  return { ok: true, email };
}

export const LINK_ID_PATTERN = /^[A-Z0-9]{4,8}$/;

export function validateLinkId(raw: unknown): boolean {
  return typeof raw === 'string' && LINK_ID_PATTERN.test(raw);
}

/** Mesma regra anti-SSRF da Edge Function (https, sem IP interno, sem *.supabase.co). */
export function validateWebhookUrl(raw: unknown): WebhookCheck {
  return checkWebhookUrl(typeof raw === 'string' ? raw : '');
}

/** Entrada genérica de formulário: só texto, sem controles, com limite (padrão 500). */
export function sanitizeUserInput(value: unknown, options: { max?: number; multiline?: boolean } = {}): string {
  const max = options.max ?? 500;
  return options.multiline ? sanitizeForStorage(value, max) : sanitizeText(value, max);
}
