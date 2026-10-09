export const ONBOARDING_KEY = '@tagsluiz/onboarding-v1';

export type InitialRoute = '/onboarding' | '/(auth)/login' | '/(tabs)';

export function decideInitialRoute(input: { onboardingSeen: boolean; hasSession: boolean }): InitialRoute {
  if (!input.onboardingSeen) {
    return '/onboarding';
  }
  if (!input.hasSession) {
    return '/(auth)/login';
  }
  return '/(tabs)';
}
