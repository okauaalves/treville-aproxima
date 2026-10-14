import { supabase } from '@/lib/supabase';
import {
  ADMIN_NAME_MAX,
  EDIT_REASON_MAX,
  isExpired,
  normalizeEmail,
  parsePlaquinhaCode,
  type EditRequestRow,
  type EditRequestStatus,
} from '@/lib/editAccessLogic';
import type { RedirectLink } from '@/lib/plaquinhaLogic';
import { isAdminUser } from '@/lib/auth';
import { checkEmail } from '@/supabase/functions/_shared/adminAccess';
import { useAuthStore } from '@/stores/authStore';

// Toda decisão é do banco (RLS + triggers + RPCs SECURITY DEFINER); aqui só chamadas e mensagens.

const MIGRATION_HINT = 'Banco desatualizado. Rode: npx supabase db push.';
const SHARED_COLUMNS = 'id, name, destination_url, destination_type, is_active, profile_enabled, nfc_synced, scan_count, created_at';

type DbError = { message?: string; code?: string; details?: string; hint?: string } | null;

export class AdminAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAccessError';
  }
}

function db() {
  if (!supabase) {
    throw new AdminAccessError('Precisa de conta e conexão.');
  }
  return supabase;
}

function sessionUserId(): string {
  const id = useAuthStore.getState().user?.id;
  if (!id) {
    throw new AdminAccessError('Entre na sua conta.');
  }
  return id;
}

function isMissing(error: DbError): boolean {
  return error?.code === 'PGRST202' || error?.code === 'PGRST205' || error?.code === '42883' || error?.code === '42P01';
}

/** Mensagens das RPCs/triggers já vêm em português; erros técnicos viram o `fallback`. */
function fail(error: DbError, fallback: string): AdminAccessError {
  const message = error?.message ?? '';
  if (isMissing(error)) {
    return new AdminAccessError(MIGRATION_HINT);
  }
  if (error?.code === '23505') {
    return new AdminAccessError('Você já tem uma solicitação ativa para esta plaquinha.');
  }
  if (/fetch|network/i.test(message)) {
    return new AdminAccessError('Sem conexão. Tente novamente.');
  }
  if (['42501', '22023', 'P0002', '54000'].includes(error?.code ?? '') && message && !/row-level security|permission denied/i.test(message)) {
    return new AdminAccessError(message);
  }
  if (/row-level security|permission denied/i.test(message)) {
    return new AdminAccessError('Sem permissão para esta ação.');
  }
  return new AdminAccessError(fallback);
}

/** Mesma decisão do useIsAdmin (RPC is_admin, com fallback de UI por e-mail/tabela admins). */
export function isAdmin(): Promise<boolean> {
  return isAdminUser(useAuthStore.getState().user);
}

export interface PlaquinhaLookup {
  id: string;
  name: string;
}

/** Aceita código, URL curta ou URL da página. `null` = código válido mas inexistente. */
export async function lookupPlaquinha(input: string): Promise<PlaquinhaLookup | null> {
  const code = parsePlaquinhaCode(input);
  if (!code) {
    throw new AdminAccessError('Código inválido. Use 4 a 8 letras/números ou cole a URL da plaquinha.');
  }
  const { data, error } = await db().rpc('lookup_plaquinha', { p_code: code });
  if (error) {
    throw fail(error, 'Não foi possível procurar a plaquinha.');
  }
  const row = (Array.isArray(data) ? data[0] : data) as PlaquinhaLookup | undefined;
  return row?.id ? { id: String(row.id), name: String(row.name ?? '') } : null;
}

/** `link_name` e `user_email` são sobrescritos pelo trigger no servidor; vão só por serem NOT NULL. */
export async function requestEditAccess(linkId: string, linkName: string, reason?: string): Promise<void> {
  const text = (reason ?? '').trim();
  if (text.length > EDIT_REASON_MAX) {
    throw new AdminAccessError(`Motivo muito longo (máximo ${EDIT_REASON_MAX} caracteres).`);
  }
  const { error } = await db()
    .from('edit_requests')
    .insert({ user_id: sessionUserId(), link_id: linkId, link_name: linkName.slice(0, 80), user_email: '', status: 'pending', reason: text || null });
  if (error) {
    throw fail(error, 'Não foi possível enviar a solicitação.');
  }
}

export async function canEditLink(linkId: string): Promise<boolean> {
  if (!supabase) {
    return false;
  }
  const { data, error } = await supabase.rpc('can_edit_link', { link_id_param: linkId });
  if (error) {
    if (isMissing(error)) {
      return true;
    }
    throw fail(error, 'Não foi possível verificar a permissão.');
  }
  return data === true;
}

async function review(id: string, patch: Record<string, unknown>, fallback: string): Promise<void> {
  const { data, error } = await db().from('edit_requests').update(patch).eq('id', id).select('id');
  if (error) {
    throw fail(error, fallback);
  }
  if (!data?.length) {
    throw new AdminAccessError('Solicitação não encontrada ou sem permissão.');
  }
}

/** `expiresAt` null = sem prazo. reviewed_by/reviewed_at são preenchidos pelo trigger. */
export function approveEditRequest(id: string, expiresAt: string | null = null): Promise<void> {
  return review(id, { status: 'approved', expires_at: expiresAt }, 'Não foi possível aprovar.');
}

export function denyEditRequest(id: string): Promise<void> {
  return review(id, { status: 'denied' }, 'Não foi possível negar.');
}

export function revokeEditAccess(id: string): Promise<void> {
  return review(id, { status: 'revoked' }, 'Não foi possível revogar.');
}

export interface AdminEditRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  avatarUrl: string | null;
  linkId: string;
  linkName: string;
  reason: string | null;
  status: EditRequestStatus;
  requestedAt: string;
  reviewedAt: string | null;
  expiresAt: string | null;
}

export async function getAllEditRequests(): Promise<AdminEditRequest[]> {
  const { data, error } = await db().rpc('admin_list_edit_requests');
  if (error) {
    throw fail(error, 'Não foi possível carregar as solicitações.');
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id ?? ''),
    userEmail: String(row.user_email ?? ''),
    userName: String(row.user_name ?? row.user_email ?? ''),
    avatarUrl: typeof row.avatar_url === 'string' && row.avatar_url ? row.avatar_url : null,
    linkId: String(row.link_id ?? ''),
    linkName: String(row.link_name ?? ''),
    reason: typeof row.reason === 'string' && row.reason ? row.reason : null,
    status: row.status as EditRequestStatus,
    requestedAt: String(row.requested_at ?? ''),
    reviewedAt: typeof row.reviewed_at === 'string' ? row.reviewed_at : null,
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
  }));
}

/** Só admin (RLS is_admin); para os demais a contagem volta 0. */
export async function countPendingEditRequests(): Promise<number> {
  if (!supabase) {
    return 0;
  }
  const { count, error } = await supabase.from('edit_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  return error ? 0 : (count ?? 0);
}

/** Pedidos do próprio usuário (RLS: só os seus). */
export async function getMyEditRequests(): Promise<EditRequestRow[]> {
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from('edit_requests')
    .select('id, link_id, link_name, status, reason, requested_at, reviewed_at, expires_at')
    .eq('user_id', sessionUserId())
    .order('requested_at', { ascending: false })
    .limit(200);
  if (error) {
    if (isMissing(error)) {
      return [];
    }
    throw fail(error, 'Não foi possível carregar suas solicitações.');
  }
  return (data ?? []) as EditRequestRow[];
}

/** Plaquinhas de outros com edição aprovada e no prazo (policy links_shared_select). */
export async function getSharedPlaquinhas(requests: EditRequestRow[], now: Date = new Date()): Promise<RedirectLink[]> {
  const ids = [...new Set(requests.filter((row) => row.status === 'approved' && !isExpired(row.expires_at, now)).map((row) => row.link_id))];
  if (!supabase || ids.length === 0) {
    return [];
  }
  const { data, error } = await supabase.from('redirect_links').select(SHARED_COLUMNS).in('id', ids).neq('user_id', sessionUserId());
  if (error) {
    throw fail(error, 'Não foi possível carregar as plaquinhas compartilhadas.');
  }
  return (data ?? []) as unknown as RedirectLink[];
}

export interface AdminEntry {
  email: string;
  name: string | null;
  createdAt: string;
  isPrimary: boolean;
  hasAccount: boolean;
}

export async function listAdmins(): Promise<AdminEntry[]> {
  const { data, error } = await db().rpc('list_admins');
  if (error) {
    throw fail(error, 'Não foi possível carregar os administradores.');
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    email: String(row.email ?? ''),
    name: typeof row.name === 'string' && row.name ? row.name : null,
    createdAt: String(row.created_at ?? ''),
    isPrimary: row.is_primary === true,
    hasAccount: row.has_account === true,
  }));
}

export async function addAdmin(email: string, name: string): Promise<string> {
  const checked = checkEmail(email);
  if (!checked.ok) {
    throw new AdminAccessError(checked.error);
  }
  const cleanName = name.trim();
  if (cleanName.length > ADMIN_NAME_MAX) {
    throw new AdminAccessError(`Nome muito longo (máximo ${ADMIN_NAME_MAX} caracteres).`);
  }
  const { error } = await db().rpc('add_admin', { p_email: checked.value, p_name: cleanName || null });
  if (error) {
    throw fail(error, 'Não foi possível adicionar o administrador.');
  }
  return checked.value;
}

export async function removeAdmin(email: string): Promise<void> {
  const { error } = await db().rpc('remove_admin', { p_email: normalizeEmail(email) });
  if (error) {
    throw fail(error, 'Não foi possível remover o administrador.');
  }
}
