/// <reference types="jest" />
import Constants from 'expo-constants';

import { isExpoGo } from '@/core/platform/expoGo';

jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: {
    StoreClient: 'storeClient',
    Bare: 'bare',
    Standalone: 'standalone',
  },
  default: {
    executionEnvironment: 'bare',
    appOwnership: null as string | null,
  },
}));

const flags = Constants as unknown as { executionEnvironment: string; appOwnership: string | null };

describe('Expo Go', () => {
  beforeEach(() => {
    flags.executionEnvironment = 'bare';
    flags.appOwnership = null;
  });

  it('detecta StoreClient mesmo sem appOwnership', () => {
    flags.executionEnvironment = 'storeClient';
    expect(isExpoGo()).toBe(true);
  });

  it('aceita appOwnership expo como fallback', () => {
    flags.executionEnvironment = 'bare';
    flags.appOwnership = 'expo';
    expect(isExpoGo()).toBe(true);
  });

  it('não marca um app instalado', () => {
    flags.executionEnvironment = 'standalone';
    flags.appOwnership = 'standalone';
    expect(isExpoGo()).toBe(false);
  });
});
