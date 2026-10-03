import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useHaptics } from '@/hooks/useHaptics';
import { inter } from '@/theme/fonts';
import { radius, sizes } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({
  label,
  onPress,
  tone,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'primary' | 'success' | 'danger';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { colors, fs, springOrTiming } = useTheme();
  const haptics = useHaptics();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (variant === 'secondary' || variant === 'ghost') {
    return <SecondaryButton label={label} onPress={onPress} loading={loading} disabled={disabled} icon={icon} fullWidth={fullWidth} style={style} accessibilityLabel={accessibilityLabel} />;
  }
  const resolved = tone ?? (variant === 'success' ? 'success' : variant === 'danger' ? 'danger' : 'primary');
  const background = resolved === 'success' ? colors.success : resolved === 'danger' ? colors.error : colors.primary;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={() => {
        haptics.impact();
        onPress?.();
      }}
      onPressIn={() => {
        scale.value = springOrTiming(0.98);
      }}
      onPressOut={() => {
        scale.value = springOrTiming(1);
      }}
      style={[
        animated,
        {
          minHeight: sizes.button,
          borderRadius: radius.md,
          paddingHorizontal: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
          opacity: disabled ? 0.45 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : icon}
        <Text style={[{ color: '#FFFFFF', fontSize: fs(16) }, inter('bold')]}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}
