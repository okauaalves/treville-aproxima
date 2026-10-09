import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassSurface } from '@/components/ui/GlassSurface';
import { usePressScale } from '@/hooks/usePressScale';
import { radius, shadows } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({
  children,
  onPress,
  onLongPress,
  padding = 16,
  tone = 'surface',
  variant,
  blur = false,
  shimmer = false,
  style,
  accessibilityLabel,
}: {
  children?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  padding?: number;
  tone?: 'surface' | 'accent' | 'success' | 'error';
  variant?: 'default' | 'success' | 'error' | 'warning';
  blur?: boolean;
  shimmer?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { colors, isDark } = useTheme();
  const { animated, pressIn, pressOut } = usePressScale();
  const look = variant === 'success' || tone === 'success' ? 'success' : variant === 'error' || tone === 'error' ? 'error' : tone;
  const background =
    look === 'success' ? colors.successBg : look === 'error' ? colors.errorBg : look === 'accent' ? (isDark ? colors.surfaceElevated : '#F4F8FF') : colors.surface;
  const border = look === 'success' ? colors.success : look === 'error' ? colors.error : colors.border;
  const frame: ViewStyle = {
    backgroundColor: isDark && look === 'surface' ? 'transparent' : background,
    borderRadius: radius.lg,
    borderWidth: isDark && look === 'surface' ? 0 : 1,
    borderColor: border,
    padding,
    boxShadow: isDark ? shadows.none : shadows.card,
  };
  const inner = isDark && look === 'surface' ? (
    <GlassSurface radius={radius.lg} blur={blur} shimmer={shimmer} style={style}>
      <View style={{ padding }}>{children}</View>
    </GlassSurface>
  ) : (
    <View style={[frame, style]}>{children}</View>
  );
  if (!onPress && !onLongPress) {
    return inner;
  }
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={animated}
    >
      {inner}
    </AnimatedPressable>
  );
}
