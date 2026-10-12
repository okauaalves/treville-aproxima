import { useWindowDimensions } from 'react-native';

export type BreakpointName = 'small' | 'normal' | 'large' | 'tablet' | 'bigTablet';

const BASE_FONT: Record<BreakpointName, number> = { small: 14, normal: 16, large: 17, tablet: 18, bigTablet: 18 };
const HORIZONTAL_PADDING: Record<BreakpointName, number> = { small: 16, normal: 16, large: 24, tablet: 48, bigTablet: 64 };

/** Largura da sidebar que substitui a tab bar a partir de 600px. */
export const SIDEBAR_WIDTH = { tablet: 96, bigTablet: 220 } as const;

export function getBreakpoint(width: number, height: number) {
  const isSmall = width < 380;
  const isNormal = width >= 380 && width < 430;
  const isLarge = width >= 430 && width < 600;
  const isTablet = width >= 600 && width < 900;
  const isBigTablet = width >= 900;
  const bp: BreakpointName = isSmall ? 'small' : isNormal ? 'normal' : isLarge ? 'large' : isTablet ? 'tablet' : 'bigTablet';
  return {
    isSmall,
    isNormal,
    isLarge,
    isTablet,
    isBigTablet,
    isFoldOpen: width >= 840,
    width,
    height,
    isLandscape: width > height,
    bp,
    isPhone: width < 600,
    isTabletUp: width >= 600,
    baseFont: BASE_FONT[bp],
    horizontalPadding: HORIZONTAL_PADDING[bp],
    contentMaxWidth: isBigTablet ? 1000 : isTablet ? 600 : undefined,
    sidebarWidth: isBigTablet ? SIDEBAR_WIDTH.bigTablet : isTablet ? SIDEBAR_WIDTH.tablet : 0,
  };
}

export type Breakpoint = ReturnType<typeof getBreakpoint>;

export function useBreakpoint(): Breakpoint {
  const { width, height } = useWindowDimensions();
  return getBreakpoint(width, height);
}
