import { supabase } from '@/lib/supabase';

/** 'unknown' = não deu para consultar o servidor e não há resultado anterior neste aparelho. */
export type AccessStatus = 'admin' | 'approved' | 'pending' | 'blocked' | 'unknown';

export type GateState = 'signed_out' | 'checking' | 'app' | 'waiting' | 'denied';

const STATUSES: readonly string[] = ['admin', 'approved', 'pending', 'blocked'];

export function normalizeAccessStatus(value: unknown): Exclude<AccessStatus, 'unknown'> | null {
  return typeof value === 'string' && STATUSES.includes(value) ? (value as Exclude<AccessStatus, 'unknown'>) : null;
}

/**
 * Decisão do gate. Modo local (sem Supabase) não tem aprovação. `status` null = consulta em andamento
 * para este usuário. A autorização real é a RLS (has_app_access); isto só decide qual tela mostrar.
 * `knownAdmin` (e-mail de admin conhecido) não espera o servidor nem cai em "aguardando" por falta de rede.
 */
export function decideGate(input: { configured: boolean; hasUser: boolean; status: AccessStatus | null; knownAdmin?: boolean }): GateState {
  if (!input.hasUser) {
    return 'signed_out';
  }
  if (!input.configured) {
    return 'app';
  }
  if (input.knownAdmin && (input.status === null || input.status === 'unknown')) {
    return 'app';
  }
  switch (input.status) {
    case null:
      return 'checking';
    case 'admin':
    case 'approved':
      return 'app';
    case 'blocked':
      return 'denied';
    default:
      return 'waiting';
  }
}

export function gateRoute(gate: GateState): '/waiting-approval' | '/access-denied' | null {
  if (gate === 'waiting') {
    return '/waiting-approval';
  }
  if (gate === 'denied') {
    return '/access-denied';
  }
  return null;
}

/** RPC ausente (migração não aplicada): sem aprovação no servidor, então o app não tranca ninguém. */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883';
}

/** Status da sessão atual decidido no servidor (my_access_status: is_admin() + a própria linha). */
export async function fetchAccessStatus(): Promise<Exclude<AccessStatus, 'unknown'>> {
  if (!supabase) {
    return 'approved';
  }
  const { data, error } = await supabase.rpc('my_access_status');
  if (error) {
    if (isMissingFunction(error)) {
      return 'approved';
    }
    throw new Error(error.message);
  }
  const status = normalizeAccessStatus(data);
  if (!status) {
    throw new Error('Resposta inválida do servidor.');
  }
  return status;
}

export function accessCacheKey(userId: string): string {
  return `treville.access.${userId}`;
}
