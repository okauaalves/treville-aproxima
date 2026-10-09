import { create } from 'zustand';

interface BootState {
  onboardingSeen: boolean;
  setOnboardingSeen: (seen: boolean) => void;
}

export const useBootStore = create<BootState>((set) => ({
  onboardingSeen: false,
  setOnboardingSeen: (onboardingSeen) => set({ onboardingSeen }),
}));
