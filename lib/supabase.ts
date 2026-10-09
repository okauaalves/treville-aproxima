import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { parseAuthCallback } from '@/lib/authCallback';
import { getAuthRedirect } from '@/lib/authRedirect';

WebBrowser.maybeCompleteAuthSession();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function configured(valueUrl: string | undefined, valueKey: string | undefined): boolean {
  if (!valueUrl || !valueKey) {
    return false;
  }
  if (valueUrl.includes('SEU_ID') || valueUrl.includes('xxxxx') || valueKey === 'SUA_ANON_KEY_AQUI') {
    return false;
  }
  try {
    const parsed = new URL(valueUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = configured(url, anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

export function bindAuthRefresh(): () => void {
  if (!supabase) {
    return () => undefined;
  }
  const client = supabase;
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void client.auth.startAutoRefresh();
    } else {
      void client.auth.stopAutoRefresh();
    }
  });
  return () => sub.remove();
}

export function translateAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (message.includes('already registered') || message.includes('already exists') || message.includes('user already')) {
    return 'Este e-mail já está cadastrado.';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
    return 'Sem conexão. Tente novamente.';
  }
  if (message.includes('weak') || message.includes('at least') || message.includes('password')) {
    return 'A senha é fraca. Use ao menos 6 caracteres.';
  }
  if (message.includes('email not confirmed')) {
    return 'Verifique seu e-mail para confirmar a conta.';
  }
  return 'Não foi possível concluir. Tente novamente.';
}

export async function createSessionFromUrl(urlValue: string): Promise<Session | null> {
  if (!supabase) {
    return null;
  }
  const params = parseAuthCallback(urlValue);
  if (params.error) {
    throw new Error(params.error);
  }
  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      throw error;
    }
    return data.session;
  }
  if (params.accessToken && params.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) {
      throw error;
    }
    return data.session;
  }
  return null;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (!supabase) {
    throw new Error('LOCAL');
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  if (!data.user) {
    throw new Error('Sessão inválida');
  }
  return data.user;
}

export async function signUpWithEmail(email: string, password: string, fullName: string): Promise<{ user: User | null; needsConfirmation: boolean }> {
  if (!supabase) {
    throw new Error('LOCAL');
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) {
    throw error;
  }
  return { user: data.user, needsConfirmation: !data.session };
}

export async function signInWithGoogle(): Promise<Session | null> {
  if (!supabase) {
    throw new Error('LOCAL');
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: getAuthRedirect(), skipBrowserRedirect: true },
  });
  if (error) {
    throw error;
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url ?? '', getAuthRedirect());
  if (result.type !== 'success') {
    return null;
  }
  return createSessionFromUrl(result.url);
}

export async function updatePassword(password: string): Promise<void> {
  if (!supabase) {
    throw new Error('LOCAL');
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw error;
  }
}

export async function resetPassword(email: string): Promise<void> {
  if (!supabase) {
    throw new Error('LOCAL');
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: getAuthRedirect() });
  if (error) {
    throw error;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export function onAuthStateChange(callback: (user: User | null) => void): { unsubscribe: () => void } {
  if (!supabase) {
    return { unsubscribe: () => undefined };
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return data.subscription;
}

export async function signOutRemote(): Promise<void> {
  if (!supabase) {
    return;
  }
  await supabase.auth.signOut();
}

export const signOut = signOutRemote;

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session;
}
