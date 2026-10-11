import type { ReactNode } from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';
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
  const glass = isDark && (look === 'surface' || look === 'accent');
  const background = look === 'success' ? colors.successBg : look === 'error' ? colors.errorBg : look === 'accent' ? colors.surfaceElevated : colors.surface;
  const border = look === 'success' ? colors.success : look === 'error' ? colors.error : colors.glassBorder;
  const frame: ViewStyle = {
    backgroundColor: background,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: border,
    padding,
    ...(Platform.OS === 'web' ? { boxShadow: shadows.card } : { shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }),
  };
  const inner = glass ? (
    <GlassSurface radius={radius.card} blur={blur} shimmer={shimmer} style={style ? { ...style, alignItems: undefined, justifyContent: undefined } : undefined}>
      <View style={{ padding, alignItems: style?.alignItems, justifyContent: style?.justifyContent }}>{children}</View>
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
