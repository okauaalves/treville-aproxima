import { supabase } from '@/lib/supabase';
import type { AppUser } from '@/types/auth';

type AdminCandidate = Pick<AppUser, 'id' | 'email' | 'app_metadata'> | null | undefined;

/** Por sessão: user id -> resultado (ou consulta em andamento). Limpo em logout/troca de e-mail. */
const cache = new Map<string, Promise<boolean>>();
const resolved = new Map<string, boolean>();

function cacheKey(user: NonNullable<AdminCandidate>): string {
  return `${user.id}:${(user.email ?? '').trim().toLowerCase()}`;
}

/** Tabela ainda não migrada no banco remoto: trata como "ninguém é admin" sem poluir o log. */
function isMissingTable(error: { code?: string; status?: number; message?: string }): boolean {
  return error.code === 'PGRST205' || error.code === '42P01' || error.status === 404;
}

/** is_admin() no servidor (JWT + tabela admins + e-mail confirmado); sem a RPC, cai na consulta da tabela. */
async function queryAdmin(email: string): Promise<boolean> {
  if (!supabase) {
    return false;
  }
  try {
    const rpc = await supabase.rpc('is_admin');
    if (!rpc.error) {
      return rpc.data === true;
    }
    if (rpc.error.code !== 'PGRST202' && rpc.error.code !== '42883') {
      console.warn('[admin] falha ao consultar is_admin:', rpc.error.message);
      return false;
    }
    const { data, error, status } = await supabase.from('admins').select('email').eq('email', email).maybeSingle();
    if (error) {
      if (!isMissingTable({ ...error, status })) {
        console.warn('[admin] falha ao consultar admins:', error.message);
      }
      return false;
    }
    return !!data;
  } catch (failure) {
    console.warn('[admin] falha ao consultar admins:', failure instanceof Error ? failure.message : failure);
    return false;
  }
}

/** A UI do painel depende disto; a autorização real fica na Edge Function admin. */
export async function isAdminUser(user: AdminCandidate): Promise<boolean> {
  if (!user) {
    return false;
  }
  if (user.app_metadata?.role === 'admin') {
    return true;
  }
  const email = user.email?.trim().toLowerCase();
  if (!email) {
    return false;
  }
  const key = cacheKey(user);
  let pending = cache.get(key);
  if (!pending) {
    pending = queryAdmin(email).then((value) => {
      if (cache.get(key) === pending) {
        resolved.set(key, value);
      }
      return value;
    });
    cache.set(key, pending);
  }
  return pending;
}

/** Resultado já conhecido para este usuário (evita piscar a UI ao remontar). */
export function getCachedAdmin(user: AdminCandidate): boolean | undefined {
  if (!user) {
    return false;
  }
  if (user.app_metadata?.role === 'admin') {
    return true;
  }
  if (!user.email) {
    return false;
  }
  return resolved.get(cacheKey(user));
}

export function clearAdminCache(): void {
  cache.clear();
  resolved.clear();
}

supabase?.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
    clearAdminCache();
  }
});
