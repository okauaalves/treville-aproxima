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
import { useColorScheme, vars } from 'nativewind';

import { springOrTiming as motion } from './animations';
import {
  colorsForScheme,
  type ColorScheme,
  type ThemeColors,
  type ThemePreference,
} from './colors';
import { TEXT_SCALES } from './typography';
import { sizes } from './tokens';
import { useSettingsStore } from '@/stores/settingsStore';

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ColorScheme;
  isDark: boolean;
  colors: ThemeColors;
  navigationTheme: Theme;
  reduceAnimations: boolean;
  textScale: keyof typeof TEXT_SCALES;
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
      fs: (size: number) => Math.round(size * TEXT_SCALES[textScale]),
      springOrTiming: (toValue: number) => motion(toValue, reduceAnimations),
      setPreference,
    }),
    [colors, isDark, preference, reduceAnimations, scheme, setPreference, textScale],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: isDark ? '#05080F' : '#F8FAFF', alignItems: 'center' }}>
        <View style={[{ flex: 1, width: '100%', maxWidth: sizes.column, backgroundColor: colors.background }, cssVars]}>
          {children}
        </View>
      </View>
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
