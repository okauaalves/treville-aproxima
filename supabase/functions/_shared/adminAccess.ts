// Validação das ações de acesso e do lote de plaquinhas: usada pela Edge Function `admin` e pelo app.
// Sem APIs de Deno ou React Native para rodar nos dois lados.
import { checkDestinationUrl } from './destination.ts';

export const ACCESS_STATUSES = ['pending', 'approved', 'blocked'] as const;
export type AccessRowStatus = (typeof ACCESS_STATUSES)[number];

export const BATCH_TYPES = ['url', 'whatsapp', 'instagram', 'profile', 'empty'] as const;
export type BatchType = (typeof BATCH_TYPES)[number];

export const BATCH_MAX = 100;
export const BATCH_PREFIX_MAX = 40;
export const LINK_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LINK_ID_LENGTH = 6;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export function isAccessStatus(value: unknown): value is AccessRowStatus {
  return typeof value === 'string' && (ACCESS_STATUSES as readonly string[]).includes(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function checkEmail(raw: unknown): Checked<string> {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!email) {
    return { ok: false, error: 'Informe o e-mail.' };
  }
  if (email.length > 320 || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'E-mail inválido.' };
  }
  return { ok: true, value: email };
}

export function isBatchType(value: unknown): value is BatchType {
  return typeof value === 'string' && (BATCH_TYPES as readonly string[]).includes(value);
}

/** Prefixo sem caracteres de controle e espaços repetidos. */
export function cleanPrefix(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim() : '';
}

/** '{Prefixo} 1..N' a partir de `start` (lotes enviados em blocos continuam a numeração). */
export function batchNames(prefix: string, count: number, start = 1): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix} ${start + index}`);
}

export interface BatchInput {
  quantity: number;
  start: number;
  prefix: string;
  type: BatchType;
  /** null = sem destino padrão (a plaquinha nasce inativa, "Sem destino"). */
  url: string | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Destino padrão de um tipo. Vazio vira null; WhatsApp e Instagram precisam apontar para o próprio serviço. */
export function checkBatchDestination(type: BatchType, raw: unknown): Checked<string | null> {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (type === 'profile' || type === 'empty' || !value) {
    return { ok: true, value: null };
  }
  const check = checkDestinationUrl(value);
  if (!check.ok) {
    return { ok: false, error: check.error };
  }
  const host = hostOf(check.url);
  if (type === 'whatsapp' && host !== 'wa.me' && host !== 'api.whatsapp.com') {
    return { ok: false, error: 'O destino do WhatsApp precisa ser um link wa.me.' };
  }
  if (type === 'instagram' && host !== 'instagram.com') {
    return { ok: false, error: 'O destino do Instagram precisa ser um link instagram.com.' };
  }
  if (type === 'url' && !/^https?:/i.test(check.url)) {
    return { ok: false, error: 'Use um link http(s).' };
  }
  return { ok: true, value: check.url };
}

export function checkBatchInput(body: Record<string, unknown>): Checked<BatchInput> {
  const quantity = Number(body.quantity);
  const start = body.start === undefined ? 1 : Number(body.start);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > BATCH_MAX) {
    return { ok: false, error: `Quantidade entre 1 e ${BATCH_MAX}.` };
  }
  if (!Number.isInteger(start) || start < 1 || start + quantity - 1 > BATCH_MAX) {
    return { ok: false, error: `O lote vai no máximo até ${BATCH_MAX}.` };
  }
  const prefix = cleanPrefix(body.prefix);
  if (!prefix) {
    return { ok: false, error: 'Informe o prefixo do nome.' };
  }
  if (prefix.length > BATCH_PREFIX_MAX) {
    return { ok: false, error: `Prefixo com até ${BATCH_PREFIX_MAX} caracteres.` };
  }
  if (!isBatchType(body.type)) {
    return { ok: false, error: 'Tipo de destino inválido.' };
  }
  const url = checkBatchDestination(body.type, body.url);
  if (!url.ok) {
    return url;
  }
  return { ok: true, value: { quantity, start, prefix, type: body.type, url: url.value } };
}

/** 32 símbolos: byte % 32 não tem viés (256 é múltiplo de 32). */
export function makeLinkId(randomBytes: (count: number) => Uint8Array, length = LINK_ID_LENGTH): string {
  const bytes = randomBytes(length);
  let id = '';
  for (let index = 0; index < length; index += 1) {
    id += LINK_ID_ALPHABET[(bytes[index] ?? 0) % LINK_ID_ALPHABET.length];
  }
  return id;
}

export interface BatchRow {
  id: string;
  user_id: string;
  name: string;
  destination_url: string;
  destination_type: string;
  is_active: boolean;
  profile_enabled: boolean;
}

/**
 * Linhas para um insert multi-linha. 'Vazio' (ou sem URL padrão) não pode violar o CHECK de destino:
 * nasce inativa com a página pública como destino reservado e `destination_type = 'empty'`.
 */
export function buildBatchRows(input: BatchInput, userId: string, ids: string[], profileBase: string): BatchRow[] {
  const base = profileBase.replace(/\/+$/, '');
  return batchNames(input.prefix, input.quantity, input.start).map((name, index) => {
    const id = ids[index] ?? '';
    const page = `${base}/${encodeURIComponent(id)}`;
    if (input.type === 'profile') {
      return { id, user_id: userId, name, destination_url: page, destination_type: 'profile', is_active: true, profile_enabled: true };
    }
    if (input.type === 'empty' || !input.url) {
      return { id, user_id: userId, name, destination_url: page, destination_type: 'empty', is_active: false, profile_enabled: false };
    }
    return { id, user_id: userId, name, destination_url: input.url, destination_type: input.type, is_active: true, profile_enabled: false };
  });
}
