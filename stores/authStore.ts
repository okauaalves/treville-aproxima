import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';

import type { AppUser } from '@/types/auth';

export function toAppUser(user: User | AppUser): AppUser {
  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata ?? {},
    app_metadata: user.app_metadata,
  };
}

interface AuthState {
  user: AppUser | null;
  isLoading: boolean;
  setUser: (user: User | AppUser | null) => void;
  setLoading: (isLoading: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user: user ? toAppUser(user) : null, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  signOut: async () => {
    const { signOutUser } = await import('@/lib/authActions');
    await signOutUser();
    set({ user: null, isLoading: false });
  },
}));
