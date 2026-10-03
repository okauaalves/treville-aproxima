import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

import { syncIfOnline } from '@/core/offline/syncEngine';

export function useOffline() {
  const [isOffline, setOffline] = useState(false);
  const previous = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      if (previous.current && !offline) {
        void syncIfOnline();
      }
      previous.current = offline;
      setOffline(offline);
    });
    return unsubscribe;
  }, []);

  return { isOffline };
}

export function useDatabase() {
  const [ready, setReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  return { ready, error, setReady, setError };
}
