import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useIsAdmin } from '@/hooks/useIsAdmin';
import { countPendingAccess } from '@/lib/adminApi';

/** Pedidos pendentes (só para admin; recarrega ao focar a tela). */
export function usePendingAccessCount(): { isAdmin: boolean; pending: number } {
  const { isAdmin } = useIsAdmin();
  const [pending, setPending] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) {
        setPending(0);
        return;
      }
      let alive = true;
      void countPendingAccess().then((count) => {
        if (alive) {
          setPending(count);
        }
      });
      return () => {
        alive = false;
      };
    }, [isAdmin]),
  );

  return { isAdmin, pending };
}
