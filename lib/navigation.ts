import { router, type Href } from 'expo-router';

import { useAuthStore } from '@/stores/authStore';

export function push(path: string): void {
  router.push(path as Href);
}

export function replace(path: string): void {
  router.replace(path as Href);
}

/** Sessão ausente ou expirada: limpa o estado local e volta ao login. */
export function goToLogin(): void {
  void useAuthStore
    .getState()
    .signOut()
    .catch(() => undefined)
    .then(() => replace('/(auth)/login'));
}
