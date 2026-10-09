import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

import { GlassButton } from '@/components/ui/GlassButton';

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
  const neutral = variant === 'secondary' || variant === 'ghost';
  const resolved = neutral ? 'neutral' : (tone ?? (variant === 'success' ? 'success' : variant === 'danger' ? 'danger' : 'primary'));
  return (
    <GlassButton
      label={label}
      onPress={onPress}
      variant={resolved}
      loading={loading}
      disabled={disabled}
      icon={icon}
      fullWidth={fullWidth}
      style={style}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
