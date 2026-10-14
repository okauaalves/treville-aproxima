import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { accessCacheKey, fetchAccessStatus, normalizeAccessStatus, type AccessStatus } from '@/lib/access';
import { isSupabaseConfigured } from '@/lib/supabase';

const TIMEOUT_MS = 6000;

interface AccessState {
  userId: string | null;
  /** null = ainda sem resposta para `userId`. Durante uma reavaliação o valor anterior fica (sem piscar). */
  status: AccessStatus | null;
  checking: boolean;
  refresh: (userId: string | null) => Promise<void>;
}

let sequence = 0;

function withTimeout<T>(task: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const useAccessStore = create<AccessState>((set, get) => ({
  userId: null,
  status: null,
  checking: false,
  refresh: async (userId) => {
    const ticket = ++sequence;
    if (!userId) {
      set({ userId: null, status: null, checking: false });
      return;
    }
    if (!isSupabaseConfigured) {
      set({ userId, status: 'approved', checking: false });
      return;
    }
    if (get().userId !== userId) {
      set({ userId, status: null });
    }
    set({ checking: true });
    let next: AccessStatus;
    try {
      next = await withTimeout(fetchAccessStatus());
      void AsyncStorage.setItem(accessCacheKey(userId), next).catch(() => undefined);
    } catch {
      const current = get().userId === userId ? get().status : null;
      const cached = normalizeAccessStatus(await AsyncStorage.getItem(accessCacheKey(userId)).catch(() => null));
      next = current && current !== 'unknown' ? current : (cached ?? 'unknown');
    }
    if (ticket === sequence) {
      set({ userId, status: next, checking: false });
    }
  },
}));
