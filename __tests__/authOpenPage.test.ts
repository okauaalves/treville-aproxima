import { AUTH_REDIRECT } from '@/constants/config';
import {
  buildAppAuthDeepLink,
  isMobileUserAgent,
  renderAuthOpenPage,
} from '@/lib/authOpenPage';

describe('auth open (ponte e-mail → app)', () => {
  it('detecta user-agent mobile vs desktop', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 14)')).toBe(true);
    expect(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe(false);
    expect(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605')).toBe(false);
    expect(isMobileUserAgent(null)).toBe(false);
  });

  it('preserva query PKCE e hash no deep link', () => {
    expect(buildAppAuthDeepLink('https://nfc-manager.expo.app/auth/open?code=abc&type=recovery')).toBe(
      `${AUTH_REDIRECT}?code=abc&type=recovery`,
    );
    expect(buildAppAuthDeepLink('https://nfc-manager.expo.app/auth/open#access_token=a&refresh_token=b&type=recovery')).toBe(
      `${AUTH_REDIRECT}#access_token=a&refresh_token=b&type=recovery`,
    );
  });

  it('HTML de desktop pede abrir no celular e oferece botão com deep link', () => {
    const html = renderAuthOpenPage(`${AUTH_REDIRECT}?code=xyz`);
    expect(html).toContain('Abra este link no celular onde o app Tréville Aproxima está instalado');
    expect(html).toContain('Tentar abrir no app');
    expect(html).toContain(`href="${AUTH_REDIRECT}?code=xyz"`);
  });
});
