import { forwardRef, type ReactNode } from 'react';
import { Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

export const Input = forwardRef<TextInput, TextInputProps & {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerStyle?: ViewStyle;
}>(function Input({ label, error, leftIcon, rightIcon, containerStyle, style, multiline, ...props }, ref) {
  const { colors, fs } = useTheme();
  return (
    <View style={[{ marginBottom: 14 }, containerStyle]}>
      {label ? <Text style={[{ color: colors.textPrimary, fontSize: fs(14), marginBottom: 8 }, inter('bold')]}>{label}</Text> : null}
      <View
        style={{
          minHeight: multiline ? 96 : 52,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: error ? colors.error : colors.border,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          paddingHorizontal: 14,
        }}
      >
        {leftIcon}
        <TextInput
          ref={ref}
          multiline={multiline}
          placeholderTextColor={colors.textMuted}
          style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(16), paddingVertical: 12, textAlignVertical: multiline ? 'top' : 'center' }, inter('regular'), style]}
          {...props}
        />
        {rightIcon}
      </View>
      {error ? <Text style={[{ color: colors.error, fontSize: fs(12), marginTop: 6 }, inter('medium')]}>{error}</Text> : null}
    </View>
  );
});
