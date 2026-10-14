import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useIsAdmin } from '@/hooks/useIsAdmin';
import { countPendingEditRequests } from '@/lib/adminAccess';
import { countPendingAccess } from '@/lib/adminApi';

/** Pedidos de cadastro + de edição pendentes (só para admin; recarrega ao focar a tela). */
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
      void Promise.all([countPendingAccess(), countPendingEditRequests()]).then(([access, edits]) => {
        if (alive) {
          setPending(access + edits);
        }
      });
      return () => {
        alive = false;
      };
    }, [isAdmin]),
  );

  return { isAdmin, pending };
}
