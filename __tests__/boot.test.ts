/// <reference types="jest" />
import { decideInitialRoute, ONBOARDING_KEY } from '@/lib/bootRoute';
import { canLeaveSplash, decideSplashMode, videoDeadline, VIDEO_END_GRACE_MS, VIDEO_LOAD_TIMEOUT_MS } from '@/lib/splash';

describe('gate de abertura', () => {
  it('mostra o onboarding antes do login e só entra nas abas com sessão', () => {
    expect(ONBOARDING_KEY).toBe('@tagsluiz/onboarding-v1');
    expect(decideInitialRoute({ onboardingSeen: false, hasSession: false })).toBe('/onboarding');
    expect(decideInitialRoute({ onboardingSeen: false, hasSession: true })).toBe('/onboarding');
    expect(decideInitialRoute({ onboardingSeen: true, hasSession: false })).toBe('/(auth)/login');
    expect(decideInitialRoute({ onboardingSeen: true, hasSession: true })).toBe('/(tabs)');
  });
});

describe('splash com vídeo', () => {
  it('usa o vídeo no Android e no web, e a logo no iOS ou com animações reduzidas', () => {
    expect(decideSplashMode({ platform: 'android', reduceMotion: false })).toBe('video');
    expect(decideSplashMode({ platform: 'web', reduceMotion: false })).toBe('video');
    expect(decideSplashMode({ platform: 'ios', reduceMotion: false })).toBe('logo');
    expect(decideSplashMode({ platform: 'android', reduceMotion: true })).toBe('logo');
  });

  it('só sai da splash quando a abertura e o boot terminaram', () => {
    expect(canLeaveSplash({ introDone: true, bootReady: false })).toBe(false);
    expect(canLeaveSplash({ introDone: false, bootReady: true })).toBe(false);
    expect(canLeaveSplash({ introDone: true, bootReady: true })).toBe(true);
  });

  it('limita o tempo do vídeo pela duração mais folga, ou pelo teto de carregamento', () => {
    expect(videoDeadline(4)).toBe(4000 + VIDEO_END_GRACE_MS);
    expect(videoDeadline(0)).toBe(VIDEO_LOAD_TIMEOUT_MS);
    expect(videoDeadline(Number.NaN)).toBe(VIDEO_LOAD_TIMEOUT_MS);
    expect(videoDeadline(null)).toBe(VIDEO_LOAD_TIMEOUT_MS);
  });
});
