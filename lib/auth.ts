import { Config } from '@/constants/config';
import { classifyRpc, decideAdmin, isFallbackAdminEmail, normalizeAdminEmail, NOT_ADMIN, type AdminDecision, type RpcOutcome } from '@/lib/adminCheck';
import { supabase } from '@/lib/supabase';
import type { AppUser } from '@/types/auth';
import { logger } from '@/utils/logger';

type AdminCandidate = Pick<AppUser, 'id' | 'email' | 'app_metadata'> | null | undefined;

/** Consulta em andamento (deduplica telas montando juntas) e último resultado (evita piscar ao remontar). */
const inflight = new Map<string, Promise<AdminDecision>>();
const resolved = new Map<string, AdminDecision>();

function cacheKey(user: NonNullable<AdminCandidate>): string {
  return `${user.id}:${normalizeAdminEmail(user.email)}:${String(user.app_metadata?.role ?? '')}`;
}

async function callIsAdmin(): Promise<RpcOutcome> {
  if (!supabase) {
    return { kind: 'error' };
  }
  try {
    const outcome = classifyRpc(await supabase.rpc('is_admin'));
    if (outcome.kind === 'error' || outcome.kind === 'network') {
      logger.warn('[admin] falha ao consultar is_admin', outcome.kind);
    }
    return outcome;
  } catch (failure) {
    logger.warn('[admin] is_admin sem conexão', failure);
    return classifyRpc(failure instanceof Error ? failure : new Error(String(failure)));
  }
}

/** Banco sem a RPC: a tabela admins (se existir) ainda lista admins além do principal. */
async function adminTableHas(email: string): Promise<boolean> {
  if (!supabase) {
    return false;
  }
  try {
    const { data, error } = await supabase.from('admins').select('email').eq('email', email).maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

async function runCheck(user: NonNullable<AdminCandidate>): Promise<AdminDecision> {
  const email = normalizeAdminEmail(user.email);
  const rpc = await callIsAdmin();
  const tableHit = rpc.kind === 'missing' && email !== '' && !isFallbackAdminEmail(email) ? await adminTableHas(email) : false;
  return decideAdmin({ user, rpc, tableHit, extraEmail: Config.adminEmail });
}

/** Sempre consulta o servidor de novo (foco/troca de sessão); só junta chamadas simultâneas. */
export function checkAdmin(user: AdminCandidate): Promise<AdminDecision> {
  if (!user) {
    return Promise.resolve(NOT_ADMIN);
  }
  const key = cacheKey(user);
  const running = inflight.get(key);
  if (running) {
    return running;
  }
  const pending = runCheck(user)
    .then((decision) => {
      if (inflight.get(key) === pending) {
        resolved.set(key, decision);
      }
      return decision;
    })
    .finally(() => {
      if (inflight.get(key) === pending) {
        inflight.delete(key);
      }
    });
  inflight.set(key, pending);
  return pending;
}

/** A UI do painel depende disto; a autorização real fica no servidor (RLS + Edge Function admin). */
export async function isAdminUser(user: AdminCandidate): Promise<boolean> {
  return (await checkAdmin(user)).isAdmin;
}

/** Último resultado conhecido para este usuário (undefined = ainda não consultado). */
export function getCachedAdmin(user: AdminCandidate): AdminDecision | undefined {
  if (!user) {
    return NOT_ADMIN;
  }
  return resolved.get(cacheKey(user));
}

export function adminCacheKey(user: AdminCandidate): string {
  return user ? cacheKey(user) : '';
}

export function clearAdminCache(): void {
  inflight.clear();
  resolved.clear();
}

supabase?.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
    clearAdminCache();
  }
});
