import { getRandomBytes } from 'expo-crypto';

import {
  buildLinkUrl,
  checkDestinationUrl,
  generateLinkId as generateWith,
  PLAQUINHA_NAME_MAX,
  resolveRedirectBase,
  type DestinationType,
  type RedirectLink,
  type ScanLog,
} from '@/lib/plaquinhaLogic';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export {
  aggregateScans,
  buildDestination,
  buildLinkUrl,
  checkDestinationUrl,
  DESTINATION_LABELS,
  EMPTY_DESTINATION,
  FALLBACK_REDIRECT_BASE,
  isDestinationType,
  LINK_ID_ALPHABET,
  LINK_ID_LENGTH,
  parseDestination,
  PLAQUINHA_NAME_MAX,
  resolveRedirectBase,
  shortDisplayUrl,
  SYNC_LABELS,
  syncStatus,
} from '@/lib/plaquinhaLogic';
export type { DestinationForm, DestinationType, RedirectLink, ScanDay, ScanLog, ScanStats, SyncStatus } from '@/lib/plaquinhaLogic';

export const BASE_URL = resolveRedirectBase(process.env.EXPO_PUBLIC_SUPABASE_URL);

const MAX_ID_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';
const COLUMNS = 'id, user_id, name, destination_url, destination_type, is_active, scan_count, nfc_synced, qr_synced, created_at, updated_at';

export class PlaquinhaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaquinhaError';
  }
}

export function generateLinkId(): string {
  return generateWith(getRandomBytes);
}

/** URL curta que vai no QR (via 'qr') ou na tag (via 'nfc', com ?s=nfc para as estatísticas). */
export function getLinkUrl(id: string, via: 'qr' | 'nfc' = 'qr'): string {
  return buildLinkUrl(BASE_URL, id, via);
}

/** Plaquinhas só funcionam com Supabase configurado e sessão real (não no modo local). */
export function plaquinhasAvailable(): boolean {
  return isSupabaseConfigured && supabase !== null;
}

function client() {
  if (!supabase) {
    throw new PlaquinhaError('Plaquinhas precisam de conta e conexão.');
  }
  return supabase;
}

function friendly(error: { message?: string; code?: string } | null, fallback: string): PlaquinhaError {
  const message = (error?.message ?? '').toLowerCase();
  if (message.includes('fetch') || message.includes('network')) {
    return new PlaquinhaError('Sem conexão. Tente novamente.');
  }
  if (error?.code === '42P01' || message.includes('does not exist') || message.includes('could not find the table')) {
    return new PlaquinhaError('O servidor ainda não tem as tabelas de plaquinhas.');
  }
  if (message.includes('jwt') || message.includes('permission') || error?.code === '42501') {
    return new PlaquinhaError('Sessão expirada. Entre de novo.');
  }
  return new PlaquinhaError(fallback);
}

function validDestination(url: string): string {
  const check = checkDestinationUrl(url);
  if (!check.ok) {
    throw new PlaquinhaError(check.error);
  }
  return check.url;
}

/** `preferredId` é o código mostrado no preview; se colidir, gera outro. */
export async function createPlaquinha(input: { name: string; destinationUrl: string; destinationType: DestinationType; userId: string; preferredId?: string }): Promise<string> {
  const db = client();
  const name = input.name.trim().slice(0, PLAQUINHA_NAME_MAX);
  if (!name) {
    throw new PlaquinhaError('Dê um nome para a plaquinha.');
  }
  const destination = validDestination(input.destinationUrl);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const id = attempt === 0 && input.preferredId && /^[A-Z2-9]{6}$/.test(input.preferredId) ? input.preferredId : generateLinkId();
    const { error } = await db.from('redirect_links').insert({
      id,
      user_id: input.userId,
      name,
      destination_url: destination,
      destination_type: input.destinationType,
    });
    if (!error) {
      return id;
    }
    if (error.code !== UNIQUE_VIOLATION) {
      throw friendly(error, 'Não foi possível criar a plaquinha.');
    }
  }
  throw new PlaquinhaError('Não foi possível gerar um código livre. Tente de novo.');
}

export async function updateDestino(linkId: string, newUrl: string, type: DestinationType): Promise<void> {
  const destination = validDestination(newUrl);
  const { error } = await client()
    .from('redirect_links')
    .update({ destination_url: destination, destination_type: type, updated_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) {
    throw friendly(error, 'Não foi possível salvar o destino.');
  }
}

export async function getPlaquinhas(userId: string): Promise<RedirectLink[]> {
  const { data, error } = await client().from('redirect_links').select(COLUMNS).eq('user_id', userId).order('created_at', { ascending: false });
  if (error) {
    throw friendly(error, 'Não foi possível carregar as plaquinhas.');
  }
  return (data ?? []) as RedirectLink[];
}

export async function getPlaquinha(linkId: string): Promise<RedirectLink | null> {
  const { data, error } = await client().from('redirect_links').select(COLUMNS).eq('id', linkId).maybeSingle();
  if (error) {
    throw friendly(error, 'Não foi possível carregar a plaquinha.');
  }
  return (data as RedirectLink | null) ?? null;
}

/** Últimos 100 scans (RLS: só os da própria plaquinha). */
export async function getScanStats(linkId: string): Promise<ScanLog[]> {
  const { data, error } = await client()
    .from('scan_logs')
    .select('id, link_id, scanned_at, scan_type')
    .eq('link_id', linkId)
    .order('scanned_at', { ascending: false })
    .limit(100);
  if (error) {
    throw friendly(error, 'Não foi possível carregar as estatísticas.');
  }
  return (data ?? []) as ScanLog[];
}

export async function togglePlaquinha(linkId: string, isActive: boolean): Promise<void> {
  const { error } = await client().from('redirect_links').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', linkId);
  if (error) {
    throw friendly(error, 'Não foi possível mudar o status.');
  }
}

export async function markNfcSynced(linkId: string): Promise<void> {
  const { error } = await client().from('redirect_links').update({ nfc_synced: true, updated_at: new Date().toISOString() }).eq('id', linkId);
  if (error) {
    throw friendly(error, 'A tag foi gravada, mas não deu para salvar o status.');
  }
}
