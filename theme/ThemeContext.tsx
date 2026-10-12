import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme, vars } from 'nativewind';

import { springOrTiming as motion } from './animations';
import {
  colorsForScheme,
  type ColorScheme,
  type ThemeColors,
  type ThemePreference,
} from './colors';
import { BASE_FONT_SIZE, TEXT_SCALES } from './typography';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useSettingsStore } from '@/stores/settingsStore';

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ColorScheme;
  isDark: boolean;
  colors: ThemeColors;
  navigationTheme: Theme;
  reduceAnimations: boolean;
  textScale: keyof typeof TEXT_SCALES;
  /** Base tipográfica do breakpoint atual (14/16/17/18). */
  baseFont: number;
  /** Tamanho escrito para base 16, escalado pelo breakpoint e pelo "Tamanho do texto". */
  fs: (size: number) => number;
  springOrTiming: (toValue: number) => number;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveScheme(
  preference: ThemePreference,
  systemScheme: string | null | undefined,
): ColorScheme {
  if (preference === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }

  return preference;
}

function buildNavigationTheme(scheme: ColorScheme, colors: ThemeColors): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

function buildCssVars(colors: ThemeColors) {
  return vars({
    '--color-background': colors.background,
    '--color-surface': colors.surface,
    '--color-surface-elevated': colors.surfaceElevated,
    '--color-primary': colors.primary,
    '--color-on-primary': colors.onPrimary,
    '--color-success': colors.success,
    '--color-warning': colors.warning,
    '--color-danger': colors.danger,
    '--color-foreground': colors.text,
    '--color-muted': colors.textSecondary,
    '--color-border': colors.border,
  });
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const storedTheme = useSettingsStore((state) => state.theme);
  const storedReduce = useSettingsStore((state) => state.reduceAnimations);
  const [systemReduce, setSystemReduce] = useState(() =>
    Platform.OS === 'web' && typeof window !== 'undefined' ? Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) : false,
  );
  const reduceAnimations = storedReduce || systemReduce;
  const textScale = useSettingsStore((state) => state.textScale);
  const { baseFont } = useBreakpoint();
  const preference = storedTheme;
  const scheme = resolveScheme(preference, colorScheme);
  const colors = colorsForScheme(scheme);
  const isDark = scheme === 'dark';

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setColorScheme(next);
      void useSettingsStore.getState().setTheme(next);
    },
    [setColorScheme],
  );

  const cssVars = useMemo(() => buildCssVars(colors), [colors]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void AccessibilityInfo.isReduceMotionEnabled?.().then(setSystemReduce);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setSystemReduce);
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      scheme,
      isDark,
      colors,
      navigationTheme: buildNavigationTheme(scheme, colors),
      reduceAnimations,
      textScale,
      baseFont,
      fs: (size: number) => Math.round(size * (baseFont / BASE_FONT_SIZE) * TEXT_SCALES[textScale]),
      springOrTiming: (toValue: number) => motion(toValue, reduceAnimations),
      setPreference,
    }),
    [baseFont, colors, isDark, preference, reduceAnimations, scheme, setPreference, textScale],
  );

  return (
    <ThemeContext.Provider value={value}>
      <LinearGradient colors={[colors.backgroundSecondary, colors.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, overflow: 'hidden' }}>
        <View style={[{ flex: 1, width: '100%' }, cssVars]}>
          {children}
        </View>
      </LinearGradient>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme deve ser usado dentro de AppThemeProvider.');
  }

  return value;
}
