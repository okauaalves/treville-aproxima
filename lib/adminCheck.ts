// Decisão de "mostrar a área admin" (pura, testável). Só controla a UI: o acesso aos dados é decidido
// no servidor (is_admin() nas policies RLS e na Edge Function admin).

import { Config } from '@/constants/config';
import { PRIMARY_ADMIN_EMAIL } from '@/lib/editAccessLogic';

export type RpcOutcome = { kind: 'ok'; value: boolean } | { kind: 'missing' } | { kind: 'network' } | { kind: 'error' };

export interface AdminDecision {
  isAdmin: boolean;
  /** jwt = app_metadata.role; server = RPC is_admin; fallback = e-mail conhecido sem resposta do servidor. */
  source: 'jwt' | 'server' | 'fallback' | 'none';
  /** RPC is_admin inexistente no banco: migrações não aplicadas (supabase db push). */
  serverMissing: boolean;
}

export const NOT_ADMIN: AdminDecision = { isAdmin: false, source: 'none', serverMissing: false };

type AdminUser = { email?: string | null; app_metadata?: Record<string, unknown> | null } | null | undefined;
type RpcError = { code?: string; message?: string; status?: number } | null | undefined;

export function normalizeAdminEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isFallbackAdminEmail(email: unknown, extra: string | null | undefined = Config.adminEmail): boolean {
  const target = normalizeAdminEmail(email);
  if (!target) {
    return false;
  }
  return target === PRIMARY_ADMIN_EMAIL || target === normalizeAdminEmail(extra);
}

const MISSING_CODES = ['PGRST202', '42883'];

/** Resultado de `supabase.rpc('is_admin')` (ou a exceção lançada) reduzido ao que importa para a decisão. */
export function classifyRpc(result: unknown): RpcOutcome {
  if (result instanceof Error) {
    return { kind: 'network' };
  }
  const { data, error, status } = (result ?? {}) as { data?: unknown; error?: RpcError; status?: number };
  if (!error) {
    return { kind: 'ok', value: data === true };
  }
  const code = error.code ?? '';
  if (MISSING_CODES.includes(code) || (!code && (status === 404 || error.status === 404))) {
    return { kind: 'missing' };
  }
  if (!code && /fetch|network|timeout|abort|offline/i.test(error.message ?? '')) {
    return { kind: 'network' };
  }
  return { kind: 'error' };
}

export function decideAdmin(input: { user: AdminUser; rpc: RpcOutcome; tableHit?: boolean; extraEmail?: string | null }): AdminDecision {
  const { user, rpc } = input;
  if (!user) {
    return NOT_ADMIN;
  }
  const serverMissing = rpc.kind === 'missing';
  if (user.app_metadata?.role === 'admin') {
    return { isAdmin: true, source: 'jwt', serverMissing };
  }
  if (rpc.kind === 'ok') {
    return { isAdmin: rpc.value, source: 'server', serverMissing: false };
  }
  const known = isFallbackAdminEmail(user.email, input.extraEmail === undefined ? Config.adminEmail : input.extraEmail) || input.tableHit === true;
  return { isAdmin: known, source: known ? 'fallback' : 'none', serverMissing };
}
