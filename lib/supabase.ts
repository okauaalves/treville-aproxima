import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { Config } from '@/constants/config';
import { classifyAuthCallback, isExpiredLinkMessage, isProviderDisabledMessage, parseAuthCallback } from '@/lib/authCallback';
import { getAuthRedirect, getEmailAuthRedirect } from '@/lib/authRedirect';

const GOOGLE_AUTH_TIMEOUT_MS = 15_000;

export const GOOGLE_DISABLED_MESSAGE = 'Login com Google ainda não está ativado no servidor.';
/** Não confirma nem nega a conta além do necessário para orientar quem já é cliente. */
export const ALREADY_REGISTERED_MESSAGE = 'Não foi possível criar a conta com este e-mail. Se você já tem conta, entre ou recupere a senha.';

WebBrowser.maybeCompleteAuthSession();

const url = Config.supabaseUrl;
const anonKey = Config.supabaseAnonKey;

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
  if (isProviderDisabledMessage(message)) {
    return GOOGLE_DISABLED_MESSAGE;
  }
  if (isExpiredLinkMessage(message)) {
    return 'Este link expirou ou já foi usado. Peça um novo.';
  }
  if (message.includes('rate limit') || message.includes('security purposes')) {
    return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
  }
  if (message.includes('same password') || message.includes('should be different')) {
    return 'A nova senha precisa ser diferente da atual.';
  }
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (message.includes('already registered') || message.includes('already exists') || message.includes('user already')) {
    return ALREADY_REGISTERED_MESSAGE;
  }
  if (message.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. O link está na sua caixa de entrada.';
  }
  if (message.includes('signups not allowed') || message.includes('signup is disabled') || message.includes('signup_disabled')) {
    return 'O cadastro de novas contas está desativado no servidor.';
  }
  if (message.includes('auth_timeout') || message.includes('tempo esgotado')) {
    return 'Tempo esgotado ao conectar. Tente novamente.';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
    return 'Sem conexão. Tente novamente.';
  }
  if ((message.includes('email address') && message.includes('invalid')) || message.includes('email_address_invalid')) {
    return 'Informe um e-mail válido.';
  }
  if (message.includes('weak') || message.includes('at least') || message.includes('password')) {
    return 'A senha é fraca. Use ao menos 6 caracteres.';
  }
  return 'Não foi possível concluir. Tente novamente.';
}

/** `invite`: link de convite (inviteUserByEmail) — a conta ainda não tem senha. */
export type AuthCallbackResult = { session: Session | null; recovery: boolean; invite?: boolean };

let recoveryPending = false;

supabase?.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryPending = true;
  }
});

/** Lê e limpa o aviso de PASSWORD_RECOVERY emitido pelo cliente. */
export function consumeRecoveryEvent(): boolean {
  const pending = recoveryPending;
  recoveryPending = false;
  return pending;
}

/** O mesmo code chega pelo openAuthSessionAsync e pelo deep link no Android; trocar duas vezes falha. */
const inflight = new Map<string, Promise<AuthCallbackResult>>();

export function handleAuthCallbackUrl(urlValue: string): Promise<AuthCallbackResult> {
  const client = supabase;
  if (!client) {
    return Promise.resolve({ session: null, recovery: false });
  }
  const params = parseAuthCallback(urlValue);
  const kind = classifyAuthCallback(params);
  if (kind === 'error') {
    return Promise.reject(new Error(params.error || params.errorCode || 'auth_error'));
  }
  if (kind === 'empty') {
    return Promise.resolve({ session: null, recovery: false });
  }
  const key = kind === 'code' ? `c:${params.code}` : `t:${params.refreshToken}`;
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }
  const task = (async (): Promise<AuthCallbackResult> => {
    if (kind === 'code') {
      const { data, error } = await client.auth.exchangeCodeForSession(params.code as string);
      if (error) {
        throw error;
      }
      // `redirectType` existe em runtime, mas não está no tipo público de AuthTokenResponse.
      const redirectType = (data as { redirectType?: string | null }).redirectType;
      return {
        session: data.session,
        recovery: redirectType === 'recovery' || params.type === 'recovery',
        invite: redirectType === 'invite' || params.type === 'invite',
      };
    }
    const { data, error } = await client.auth.setSession({
      access_token: params.accessToken as string,
      refresh_token: params.refreshToken as string,
    });
    if (error) {
      throw error;
    }
    return { session: data.session, recovery: params.type === 'recovery', invite: params.type === 'invite' };
  })();
  inflight.set(key, task);
  return task;
}

export async function createSessionFromUrl(urlValue: string): Promise<Session | null> {
  return (await handleAuthCallbackUrl(urlValue)).session;
}

/** `GET /auth/v1/settings` é público e diz quais provedores externos estão ativos. */
async function googleProviderEnabled(): Promise<boolean | null> {
  if (!url || !anonKey) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { external?: Record<string, boolean> };
    return typeof body.external?.google === 'boolean' ? body.external.google : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
    options: { data: { full_name: fullName }, emailRedirectTo: getEmailAuthRedirect() },
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
  if ((await googleProviderEnabled()) === false) {
    throw new Error('provider is not enabled');
  }
  const client = supabase;
  const web = Platform.OS === 'web';
  const redirectTo = getAuthRedirect();

  if (web) {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { access_type: 'offline', prompt: 'consent' },
        skipBrowserRedirect: false,
      },
    });
    if (error) {
      throw error;
    }
    // A página sai para o Google e volta em /auth/callback, que conclui a sessão.
    return null;
  }

  // Listener ANTES do OAuth: no Android o deep link pode chegar fora do openAuthSessionAsync.
  return new Promise<Session | null>((resolve, reject) => {
    let settled = false;
    let subscription: { remove: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      subscription?.remove();
      subscription = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
      }
    };

    const finish = (session: Session | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(session);
    };
    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const acceptUrl = (url: string) => {
      if (!url || !/auth\/callback/i.test(url)) {
        return;
      }
      void createSessionFromUrl(url).then(finish).catch(fail);
    };

    subscription = Linking.addEventListener('url', ({ url }) => acceptUrl(url));
    timer = setTimeout(() => fail(new Error('auth_timeout')), GOOGLE_AUTH_TIMEOUT_MS);

    void (async () => {
      try {
        const { data, error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: { access_type: 'offline', prompt: 'consent' },
            skipBrowserRedirect: true,
          },
        });
        if (error) {
          throw error;
        }
        if (!data.url) {
          throw new Error('oauth_url_missing');
        }
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success' && result.url) {
          acceptUrl(result.url);
          return;
        }
        // Cancel/dismiss: ainda pode chegar deep link; dá uma janela curta e libera o loading.
        dismissTimer = setTimeout(() => finish(null), 1_500);
      } catch (error) {
        fail(error);
      }
    })();
  });
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
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: getEmailAuthRedirect() });
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
