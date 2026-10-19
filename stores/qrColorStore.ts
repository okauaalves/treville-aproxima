import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  checkQrForeground,
  getEffectiveQrForeground,
  QR_FOREGROUND_DEFAULT,
  qrColorStorageKey,
} from '@/lib/qrColors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

interface QrColorState {
  /** Cor efetiva dos módulos (sempre válida; default preto). */
  foreground: string;
  hydrated: boolean;
  userId: string | null;
  loadForUser: (userId: string | null) => Promise<void>;
  setForeground: (input: string) => Promise<{ ok: true; hex: string } | { ok: false; error: string }>;
}

async function readLocal(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(qrColorStorageKey(userId));
  } catch {
    return null;
  }
}

async function writeLocal(userId: string, hex: string): Promise<void> {
  await AsyncStorage.setItem(qrColorStorageKey(userId), hex);
}

async function readRemote(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }
  const { data, error } = await supabase.from('profiles').select('qr_foreground_color').eq('id', userId).maybeSingle();
  if (error) {
    // Coluna ainda não migrada: ignora e usa cache local.
    if (/qr_foreground_color/i.test(error.message ?? '')) {
      return null;
    }
    return null;
  }
  const value = (data as { qr_foreground_color?: unknown } | null)?.qr_foreground_color;
  return typeof value === 'string' ? value : null;
}

async function writeRemote(userId: string, hex: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, qr_foreground_color: hex, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error && !/qr_foreground_color/i.test(error.message ?? '')) {
    throw error;
  }
}

export const useQrColorStore = create<QrColorState>((set, get) => ({
  foreground: QR_FOREGROUND_DEFAULT,
  hydrated: false,
  userId: null,
  loadForUser: async (userId) => {
    if (!userId) {
      set({ foreground: QR_FOREGROUND_DEFAULT, hydrated: true, userId: null });
      return;
    }
    const local = await readLocal(userId);
    const fromLocal = getEffectiveQrForeground(local);
    set({ foreground: fromLocal, hydrated: true, userId });
    const remote = await readRemote(userId);
    if (remote) {
      const effective = getEffectiveQrForeground(remote);
      if (effective !== get().foreground) {
        set({ foreground: effective });
      }
      if (effective !== local) {
        await writeLocal(userId, effective).catch(() => undefined);
      }
    }
  },
  setForeground: async (input) => {
    const check = checkQrForeground(input);
    if (!check.ok) {
      return check;
    }
    const previous = get().foreground;
    const userId = get().userId ?? useAuthStore.getState().user?.id ?? null;
    set({ foreground: check.hex, userId: userId ?? get().userId });
    if (!userId) {
      return { ok: true, hex: check.hex };
    }
    try {
      await writeLocal(userId, check.hex);
      await writeRemote(userId, check.hex);
    } catch {
      set({ foreground: previous });
      useToastStore.getState().show('Não foi possível salvar a cor do QR Code.', 'error');
      return { ok: false, error: 'Não foi possível salvar a cor do QR Code.' };
    }
    return { ok: true, hex: check.hex };
  },
}));
