import { isAndroidUserAgent } from '@/lib/device';
import { isLatestApkUrlConfigured } from '@/constants/config';

describe('isAndroidUserAgent', () => {
  it('detecta Android e ignora iOS/desktop', () => {
    expect(isAndroidUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe(true);
    expect(isAndroidUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(false);
    expect(isAndroidUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isAndroidUserAgent(null)).toBe(false);
    expect(isAndroidUserAgent(undefined)).toBe(false);
  });
});

describe('isLatestApkUrlConfigured', () => {
  it('rejeita placeholder e aceita https real', () => {
    expect(isLatestApkUrlConfigured('https://expo.dev/artifacts/eas/COLE_O_LINK_DO_APK_AQUI')).toBe(false);
    expect(isLatestApkUrlConfigured('https://expo.dev/artifacts/eas/abc123.apk')).toBe(true);
    expect(isLatestApkUrlConfigured('')).toBe(false);
  });
});
