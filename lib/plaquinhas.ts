import { getRandomBytes } from 'expo-crypto';

import { sanitizeText, sanitizeUrl, validateLinkId, validateWebhookUrl } from '@/core/validation/securityValidator';
import {
  buildLinkUrl,
  generateLinkId as generateWith,
  pageRange,
  PLAQUINHA_NAME_MAX,
  PLAQUINHAS_PAGE_SIZE,
  profilePageUrl,
  resolveProfilePageBase,
  resolveRedirectBase,
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
  hasMorePages,
  isDestinationType,
  LINK_ID_ALPHABET,
  LINK_ID_LENGTH,
  mergePage,
  parseDestination,
  PLAQUINHA_NAME_MAX,
  PLAQUINHAS_PAGE_SIZE,
  resolveRedirectBase,
  SCAN_TYPE_LABELS,
  shortDisplayUrl,
  SYNC_LABELS,
  syncStatus,
} from '@/lib/plaquinhaLogic';
export type { DestinationForm, DestinationType, RedirectLink, ScanDay, ScanLog, ScanStats, SyncStatus } from '@/lib/plaquinhaLogic';

export const BASE_URL = resolveRedirectBase(process.env.EXPO_PUBLIC_SUPABASE_URL);
export const PROFILE_PAGE_BASE = resolveProfilePageBase(process.env.EXPO_PUBLIC_PROFILE_PAGE_URL);

/** Endereço público da mini página (EAS Hosting). Não conta scan: quem conta é a URL curta. */
export function getProfilePageUrl(id: string): string {
  return profilePageUrl(PROFILE_PAGE_BASE, id);
}


const MAX_ID_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';
const BASE_COLUMNS = 'id, user_id, name, destination_url, destination_type, is_active, scan_count, nfc_synced, qr_synced, created_at, updated_at';
const PROFILE_COLUMNS = `${BASE_COLUMNS}, profile_enabled, webhook_url`;
let profileColumns = true;

type DbError = { message?: string; code?: string } | null;

/** Coluna nova ainda não criada no servidor (migração do perfil pendente). */
export function isMissingColumn(error: DbError | undefined): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return error?.code === '42703' || error?.code === 'PGRST204' || (message.includes('column') && (message.includes('does not exist') || message.includes('could not find')));
}

/** Falso quando o banco ainda não tem as colunas de perfil/webhook. */
export function profileFeaturesReady(): boolean {
  return profileColumns;
}

async function selectWithFallback<R extends { error: DbError }>(run: (columns: string) => PromiseLike<R>): Promise<R> {
  if (profileColumns) {
    const result = await run(PROFILE_COLUMNS);
    if (!result.error || !isMissingColumn(result.error)) {
      return result;
    }
    profileColumns = false;
  }
  return run(BASE_COLUMNS);
}

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

/** Sempre o usuário da sessão; nunca um id vindo de rota ou parâmetro. */
function sessionUserId(): string {
  const id = useAuthStore.getState().user?.id;
  if (!id) {
    throw new PlaquinhaError('Entre na sua conta para usar as plaquinhas.');
  }
  return id;
}

export function friendly(error: DbError, fallback: string): PlaquinhaError {
  const message = (error?.message ?? '').toLowerCase();
  if (message.includes('fetch') || message.includes('network')) {
    return new PlaquinhaError('Sem conexão. Tente novamente.');
  }
  if (isMissingColumn(error) || error?.code === 'PGRST202' || message.includes('could not find the function')) {
    return new PlaquinhaError('O servidor ainda não tem os recursos de perfil e webhook. Aplique a atualização do banco (supabase db push).');
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

export interface PlaquinhasPage {
  items: RedirectLink[];
  total: number | null;
}

/** Página `page` (0-based) das plaquinhas do usuário da sessão, mais novas primeiro, com total exato. */
export async function getPlaquinhas(page = 0, limit = PLAQUINHAS_PAGE_SIZE): Promise<PlaquinhasPage> {
  const userId = sessionUserId();
  const { from, to } = pageRange(page, limit);
  const { data, error, count } = await selectWithFallback((columns) =>
    client().from('redirect_links').select(columns, { count: 'exact' }).eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to),
  );
  if (error) {
    throw friendly(error, 'Não foi possível carregar as plaquinhas.');
  }
  return { items: (data ?? []) as unknown as RedirectLink[], total: typeof count === 'number' ? count : null };
}

/** Primeira plaquinha ativa com página de perfil ligada (atalho "Ver minha página"). */
export async function findProfilePlaquinha(): Promise<RedirectLink | null> {
  const userId = sessionUserId();
  if (!profileColumns) {
    return null;
  }
  const { data, error } = await client()
    .from('redirect_links')
    .select(PROFILE_COLUMNS)
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('profile_enabled', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) {
      profileColumns = false;
      return null;
    }
    throw friendly(error, 'Não foi possível procurar sua página.');
  }
  return (data as unknown as RedirectLink | null) ?? null;
}

export async function getPlaquinha(linkId: string): Promise<RedirectLink | null> {
  if (!validateLinkId(linkId)) {
    return null;
  }
  const { data, error } = await selectWithFallback((columns) => client().from('redirect_links').select(columns).eq('id', linkId).maybeSingle());
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
