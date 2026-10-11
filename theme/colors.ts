export type ColorScheme = 'light' | 'dark';

export type ThemePreference = ColorScheme | 'system';

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceElevated: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryGlow: string;
  primaryPressed: string;
  onPrimary: string;
  onSuccess: string;
  onDanger: string;
  success: string;
  warning: string;
  danger: string;
  error: string;
  text: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  glassBorder: string;
  glassBg: string;
  successBg: string;
  errorBg: string;
  warningBg: string;
  overlay: string;
}

export const palette = {
  light: {
    background: '#EEF2FF',
    backgroundSecondary: '#E0E7FF',
    primary: '#1E40AF',
    success: '#15803D',
  },
  dark: {
    background: '#0F172A',
    backgroundSecondary: '#1E293B',
    primary: '#60A5FA',
    success: '#22C55E',
  },
} as const;

/**
 * Texto sobre botões sólidos (AA): no claro branco sobre #1E40AF (~8.7:1) e #15803D (~5:1).
 * No escuro primary #60A5FA e success #22C55E são claros — branco ficaria ~2.5:1, então
 * o texto é #0F172A (~7.8:1 e ~8.6:1). Danger escuro #EF4444 também usa texto escuro (~4.9:1).
 */
export const lightColors: ThemeColors = {
  background: palette.light.background,
  backgroundSecondary: palette.light.backgroundSecondary,
  surface: 'rgba(255,255,255,0.92)',
  surfaceElevated: '#FFFFFF',
  primary: palette.light.primary,
  primaryDark: '#1E3A8A',
  primaryLight: '#3B82F6',
  primaryGlow: 'rgba(30,64,175,0.20)',
  primaryPressed: '#1E3A8A',
  onPrimary: '#FFFFFF',
  onSuccess: '#FFFFFF',
  onDanger: '#FFFFFF',
  success: palette.light.success,
  warning: '#D97706',
  danger: '#DC2626',
  error: '#DC2626',
  text: '#0F172A',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#C7D2FE',
  glassBorder: 'rgba(30,64,175,0.15)',
  glassBg: 'rgba(255,255,255,0.80)',
  successBg: 'rgba(21,128,61,0.10)',
  errorBg: 'rgba(220,38,38,0.10)',
  warningBg: 'rgba(217,119,6,0.10)',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const darkColors: ThemeColors = {
  background: palette.dark.background,
  backgroundSecondary: palette.dark.backgroundSecondary,
  surface: 'rgba(30,41,59,0.90)',
  surfaceElevated: '#1E293B',
  primary: palette.dark.primary,
  primaryDark: '#3B82F6',
  primaryLight: '#93C5FD',
  primaryGlow: 'rgba(96,165,250,0.25)',
  primaryPressed: '#3B82F6',
  onPrimary: '#0F172A',
  onSuccess: '#0F172A',
  onDanger: '#0F172A',
  success: palette.dark.success,
  warning: '#F59E0B',
  danger: '#EF4444',
  error: '#EF4444',
  text: 'rgba(248,250,252,0.95)',
  textPrimary: 'rgba(248,250,252,0.95)',
  textSecondary: 'rgba(148,163,184,0.90)',
  textMuted: 'rgba(100,116,139,0.80)',
  border: '#334155',
  glassBorder: 'rgba(96,165,250,0.20)',
  glassBg: 'rgba(15,23,42,0.85)',
  successBg: 'rgba(34,197,94,0.12)',
  errorBg: 'rgba(239,68,68,0.12)',
  warningBg: 'rgba(245,158,11,0.12)',
  overlay: 'rgba(2, 6, 23, 0.62)',
};

export const themeColors: Record<ColorScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

export function colorsForScheme(scheme: ColorScheme): ThemeColors {
  return themeColors[scheme];
}

export type ContentType =
  | 'URL'
  | 'WHATSAPP'
  | 'PHONE'
  | 'EMAIL'
  | 'VCARD'
  | 'WIFI'
  | 'LOCATION'
  | 'TEXT'
  | 'LINK_APP'
  | 'EVENT'
  | 'CUSTOM';

export const ContentTypeColors: Record<ContentType, { dark: string; light: string }> = {
  URL: { dark: '#60A5FA', light: '#1E40AF' },
  WHATSAPP: { dark: '#22C55E', light: '#15803D' },
  PHONE: { dark: '#38BDF8', light: '#0284C7' },
  EMAIL: { dark: '#F59E0B', light: '#D97706' },
  VCARD: { dark: '#A78BFA', light: '#7C3AED' },
  WIFI: { dark: '#22D3EE', light: '#0891B2' },
  LOCATION: { dark: '#FB7185', light: '#E11D48' },
  TEXT: { dark: '#CBD5E1', light: '#475569' },
  LINK_APP: { dark: '#818CF8', light: '#4F46E5' },
  EVENT: { dark: '#F472B6', light: '#DB2777' },
  CUSTOM: { dark: '#94A3B8', light: '#64748B' },
};

export const ContentTypeIcons: Record<ContentType, string> = {
  URL: 'Link',
  WHATSAPP: 'MessageCircle',
  PHONE: 'Phone',
  EMAIL: 'Mail',
  VCARD: 'User',
  WIFI: 'Wifi',
  LOCATION: 'MapPin',
  TEXT: 'Type',
  LINK_APP: 'Smartphone',
  EVENT: 'Calendar',
  CUSTOM: 'Type',
};

export function withAlpha(color: string, alphaByte: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return `${color}${alphaByte}`;
  }
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) {
    return color;
  }
  const alpha = Number.parseInt(alphaByte, 16) / 255;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}
