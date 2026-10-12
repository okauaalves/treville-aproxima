import { getBreakpoint } from '@/hooks/useBreakpoint';

function active(width: number) {
  const bp = getBreakpoint(width, 800);
  return (['isSmall', 'isNormal', 'isLarge', 'isTablet', 'isBigTablet'] as const).filter((key) => bp[key]);
}

describe('useBreakpoint / getBreakpoint', () => {
  it.each([
    [379, 'isSmall', 'small', 14],
    [380, 'isNormal', 'normal', 16],
    [429, 'isNormal', 'normal', 16],
    [430, 'isLarge', 'large', 17],
    [599, 'isLarge', 'large', 17],
    [600, 'isTablet', 'tablet', 18],
    [899, 'isTablet', 'tablet', 18],
    [900, 'isBigTablet', 'bigTablet', 18],
  ] as const)('largura %i ativa só %s', (width, flag, name, font) => {
    expect(active(width)).toEqual([flag]);
    const bp = getBreakpoint(width, 800);
    expect(bp.bp).toBe(name);
    expect(bp.baseFont).toBe(font);
  });

  it('detecta Fold aberto a partir de 840', () => {
    expect(getBreakpoint(370, 800).isFoldOpen).toBe(false);
    expect(getBreakpoint(839, 800).isFoldOpen).toBe(false);
    expect(getBreakpoint(840, 800).isFoldOpen).toBe(true);
    expect(getBreakpoint(900, 800).isFoldOpen).toBe(true);
  });

  it('marca landscape quando a largura passa a altura', () => {
    expect(getBreakpoint(852, 393).isLandscape).toBe(true);
    expect(getBreakpoint(393, 852).isLandscape).toBe(false);
    expect(getBreakpoint(500, 500).isLandscape).toBe(false);
  });

  it('troca tab bar por sidebar a partir de 600', () => {
    expect(getBreakpoint(599, 800)).toMatchObject({ isPhone: true, isTabletUp: false, sidebarWidth: 0 });
    expect(getBreakpoint(600, 800)).toMatchObject({ isPhone: false, isTabletUp: true, sidebarWidth: 96 });
    expect(getBreakpoint(900, 800)).toMatchObject({ isTabletUp: true, sidebarWidth: 220 });
  });

  it('define padding e largura máxima por faixa', () => {
    expect(getBreakpoint(360, 800)).toMatchObject({ horizontalPadding: 16, contentMaxWidth: undefined });
    expect(getBreakpoint(430, 800)).toMatchObject({ horizontalPadding: 24, contentMaxWidth: undefined });
    expect(getBreakpoint(744, 800)).toMatchObject({ horizontalPadding: 48, contentMaxWidth: 600 });
    expect(getBreakpoint(1024, 800)).toMatchObject({ horizontalPadding: 64, contentMaxWidth: 1000 });
  });
});
