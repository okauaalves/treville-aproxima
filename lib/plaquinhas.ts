import { getRandomBytes } from 'expo-crypto';

import { Config } from '@/constants/config';
import { sanitizeText, sanitizeUrl, validateLinkId, validateWebhookUrl } from '@/core/validation/securityValidator';
import {
  buildLinkUrl,
  generateLinkId as generateWith,
  PLAQUINHA_NAME_MAX,
  profilePageUrl,
  resolveProfilePageBase,
  type DestinationType,
  type RedirectLink,
  type ScanLog,
} from '@/lib/plaquinhaLogic';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export {
  aggregateScans,
  buildDestination,
  buildLinkUrl,
  checkDestinationUrl,
  CREATE_DESTINATION_TYPES,
  DESTINATION_LABELS,
  EMPTY_DESTINATION,
  FALLBACK_REDIRECT_BASE,
  formatDateTimePtBr,
  isDestinationType,
  LINK_ID_ALPHABET,
  LINK_ID_LENGTH,
  parseDestination,
  PLAQUINHA_NAME_MAX,
  resolveRedirectBase,
  SCAN_TYPE_LABELS,
  shortDisplayUrl,
  SYNC_LABELS,
  syncStatus,
} from '@/lib/plaquinhaLogic';
export type { DestinationForm, DestinationType, RedirectLink, ScanDay, ScanLog, ScanStats, SyncStatus } from '@/lib/plaquinhaLogic';

export const BASE_URL = Config.redirectBase;
export const PROFILE_PAGE_BASE = resolveProfilePageBase(process.env.EXPO_PUBLIC_PROFILE_PAGE_URL);

/** Endereço público da mini página (EAS Hosting). Não conta scan: quem conta é a URL curta. */
export function getProfilePageUrl(id: string): string {
  return profilePageUrl(PROFILE_PAGE_BASE, id);
}


const MAX_ID_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';
const LINK_COLUMNS = 'id, user_id, name, destination_url, destination_type, is_active, scan_count, nfc_synced, created_at, updated_at, profile_enabled, webhook_url';
const LIST_COLUMNS = 'id, name, destination_url, destination_type, is_active, profile_enabled, nfc_synced, scan_count, created_at';

type DbError = { message?: string; code?: string; status?: number } | null;

export class PlaquinhaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaquinhaError';
  }
}

/** Sem sessão, JWT expirado/inválido ou 401: a tela deve mandar para o login. */
export class SessionError extends PlaquinhaError {
  constructor(message = 'Sessão expirada. Entre de novo.') {
    super(message);
    this.name = 'SessionError';
  }
}

export function isSessionError(error: unknown): error is SessionError {
  return error instanceof SessionError;
}

function isAuthFailure(error: DbError): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return error?.status === 401 || error?.code === 'PGRST301' || error?.code === 'PGRST302' || error?.code === 'PGRST303' || message.includes('jwt');
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

/** Sempre o usuário da sessão; nunca um id vindo de rota ou parâmetro. */
function sessionUserId(): string {
  const id = useAuthStore.getState().user?.id;
  if (!id) {
    throw new SessionError('Entre na sua conta para usar as plaquinhas.');
  }
  return id;
}

export function friendly(error: DbError, fallback: string): PlaquinhaError {
  const message = (error?.message ?? '').toLowerCase();
  if (isAuthFailure(error)) {
    return new SessionError();
  }
  if (message.includes('fetch') || message.includes('network')) {
    return new PlaquinhaError('Sem conexão. Tente novamente.');
  }
  return new PlaquinhaError(fallback);
}

function validDestination(url: string): string {
  const check = sanitizeUrl(url);
  if (!check.ok) {
    throw new PlaquinhaError(check.error);
  }
  return check.url;
}

/**
 * `preferredId` é o código mostrado no preview; se colidir, gera outro.
 * Perfil completo (`destinationType: 'profile'`): nasce com a página ativa e o destino reserva é a própria
 * página pública; ao salvar os links, o reserva passa a ser o primeiro link (ver syncProfileFallback).
 */
export async function createPlaquinha(input: { name: string; destinationUrl: string; destinationType: DestinationType; preferredId?: string }): Promise<string> {
  const db = client();
  const userId = sessionUserId();
  const profile = input.destinationType === 'profile';
  const name = sanitizeText(input.name, PLAQUINHA_NAME_MAX);
  if (!name) {
    throw new PlaquinhaError('Dê um nome para a plaquinha.');
  }
  const destination = profile ? '' : validDestination(input.destinationUrl);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const id = attempt === 0 && input.preferredId && /^[A-Z2-9]{6}$/.test(input.preferredId) ? input.preferredId : generateLinkId();
    const row: Record<string, unknown> = {
      id,
      user_id: userId,
      name,
      destination_url: profile ? validDestination(getProfilePageUrl(id)) : destination,
      destination_type: input.destinationType,
    };
    if (profile) {
      row.profile_enabled = true;
    }
    const { error } = await db.from('redirect_links').insert(row);
    if (!error) {
      return id;
    }
    if (error.code !== UNIQUE_VIOLATION) {
      throw friendly(error, 'Não foi possível criar a plaquinha.');
    }
  }
  throw new PlaquinhaError('Não foi possível gerar um código livre. Tente de novo.');
}

const NO_EDIT_PERMISSION = 'Você não tem permissão para editar esta plaquinha. Solicite acesso ao administrador.';

/** Dono, admin ou edição aprovada no prazo (can_edit_link). O banco repete a checagem (RLS + trigger). */
export async function updateDestino(linkId: string, newUrl: string, type: DestinationType): Promise<void> {
  const destination = validDestination(newUrl);
  const db = client();
  const { data: allowed, error: checkError } = await db.rpc('can_edit_link', { link_id_param: linkId });
  if (!checkError && allowed === false) {
    throw new PlaquinhaError(NO_EDIT_PERMISSION);
  }
  const { data, error } = await db
    .from('redirect_links')
    .update({ destination_url: destination, destination_type: type, updated_at: new Date().toISOString() })
    .eq('id', linkId)
    .select('id');
  if (error) {
    if (error.code === '42501') {
      throw new PlaquinhaError(error.message || NO_EDIT_PERMISSION);
    }
    throw friendly(error, 'Não foi possível salvar o destino.');
  }
  if (!data?.length) {
    throw new PlaquinhaError(NO_EDIT_PERMISSION);
  }
}

/** Todas as plaquinhas do usuário da sessão (ativas e inativas), mais novas primeiro. */
export async function getPlaquinhas(): Promise<RedirectLink[]> {
  const userId = sessionUserId();
  const { data, error, status } = await client()
    .from('redirect_links')
    .select(LIST_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    throw friendly({ ...error, status }, 'Não foi possível carregar as plaquinhas.');
  }
  return (data ?? []) as unknown as RedirectLink[];
}

/** Primeira plaquinha ativa com página de perfil ligada (atalho "Ver minha página"). */
export async function findProfilePlaquinha(): Promise<RedirectLink | null> {
  const userId = sessionUserId();
  const { data, error } = await client()
    .from('redirect_links')
    .select(LINK_COLUMNS)
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('profile_enabled', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw friendly(error, 'Não foi possível procurar sua página.');
  }
  return (data as unknown as RedirectLink | null) ?? null;
}

export async function getPlaquinha(linkId: string): Promise<RedirectLink | null> {
  if (!validateLinkId(linkId)) {
    return null;
  }
  const { data, error } = await client().from('redirect_links').select(LINK_COLUMNS).eq('id', linkId).maybeSingle();
  if (error) {
    throw friendly(error, 'Não foi possível carregar a plaquinha.');
  }
  return (data as unknown as RedirectLink | null) ?? null;
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

export interface ScanDetails {
  qr: number;
  nfc: number;
  lastScanAt: string | null;
  recent: ScanLog[];
  week: ScanLog[];
}

/** Contagens por tipo direto no banco (head + count) + últimos 10 + logs dos últimos 7 dias. */
export async function getScanDetails(linkId: string, now: Date = new Date()): Promise<ScanDetails> {
  const db = client();
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString();
  const countOf = (type: 'qr' | 'nfc') => db.from('scan_logs').select('id', { count: 'exact', head: true }).eq('link_id', linkId).eq('scan_type', type);
  const [qr, nfc, recent, week] = await Promise.all([
    countOf('qr'),
    countOf('nfc'),
    db.from('scan_logs').select('id, link_id, scanned_at, scan_type').eq('link_id', linkId).order('scanned_at', { ascending: false }).limit(10),
    db.from('scan_logs').select('id, scanned_at, scan_type').eq('link_id', linkId).gte('scanned_at', since).order('scanned_at', { ascending: false }).limit(1000),
  ]);
  const failure = qr.error ?? nfc.error ?? recent.error ?? week.error;
  if (failure) {
    throw friendly(failure, 'Não foi possível carregar as estatísticas.');
  }
  const recentRows = (recent.data ?? []) as ScanLog[];
  return {
    qr: qr.count ?? 0,
    nfc: nfc.count ?? 0,
    lastScanAt: recentRows[0]?.scanned_at ?? null,
    recent: recentRows,
    week: (week.data ?? []) as ScanLog[],
  };
}

/** Perfil completo: o destino reserva (usado se a página for desligada) vira o primeiro link ativo. */
export async function syncProfileFallback(linkId: string, links: { url: string; is_active: boolean }[]): Promise<void> {
  const first = links.find((link) => link.is_active && sanitizeUrl(link.url).ok);
  await updateDestino(linkId, first ? first.url : getProfilePageUrl(linkId), 'profile');
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

/** `null` desliga o webhook. A URL passa pela mesma regra anti-SSRF da Edge Function. */
export async function updateWebhook(linkId: string, url: string | null): Promise<string | null> {
  let value: string | null = null;
  if (url !== null) {
    const check = validateWebhookUrl(url);
    if (!check.ok) {
      throw new PlaquinhaError(check.error);
    }
    value = check.url;
  }
  const { error } = await client().from('redirect_links').update({ webhook_url: value, updated_at: new Date().toISOString() }).eq('id', linkId);
  if (error) {
    throw friendly(error, 'Não foi possível salvar o webhook.');
  }
  return value;
}
