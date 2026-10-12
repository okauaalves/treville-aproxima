export const ONBOARDING_KEY = 'onboarding_done';
/** Flag da versão anterior do onboarding (lista de avisos). Quem já viu não deve rever. */
export const LEGACY_ONBOARDING_KEY = '@tagsluiz/onboarding-v1';
export const TERMS_ACCEPTED_KEY = 'terms_accepted';
/** Data de vigência em app/terms.tsx; mudar aqui pede novo aceite só se o fluxo passar a checar a versão. */
export const TERMS_VERSION = '2026-10-08';

export type InitialRoute = '/onboarding' | '/(auth)/login' | '/(tabs)';

export interface FlagStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function decideInitialRoute(input: { onboardingSeen: boolean; hasSession: boolean }): InitialRoute {
  if (!input.onboardingSeen) {
    return '/onboarding';
  }
  if (!input.hasSession) {
    return '/(auth)/login';
  }
  return '/(tabs)';
}

export function isOnboardingDone(current: string | null, legacy: string | null): boolean {
  return current === 'true' || (legacy !== null && legacy !== '');
}

/** Lê a flag nova e migra a antiga para `onboarding_done = 'true'`. */
export async function readOnboardingDone(storage: FlagStorage): Promise<boolean> {
  const [current, legacy] = await Promise.all([storage.getItem(ONBOARDING_KEY), storage.getItem(LEGACY_ONBOARDING_KEY)]);
  const done = isOnboardingDone(current, legacy);
  if (done && current !== 'true') {
    await storage.setItem(ONBOARDING_KEY, 'true').catch(() => undefined);
  }
  return done;
}

export async function markOnboardingDone(storage: FlagStorage): Promise<void> {
  await storage.setItem(TERMS_ACCEPTED_KEY, TERMS_VERSION);
  await storage.setItem(ONBOARDING_KEY, 'true');
}
