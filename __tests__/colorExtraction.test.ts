import {
  ACCENT_FALLBACK,
  FALLBACK_PALETTE,
  accentForBorders,
  borderAccentFromPalette,
  extractPaletteFromImage,
  hexToRgb,
  isNearBlack,
  isNearWhite,
  normalizeHex,
  pickPaletteFromColors,
  relativeLuminance,
  saturation,
} from '@/lib/colorExtraction';

describe('colorExtraction', () => {
  it('normaliza hex curto e longo', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('3b82f6')).toBe('#3B82F6');
    expect(normalizeHex('#3B82F6FF')).toBe('#3B82F6');
    expect(normalizeHex('invalid')).toBeNull();
  });

  it('detecta branco e preto quase puros', () => {
    expect(isNearWhite('#FFFFFF')).toBe(true);
    expect(isNearWhite('#FEFEFE')).toBe(true);
    expect(isNearWhite('#3B82F6')).toBe(false);
    expect(isNearBlack('#000000')).toBe(true);
    expect(isNearBlack('#0A0A0A')).toBe(true);
    expect(isNearBlack('#1E293B')).toBe(false);
  });

  it('ignora branco e preto ao escolher primary/secondary', () => {
    const palette = pickPaletteFromColors(['#FFFFFF', '#000000', '#3B82F6', '#93C5FD']);
    expect(palette.primary).toBe('#3B82F6');
    expect(palette.secondary).toBe('#93C5FD');
    expect(palette.tertiary).toBe('#000000');
  });

  it('prioriza cor saturada sobre cinza neutro', () => {
    const gray = '#9CA3AF';
    const blue = '#2563EB';
    const palette = pickPaletteFromColors([gray, blue, '#E5E7EB']);
    expect(palette.primary).toBe(blue);
    expect(saturation(hexToRgb(blue)!)).toBeGreaterThan(saturation(hexToRgb(gray)!));
  });

  it('usa a cor mais escura como tertiary', () => {
    const palette = pickPaletteFromColors(['#60A5FA', '#1E40AF', '#0F172A']);
    expect(palette.tertiary).toBe('#0F172A');
  });

  it('simula logo Tréville (azul #3B82F6 + fundo transparente/branco)', () => {
    const palette = pickPaletteFromColors(['#FFFFFF', '#3B82F6', '#00000000', null]);
    expect(palette.primary).toBe('#3B82F6');
    expect(palette.secondary).toBe('#3B82F6');
    expect(palette.tertiary).toBe('#000000');
  });

  it('devolve fallback quando não há candidatas', () => {
    expect(pickPaletteFromColors([])).toEqual(FALLBACK_PALETTE);
    expect(pickPaletteFromColors([null, undefined, 'xyz'])).toEqual(FALLBACK_PALETTE);
  });

  it('extractPaletteFromImage cai no fallback se a lib nativa falhar', async () => {
    const palette = await extractPaletteFromImage('file:///nao-existe.png');
    expect(palette).toEqual(FALLBACK_PALETTE);
  });

  it('accentForBorders usa fallback em branco/preto/cinza', () => {
    expect(accentForBorders('#FFFFFF')).toBe(ACCENT_FALLBACK);
    expect(accentForBorders('#000000')).toBe(ACCENT_FALLBACK);
    expect(accentForBorders('#9CA3AF')).toBe(ACCENT_FALLBACK);
    expect(accentForBorders(null)).toBe(ACCENT_FALLBACK);
  });

  it('accentForBorders preserva cores saturadas e ajusta extremos', () => {
    expect(accentForBorders('#DC2626')).toBe('#DC2626');
    expect(accentForBorders('#15803D')).toBe('#15803D');
    const light = accentForBorders('#FDE68A');
    expect(light).not.toBe(ACCENT_FALLBACK);
    expect(relativeLuminance(hexToRgb(light)!)).toBeLessThan(0.72);
    const dark = accentForBorders('#0B1B3A');
    expect(dark).not.toBe(ACCENT_FALLBACK);
    expect(relativeLuminance(hexToRgb(dark)!)).toBeGreaterThan(0.18);
  });

  it('borderAccentFromPalette usa primary ajustado', () => {
    expect(borderAccentFromPalette(pickPaletteFromColors(['#FFFFFF', '#7C3AED']))).toBe('#7C3AED');
    expect(borderAccentFromPalette(FALLBACK_PALETTE)).toBe('#3B82F6');
  });

  it('simula logos vermelho, verde e azul para bordas', () => {
    expect(borderAccentFromPalette(pickPaletteFromColors(['#FFFFFF', '#EF4444']))).toBe('#EF4444');
    expect(borderAccentFromPalette(pickPaletteFromColors(['#F8FAFC', '#16A34A']))).toBe('#16A34A');
    expect(borderAccentFromPalette(pickPaletteFromColors(['#000000', '#2563EB']))).toBe('#2563EB');
  });
});
