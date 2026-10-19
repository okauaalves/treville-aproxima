/// <reference types="jest" />
import {
  checkQrForeground,
  contrastAgainstWhite,
  getEffectiveQrForeground,
  isQrForegroundAllowed,
  QR_BACKGROUND_COLOR,
  QR_CONTRAST_BLOCK_MESSAGE,
  QR_FOREGROUND_DEFAULT,
  QR_PALETTE,
} from '@/lib/qrColors';
import { qrSvg } from '@/lib/qrBatch';
import { QR_FOREGROUND_COLOR } from '@/utils/qrcode';

jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, supabase: null }));

describe('cores do QR Code', () => {
  it('default é preto puro sobre branco puro', () => {
    expect(QR_FOREGROUND_DEFAULT).toBe('#000000');
    expect(QR_FOREGROUND_COLOR).toBe('#000000');
    expect(QR_BACKGROUND_COLOR).toBe('#FFFFFF');
    expect(getEffectiveQrForeground(null)).toBe('#000000');
    expect(getEffectiveQrForeground(undefined)).toBe('#000000');
    expect(getEffectiveQrForeground('')).toBe('#000000');
  });

  it('paleta pré-aprovada passa contraste ≥ 4.5:1 vs branco', () => {
    for (const item of QR_PALETTE) {
      const ratio = contrastAgainstWhite(item.hex);
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(4.5);
      expect(isQrForegroundAllowed(item.hex)).toBe(true);
      expect(checkQrForeground(item.hex).ok).toBe(true);
    }
  });

  it('azul marinho (navy) é válido', () => {
    const navy = '#001F3F';
    const check = checkQrForeground(navy);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.hex).toBe('#001F3F');
      expect(check.contrast).toBeGreaterThanOrEqual(4.5);
    }
    expect(getEffectiveQrForeground(navy)).toBe('#001F3F');
  });

  it('amarelo claro falha e bloqueia com aviso de contraste', () => {
    const lightYellow = '#FFFF99';
    expect(isQrForegroundAllowed(lightYellow)).toBe(false);
    const check = checkQrForeground(lightYellow);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.error).toBe(QR_CONTRAST_BLOCK_MESSAGE);
    }
    expect(getEffectiveQrForeground(lightYellow)).toBe('#000000');
  });

  it('qrSvg usa fundo branco e foreground informado (default preto)', () => {
    const black = qrSvg('https://example.com/plaquinha');
    expect(black).toContain(`fill="${QR_BACKGROUND_COLOR}"`);
    expect(black).toContain(`fill="${QR_FOREGROUND_COLOR}"`);
    expect(black).not.toMatch(/fill="#(?:1E40AF|0F172A|007AFF|0A84FF)"/i);

    const navy = qrSvg('https://example.com/plaquinha', 150, 2, '#001F3F');
    expect(navy).toContain('fill="#FFFFFF"');
    expect(navy).toContain('fill="#001F3F"');
    expect(navy).not.toContain('fill="#000000"');
  });
});
