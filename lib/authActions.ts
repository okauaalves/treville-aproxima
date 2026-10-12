import AsyncStorage from '@react-native-async-storage/async-storage';

import { generateId } from '@/core/offline/database';
import {
  isSupabaseConfigured,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signOutRemote,
  signUpWithEmail,
  translateAuthError,
  updatePassword,
} from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useNfcStore } from '@/stores/nfcStore';
import { useTemplateStore } from '@/stores/templateStore';
import type { AppUser, LocalAccount } from '@/types/auth';

const USERS_KEY = 'nfc-manager.local-users';
const SESSION_KEY = 'nfc-manager.local-session';

async function readUsers(): Promise<LocalAccount[]> {
  const raw = await AsyncStorage.getItem(USERS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalAccount[]) : [];
  } catch {
    return [];
  }
}

function asUser(account: LocalAccount): AppUser {
  return { id: account.id, email: account.email, user_metadata: { full_name: account.fullName } };
}

export async function signInAccount(email: string, password: string): Promise<AppUser> {
  if (isSupabaseConfigured) {
    try {
      const user = await signInWithEmail(email.trim(), password);
      return { id: user.id, email: user.email, user_metadata: user.user_metadata, app_metadata: user.app_metadata };
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  }
  void password;
  const account = (await readUsers()).find((item) => item.email === email.trim().toLowerCase());
  if (!account) {
    throw new Error('E-mail ou senha inválidos.');
  }
  await AsyncStorage.setItem(SESSION_KEY, account.id);
  return asUser(account);
}

export async function signUpAccount(name: string, email: string, password: string): Promise<{ user: AppUser | null; needsConfirmation: boolean }> {
  if (isSupabaseConfigured) {
    try {
      const result = await signUpWithEmail(email.trim(), password, name.trim());
      if (!result.user || result.needsConfirmation) {
        return { user: null, needsConfirmation: true };
      }
      return {
        user: { id: result.user.id, email: result.user.email, user_metadata: result.user.user_metadata, app_metadata: result.user.app_metadata },
        needsConfirmation: false,
      };
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  }
  const users = await readUsers();
  const normalized = email.trim().toLowerCase();
  if (users.some((item) => item.email === normalized)) {
    throw new Error('Este e-mail já está cadastrado.');
  }
  void password;
  const account: LocalAccount = {
    id: generateId(),
    email: normalized,
    fullName: name.trim(),
  };
  users.push(account);
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
  await AsyncStorage.setItem(SESSION_KEY, account.id);
  return { user: asUser(account), needsConfirmation: false };
}

export async function signInGoogleAccount(): Promise<AppUser | null> {
  if (!isSupabaseConfigured) {
    throw new Error('Login com Google exige Supabase configurado.');
  }
  try {
    const session = await signInWithGoogle();
    if (!session?.user) {
      return null;
    }
    return { id: session.user.id, email: session.user.email, user_metadata: session.user.user_metadata, app_metadata: session.user.app_metadata };
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Modo local: as contas deste aparelho não têm senha online para recuperar.');
  }
  try {
    await resetPassword(email.trim());
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

export async function setNewPassword(password: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('A troca de senha exige uma conta online.');
  }
  try {
    await updatePassword(password);
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

export async function restoreLocalSession(): Promise<AppUser | null> {
  if (isSupabaseConfigured) {
    return null;
  }
  const id = await AsyncStorage.getItem(SESSION_KEY);
  if (!id) {
    return null;
  }
  const account = (await readUsers()).find((item) => item.id === id);
  return account ? asUser(account) : null;
}

/**
 * Limpa só o que está em memória. O histórico e os templates no SQLite/IndexedDB ficam no aparelho
 * (o app funciona offline); o sync para sozinho porque `syncIfOnline` exige usuário logado.
 */
export function clearUserMemory(): void {
  useHistoryStore.setState({ operations: [], hasMore: true, error: null, isLoading: false, filter: 'all' });
  useTemplateStore.setState({ templates: [], isLoading: false });
  const nfc = useNfcStore.getState();
  nfc.setScanning(false);
  nfc.setCurrentTag(null);
  nfc.setPendingPayload(null);
  nfc.setLastQrValue(null);
  nfc.resetWriteSteps();
}

export async function signOutUser(): Promise<void> {
  try {
    await signOutRemote();
  } catch {
    // Sem rede o supabase-js já apaga a sessão local; a saída não pode travar aqui.
  }
  await AsyncStorage.removeItem(SESSION_KEY);
  clearUserMemory();
  useAuthStore.getState().setUser(null);
}
