import { create } from 'zustand';

import { getOperations } from '@/core/offline/database';
import type { HistoryFilter, Operation } from '@/types/history';

interface HistoryState {
  operations: Operation[];
  isLoading: boolean;
  error: string | null;
  filter: HistoryFilter;
  hasMore: boolean;
  setOperations: (operations: Operation[]) => void;
  addOperation: (operation: Operation) => void;
  removeOperation: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
  setFilter: (filter: HistoryFilter) => void;
  load: (reset?: boolean) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  operations: [],
  isLoading: false,
  error: null,
  filter: 'all',
  hasMore: true,
  setOperations: (operations) => set({ operations }),
  addOperation: (operation) => set((state) => ({ operations: [operation, ...state.operations] })),
  removeOperation: (id) => set((state) => ({ operations: state.operations.filter((item) => item.id !== id) })),
  setLoading: (isLoading) => set({ isLoading }),
  setFilter: (filter) => set({ filter, operations: [], hasMore: true }),
  load: async (reset = false) => {
    const { filter, operations, isLoading } = get();
    if (isLoading) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const offset = reset ? 0 : operations.length;
      const page = await getOperations({ filter, limit: 20, offset });
      set({
        operations: reset ? page : [...operations, ...page],
        hasMore: page.length === 20,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Erro ao carregar histórico' });
    }
  },
}));
