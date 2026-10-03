import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

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
  style,
  accessibilityLabel,
}: {
  children?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  padding?: number;
  tone?: 'surface' | 'accent' | 'success' | 'error';
  variant?: 'default' | 'success' | 'error' | 'warning';
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { colors, isDark, springOrTiming } = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const look = variant === 'success' || tone === 'success' ? 'success' : variant === 'error' || tone === 'error' ? 'error' : tone;
  const background =
    look === 'success' ? colors.successBg : look === 'error' ? colors.errorBg : look === 'accent' ? (isDark ? colors.surfaceElevated : '#F4F8FF') : colors.surface;
  const border = look === 'success' ? colors.success : look === 'error' ? colors.error : colors.border;
  const frame: ViewStyle = {
    backgroundColor: background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: border,
    padding,
    boxShadow: isDark ? shadows.none : shadows.card,
  };
  if (!onPress && !onLongPress) {
    return <View style={[frame, style]}>{children}</View>;
  }
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        scale.value = springOrTiming(0.98);
      }}
      onPressOut={() => {
        scale.value = springOrTiming(1);
      }}
      style={[animated, frame, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
