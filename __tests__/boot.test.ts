/// <reference types="jest" />
import {
  decideInitialRoute,
  isOnboardingDone,
  LEGACY_ONBOARDING_KEY,
  markOnboardingDone,
  ONBOARDING_KEY,
  readOnboardingDone,
  TERMS_ACCEPTED_KEY,
  TERMS_VERSION,
  type FlagStorage,
} from '@/lib/bootRoute';
import { canLeaveSplash, SPLASH_DURATION_MS } from '@/lib/splash';

function memoryStorage(initial: Record<string, string> = {}): FlagStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => {
      data[key] = value;
    },
  };
}

describe('gate de abertura', () => {
  it('mostra o onboarding antes do login e só entra nas abas com sessão', () => {
    expect(decideInitialRoute({ onboardingSeen: false, hasSession: false })).toBe('/onboarding');
    expect(decideInitialRoute({ onboardingSeen: false, hasSession: true })).toBe('/onboarding');
    expect(decideInitialRoute({ onboardingSeen: true, hasSession: false })).toBe('/(auth)/login');
    expect(decideInitialRoute({ onboardingSeen: true, hasSession: true })).toBe('/(tabs)');
  });
});

describe('flag do onboarding', () => {
  it('usa onboarding_done e aceita a flag antiga', () => {
    expect(ONBOARDING_KEY).toBe('onboarding_done');
    expect(LEGACY_ONBOARDING_KEY).toBe('@tagsluiz/onboarding-v1');
    expect(isOnboardingDone(null, null)).toBe(false);
    expect(isOnboardingDone('true', null)).toBe(true);
    expect(isOnboardingDone(null, '1')).toBe(true);
    expect(isOnboardingDone('false', null)).toBe(false);
    expect(isOnboardingDone(null, '')).toBe(false);
  });

  it('migra quem já viu a versão antiga sem reexibir', async () => {
    const storage = memoryStorage({ [LEGACY_ONBOARDING_KEY]: '1' });
    await expect(readOnboardingDone(storage)).resolves.toBe(true);
    expect(storage.data[ONBOARDING_KEY]).toBe('true');
  });

  it('mostra para quem nunca viu e não grava nada na leitura', async () => {
    const storage = memoryStorage();
    await expect(readOnboardingDone(storage)).resolves.toBe(false);
    expect(storage.data).toEqual({});
  });

  it('ao concluir grava a flag e o aceite dos termos', async () => {
    const storage = memoryStorage();
    await markOnboardingDone(storage);
    expect(storage.data[ONBOARDING_KEY]).toBe('true');
    expect(storage.data[TERMS_ACCEPTED_KEY]).toBe(TERMS_VERSION);
    await expect(readOnboardingDone(storage)).resolves.toBe(true);
  });
});

describe('splash animada', () => {
  it('a abertura dura 1,5 s', () => {
    expect(SPLASH_DURATION_MS).toBe(1500);
  });

  it('só sai da splash quando a abertura e o boot terminaram', () => {
    expect(canLeaveSplash({ introDone: true, bootReady: false })).toBe(false);
    expect(canLeaveSplash({ introDone: false, bootReady: true })).toBe(false);
    expect(canLeaveSplash({ introDone: true, bootReady: true })).toBe(true);
  });
});
