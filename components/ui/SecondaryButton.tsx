import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';

import { useHaptics } from '@/hooks/useHaptics';
import { inter } from '@/theme/fonts';
import { radius, sizes } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

export function SecondaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { colors, fs } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={() => {
        haptics.impact();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          minHeight: sizes.button,
          borderRadius: radius.md,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: disabled ? 0.45 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> : icon}
        <Text style={[{ color: colors.primary, fontSize: fs(16) }, inter('bold')]}>{label}</Text>
      </View>
    </Pressable>
  );
}
