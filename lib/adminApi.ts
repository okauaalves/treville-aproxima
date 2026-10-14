import { supabase } from '@/lib/supabase';

const DEPLOY_HINT = 'Função admin desatualizada ou não implantada. Rode: npx supabase functions deploy admin (e supabase db push).';

export class AdminApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export const MIGRATION_PENDING_HINT = 'O servidor ainda não tem as tabelas de admin. Rode supabase db push.';

export type AdminErrorInfo = { message: string; migrationPending: boolean };

/** Traduz o erro do functions.invoke; 503 `migracao_pendente` vira o aviso de migração, não erro vermelho. */
export async function describeAdminError(error: { name?: string; message: string; context?: unknown }): Promise<AdminErrorInfo> {
  const context = error.context as { status?: number; json?: () => Promise<unknown> } | undefined;
  const status = context?.status;
  if (status === 404) {
    return { message: DEPLOY_HINT, migrationPending: false };
  }
  if (status === 401) {
    return { message: 'Sessão expirada. Saia e entre novamente.', migrationPending: false };
  }
  if (status === 403) {
    return { message: 'Esta conta não tem permissão de administrador.', migrationPending: false };
  }
  if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') {
    return { message: `Não foi possível contatar a função admin. ${DEPLOY_HINT}`, migrationPending: false };
  }
  const body = context?.json ? ((await context.json().catch(() => null)) as { error?: string; code?: string } | null) : null;
  if (status === 503 || body?.code === 'migracao_pendente') {
    return { message: body?.error || MIGRATION_PENDING_HINT, migrationPending: true };
  }
  if (body?.error) {
    return { message: body.error === 'Ação desconhecida.' ? DEPLOY_HINT : body.error, migrationPending: false };
  }
  return { message: error.message, migrationPending: false };
}

async function describe(error: { name?: string; message: string; context?: unknown }): Promise<string> {
  return (await describeAdminError(error)).message;
}

/** A autorização é feita na Edge Function (service_role só lá). */
export async function invokeAdmin<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) {
    throw new AdminApiError('Supabase não configurado.');
  }
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...payload } });
  if (error) {
    throw new AdminApiError(await describe(error));
  }
  return data as T;
}

export type AccessRowStatus = 'pending' | 'approved' | 'blocked';

export interface AccessItem {
  id: string;
  userId: string | null;
  email: string;
  status: AccessRowStatus;
  name: string;
  avatarUrl: string | null;
  invited: boolean;
  createdAt: string;
  approvedAt: string | null;
}

export interface BatchItem {
  id: string;
  name: string;
  destination_url: string;
  destination_type: string;
  is_active: boolean;
  profile_enabled: boolean;
}

export async function listAccess(): Promise<AccessItem[]> {
  const result = await invokeAdmin<{ items?: AccessItem[] }>('access_list');
  return Array.isArray(result?.items) ? result.items : [];
}

export async function setAccessStatus(id: string, status: AccessRowStatus): Promise<void> {
  await invokeAdmin('access_set_status', { id, status });
}

export async function inviteUser(email: string): Promise<{ invited: boolean; alreadyRegistered?: boolean }> {
  return invokeAdmin('invite', { email });
}

export async function createBatch(input: { quantity: number; start: number; prefix: string; type: string; url: string | null }): Promise<BatchItem[]> {
  const result = await invokeAdmin<{ items?: BatchItem[] }>('batch_create', input);
  return Array.isArray(result?.items) ? result.items : [];
}

/** Só para admin: a RLS (is_admin) libera a contagem; para os demais volta 0 sem consulta. */
export async function countPendingAccess(): Promise<number> {
  if (!supabase) {
    return 0;
  }
  const { count, error } = await supabase.from('user_access').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  return error ? 0 : (count ?? 0);
}
