import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/theme/ThemeContext';

/** Fundo das telas: diagonal suave background → backgroundSecondary (claro #EEF2FF → #E0E7FF, escuro #0F172A → #1E293B). */
export function GradientBackground({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <LinearGradient colors={[colors.background, colors.backgroundSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ flex: 1 }, style]}>
      {children}
    </LinearGradient>
  );
}
