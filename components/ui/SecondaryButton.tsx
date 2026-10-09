import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

import { GlassButton } from '@/components/ui/GlassButton';

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
  return (
    <GlassButton
      label={label}
      onPress={onPress}
      variant="neutral"
      loading={loading}
      disabled={disabled}
      icon={icon}
      fullWidth={fullWidth}
      style={style}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
