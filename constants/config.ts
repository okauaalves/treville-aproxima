import { resolveRedirectBase, resolveShortLinkBase } from '@/lib/plaquinhaLogic';
import { logger } from '@/utils/logger';

export const APP_NAME = 'Tréville Aproxima';
export const APP_TAGLINE = 'Aproxime. Configure. Conecte.';
export const APP_VERSION = '1.0.0';
export const APP_BUILD = '1';
/** Fallback nativo. Em runtime use getAuthRedirect() (web usa a origem; nativo usa o scheme treville). */
export const AUTH_REDIRECT = 'treville://auth/callback';
export const PRIVACY_URL = 'https://example.com/nfc-manager/privacidade';
export const TERMS_URL = 'https://example.com/nfc-manager/termos';
/** Placeholder visível. Troque pelo e-mail real antes de publicar. */
export const SUPPORT_EMAIL = 'contato@exemplo.com';
export const DEFAULT_TAG_CAPACITY = 144;
export const HISTORY_PAGE_SIZE = 20;
export const SYNC_BATCH_SIZE = 50;

export interface AppConfig {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  /** Só para a UI; a autorização de admin é feita no servidor. */
  adminEmail: string | undefined;
  /** URL longa da função (tags e QRs antigos). */
  redirectBase: string;
  /** Origem do link curto `/t/<ID>` que vai em QRs e tags novos. */
  shortLinkBase: string;
}

/**
 * Só variáveis EXPO_PUBLIC_* (vão para o bundle). O acesso precisa ser literal
 * (process.env.EXPO_PUBLIC_X) para o Metro embutir o valor.
 */
export const Config: AppConfig = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  adminEmail: process.env.EXPO_PUBLIC_ADMIN_EMAIL,
  redirectBase: resolveRedirectBase(process.env.EXPO_PUBLIC_SUPABASE_URL),
  shortLinkBase: resolveShortLinkBase(process.env.EXPO_PUBLIC_SHORT_LINK_BASE),
};

function jwtRole(token: string): string | null {
  const part = token.split('.')[1];
  if (!part || typeof atob !== 'function') {
    return null;
  }
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/**
 * Lista o que falta ou está errado. Não lança: sem Supabase o app roda em modo local.
 * Em __DEV__ registra um aviso.
 */
export function validateConfig(config: AppConfig = Config): string[] {
  const problems: string[] = [];
  const url = config.supabaseUrl?.trim() ?? '';
  const key = config.supabaseAnonKey?.trim() ?? '';
  if (!url || url.includes('SEU_ID') || url.includes('xxxxx')) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL ausente (modo local).');
  } else if (!/^https:\/\//i.test(url)) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL deve usar https.');
  }
  if (!key || key === 'SUA_ANON_KEY_AQUI') {
    problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY ausente (modo local).');
  } else if (jwtRole(key) === 'service_role') {
    problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY contém a chave service_role. Use a anon key: a service_role nunca pode ir para o app.');
  }
  if (config.adminEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.adminEmail.trim())) {
    problems.push('EXPO_PUBLIC_ADMIN_EMAIL não é um e-mail válido.');
  }
  if (problems.length > 0) {
    logger.warn(`Configuração incompleta: ${problems.join(' ')}`);
  }
  return problems;
}
