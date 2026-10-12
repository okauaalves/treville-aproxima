import { useEffect, useState } from 'react';

import { hashUid } from '@/core/offline/database';

/** SHA-256 do UID para comparar tags sem guardar o UID em texto. */
export function useUidHash(uid: string | null | undefined): string | null {
  const [entry, setEntry] = useState<{ uid: string; hash: string | null } | null>(null);
  useEffect(() => {
    if (!uid) {
      return;
    }
    let alive = true;
    void hashUid(uid)
      .then((hash) => {
        if (alive) {
          setEntry({ uid, hash });
        }
      })
      .catch(() => {
        if (alive) {
          setEntry({ uid, hash: null });
        }
      });
    return () => {
      alive = false;
    };
  }, [uid]);
  return uid && entry?.uid === uid ? entry.hash : null;
}
