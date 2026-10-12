import { useEffect, useState } from 'react';

import { getCachedAdmin, isAdminUser } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';

/** `loading` fica true até a sessão e a consulta de admins resolverem — não redirecione antes disso. */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);
  const key = user ? `${user.id}:${user.email ?? ''}:${String(user.app_metadata?.role ?? '')}` : '';
  const [result, setResult] = useState<{ key: string; isAdmin: boolean } | null>(() => {
    const cached = getCachedAdmin(user);
    return cached === undefined ? null : { key, isAdmin: cached };
  });

  useEffect(() => {
    if (authLoading) {
      return;
    }
    let alive = true;
    void isAdminUser(useAuthStore.getState().user).then((isAdmin) => {
      if (alive) {
        setResult({ key, isAdmin });
      }
    });
    return () => {
      alive = false;
    };
  }, [authLoading, key]);

  const current = result?.key === key ? result.isAdmin : getCachedAdmin(user);
  return { isAdmin: current ?? false, loading: authLoading || current === undefined };
}
