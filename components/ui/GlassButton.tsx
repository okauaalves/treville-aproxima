import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useHaptics } from '@/hooks/useHaptics';
import { withAlpha } from '@/theme/colors';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING = { damping: 15, stiffness: 300 };

/**
 * Botão sólido nos dois temas (sem vidro nem reflexo): primary/success/danger com fundo cheio,
 * neutral = secundário com fundo surface, borda 1.5px primary e texto primary.
 * Cor do texto vem de onPrimary/onSuccess/onDanger, que no escuro é #0F172A para manter AA.
 * "Continuar" / "Começar" / "Entendi, continuar" são secundários com a seta.
 */
const PROMINENT = new Set(['Continuar', 'Começar', 'Entendi, continuar']);

export type GlassButtonVariant = 'primary' | 'success' | 'danger' | 'neutral';

export function GlassButton({
  label,
  onPress,
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
  variant?: GlassButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { colors, reduceAnimations } = useTheme();
  const haptics = useHaptics();
  const [focused, setFocused] = useState(false);
  const scale = useSharedValue(1);
  const prominent = PROMINENT.has(label) && variant === 'primary';
  const resolved: GlassButtonVariant = prominent ? 'neutral' : variant;
  const fill = resolved === 'success' ? colors.success : resolved === 'danger' ? colors.danger : resolved === 'primary' ? colors.primary : colors.surfaceElevated;
  const labelColor = resolved === 'success' ? colors.onSuccess : resolved === 'danger' ? colors.onDanger : resolved === 'primary' ? colors.onPrimary : colors.primary;
  const showArrow = prominent && !icon && !loading;
  const blocked = disabled || loading;

  function pressTo(next: number) {
    scale.value = reduceAnimations ? withTiming(next === 1 ? 1 : 0.99, { duration: 80 }) : withSpring(next, SPRING);
  }

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => {
        if (!blocked) pressTo(0.97);
      }}
      onPressOut={() => pressTo(1)}
      onPress={() => {
        haptics.impact();
        onPress?.();
      }}
      style={[
        animated,
        {
          alignSelf: fullWidth ? 'stretch' : 'auto',
          opacity: disabled ? 0.45 : 1,
          borderRadius: radius.button,
          ...(Platform.OS === 'web'
            ? { boxShadow: `0px 4px 8px ${withAlpha(colors.primaryDark, '40')}` }
            : { shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 }),
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: prominent ? 60 : 52,
          paddingVertical: 16,
          paddingHorizontal: prominent ? 22 : 20,
          borderRadius: radius.button,
          backgroundColor: fill,
          borderWidth: focused ? 2 : resolved === 'neutral' ? 1.5 : 0,
          borderColor: focused ? colors.primaryLight : colors.primary,
        }}
      >
        {showArrow ? <View style={{ width: 32 }} /> : null}
        {loading ? <ActivityIndicator color={labelColor} /> : icon}
        <Text style={[{ flex: showArrow ? 1 : undefined, textAlign: 'center', color: labelColor, fontSize: 16 }, inter('semibold')]}>{label}</Text>
        {showArrow ? (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowRight color={colors.onPrimary} size={16} />
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}
