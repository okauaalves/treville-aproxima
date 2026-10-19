import { parsePlaquinhaCode } from '@/lib/editAccessLogic';
import { type ClaimPlaquinhaRow } from '@/lib/qrScanLogic';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export class ClaimPlaquinhaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimPlaquinhaError';
  }
}

type DbError = { message?: string; code?: string } | null;

function fail(error: DbError, fallback: string): ClaimPlaquinhaError {
  const message = error?.message ?? '';
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return new ClaimPlaquinhaError('Banco desatualizado. Rode: npx supabase db push.');
  }
  if (error?.code === '42501' || error?.code === '22023') {
    return new ClaimPlaquinhaError(message || fallback);
  }
  if (/fetch|network/i.test(message)) {
    return new ClaimPlaquinhaError('Sem conexão. Tente novamente.');
  }
  return new ClaimPlaquinhaError(fallback);
}

/**
 * Resolve o QR/código: empty → transfere `user_id` (claim); não-empty → só devolve a linha.
 * `null` = código válido mas plaquinha inexistente.
 */
export async function claimPlaquinha(input: string): Promise<ClaimPlaquinhaRow | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new ClaimPlaquinhaError('Plaquinhas precisam de conta e conexão.');
  }
  if (!useAuthStore.getState().user?.id) {
    throw new ClaimPlaquinhaError('Entre na sua conta.');
  }
  const code = parsePlaquinhaCode(input);
  if (!code) {
    throw new ClaimPlaquinhaError('Código inválido.');
  }
  const { data, error } = await supabase.rpc('claim_plaquinha', { p_code: code });
  if (error) {
    throw fail(error, 'Não foi possível reivindicar a plaquinha.');
  }
  const row = (Array.isArray(data) ? data[0] : data) as ClaimPlaquinhaRow | undefined;
  if (!row?.id) {
    return null;
  }
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    destination_type: String(row.destination_type ?? ''),
    claimed: row.claimed === true,
  };
}
