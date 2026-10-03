export type ColorScheme = 'light' | 'dark';

export type ThemePreference = ColorScheme | 'system';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
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
    background: '#F8FAFF',
    primary: '#2563EB',
    success: '#16A34A',
  },
  dark: {
    background: '#0A0F1E',
    primary: '#3B6FFF',
    success: '#22C55E',
  },
} as const;

export const lightColors: ThemeColors = {
  background: palette.light.background,
  surface: '#FFFFFF',
  surfaceElevated: '#EEF2FF',
  primary: palette.light.primary,
  primaryPressed: '#1D4ED8',
  onPrimary: '#FFFFFF',
  success: palette.light.success,
  warning: '#D97706',
  danger: '#DC2626',
  error: '#DC2626',
  text: '#0A0F1E',
  textPrimary: '#0A0F1E',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E6ECF5',
  glassBorder: '#E6ECF5',
  glassBg: '#FFFFFF',
  successBg: '#E8F8F1',
  errorBg: 'rgba(220,38,38,0.12)',
  warningBg: 'rgba(217,119,6,0.12)',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const darkColors: ThemeColors = {
  background: palette.dark.background,
  surface: '#12182B',
  surfaceElevated: '#1A2238',
  primary: palette.dark.primary,
  primaryPressed: '#2F5AE0',
  onPrimary: '#FFFFFF',
  success: palette.dark.success,
  warning: '#F59E0B',
  danger: '#EF4444',
  error: '#EF4444',
  text: '#F8FAFC',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#64748B',
  border: '#243049',
  glassBorder: 'rgba(255,255,255,0.2)',
  glassBg: 'rgba(255,255,255,0.08)',
  successBg: 'rgba(34,197,94,0.16)',
  errorBg: 'rgba(239,68,68,0.16)',
  warningBg: 'rgba(245,158,11,0.16)',
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
  URL: { dark: '#3B6FFF', light: '#2563EB' },
  WHATSAPP: { dark: '#22C55E', light: '#16A34A' },
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
