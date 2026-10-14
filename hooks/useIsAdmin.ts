import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import type { AdminDecision } from '@/lib/adminCheck';
import { adminCacheKey, checkAdmin, getCachedAdmin } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';

/**
 * Reavalia ao focar a tela e quando a sessão muda (o callback muda com a chave).
 * `loading` fica true até a sessão e a primeira consulta resolverem — não redirecione antes disso.
 */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean; serverMissing: boolean } {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);
  const key = adminCacheKey(user);
  const [result, setResult] = useState<{ key: string; decision: AdminDecision } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (authLoading) {
        return;
      }
      let alive = true;
      void checkAdmin(useAuthStore.getState().user).then((decision) => {
        if (alive) {
          setResult({ key, decision });
        }
      });
      return () => {
        alive = false;
      };
    }, [authLoading, key]),
  );

  const current = result?.key === key ? result.decision : getCachedAdmin(user);
  return { isAdmin: current?.isAdmin ?? false, loading: authLoading || current === undefined, serverMissing: current?.serverMissing ?? false };
}
