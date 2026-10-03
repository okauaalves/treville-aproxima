import { create } from 'zustand';

import { getTemplates } from '@/core/offline/database';
import type { NfcTemplate } from '@/types/template';

interface TemplateState {
  templates: NfcTemplate[];
  isLoading: boolean;
  load: () => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  isLoading: false,
  load: async () => {
    set({ isLoading: true });
    try {
      const templates = await getTemplates();
      set({ templates, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
