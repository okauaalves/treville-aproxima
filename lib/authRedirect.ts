import { Platform } from 'react-native';
import { makeRedirectUri } from 'expo-auth-session';

import { AUTH_REDIRECT } from '@/constants/config';

/** Web volta para a própria origem. Nativo usa treville://auth/callback. */
export function getAuthRedirect(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return makeRedirectUri({ scheme: 'treville', path: 'auth/callback' }) || AUTH_REDIRECT;
}
