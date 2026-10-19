import { Platform } from 'react-native';

import { AUTH_REDIRECT } from '@/constants/config';
import { resolveShortLinkBase } from '@/lib/plaquinhaLogic';

/**
 * Redirect nativo do OAuth Google: exatamente `treville://auth/callback`
 * (precisa estar nas Redirect URLs do Supabase). Web usa a origem do browser.
 */
export function getAuthRedirect(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return AUTH_REDIRECT;
}

/**
 * Links de e-mail (recuperação, confirmação) passam por HTTPS no host público
 * para o PC não cair em `treville://` (tela em branco).
 */
export function getEmailAuthRedirect(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/auth/open`;
  }
  return `${resolveShortLinkBase(process.env.EXPO_PUBLIC_SHORT_LINK_BASE)}/auth/open`;
}
