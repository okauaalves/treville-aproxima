import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import { AUTH_REDIRECT } from '@/constants/config';

/**
 * Web volta para a própria origem. Em build `createURL` dá treville://auth/callback;
 * no Expo Go, exp://<host>/--/auth/callback. Sem barra inicial: com ela sairia treville:///auth/callback.
 */
export function getAuthRedirect(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return Linking.createURL('auth/callback') || AUTH_REDIRECT;
}
