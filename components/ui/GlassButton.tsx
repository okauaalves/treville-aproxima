import { useContext, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { GlassTargetContext } from '@/components/ui/GlassSurface';
import { useHaptics } from '@/hooks/useHaptics';
import { inter } from '@/theme/fonts';
import { radius, sizes } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const FILL = {
  primary: 'rgba(59, 130, 246, 0.9)',
  success: 'rgba(22, 163, 74, 0.9)',
  danger: 'rgba(220, 38, 38, 0.9)',
} as const;

const SPRING = { damping: 16, stiffness: 320 };

/**
 * Vidro nos dois temas. Cards continuam sólidos no claro (GlassSurface).
 * Variantes coloridas: tinta com alpha 0.9 sobre o blur. Branco sobre #3B82F6 opaco
 * fica ~3.7:1 e o alpha 0.9 sobre fundo claro piora um pouco — o texto fica Inter bold 18/20.
 * Reflexo diagonal nas coloridas usa 0.35 (não 0.8) para não lavar a cor.
 * "Continuar" / "Começar" / "Entendi, continuar" usam Inter, não a fonte do sistema.
 * No escuro a base neutra é rgba(255,255,255,0.08); rgba(0,0,0,0.02) some no fundo escuro.
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
  const { colors, isDark, reduceAnimations } = useTheme();
  const target = useContext(GlassTargetContext);
  const haptics = useHaptics();
  const [focused, setFocused] = useState(false);
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const prominent = PROMINENT.has(label) && variant === 'primary';
  const resolved: GlassButtonVariant = prominent ? 'neutral' : variant;
  const colored = resolved !== 'neutral';
  const labelColor = colored ? '#FFFFFF' : isDark ? '#f5f5f5' : '#3e3e3e';
  const fill = colored ? FILL[resolved] : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.02)';
  const shine = colored ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)';
  const showArrow = prominent && !icon && !loading;
  const blocked = disabled || loading;

  function motion(nextScale: number, nextLift: number) {
    if (reduceAnimations) {
      scale.value = withTiming(nextScale, { duration: 80 });
      lift.value = withTiming(nextLift, { duration: 80 });
      return;
    }
    scale.value = withSpring(nextScale, SPRING);
    lift.value = withSpring(nextLift, SPRING);
  }

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { scale: scale.value }],
  }));

  const webBlur = Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as ViewStyle) : undefined;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => {
        if (!blocked) motion(1, reduceAnimations ? 0 : -3);
      }}
      onHoverOut={() => {
        if (!blocked) motion(1, 0);
      }}
      onPressIn={() => {
        if (!blocked) motion(reduceAnimations ? 1 : 0.94, reduceAnimations ? 0 : -3);
      }}
      onPressOut={() => motion(1, 0)}
      onPress={() => {
        haptics.impact();
        onPress?.();
      }}
      style={[
        animated,
        {
          alignSelf: fullWidth ? 'stretch' : 'auto',
          opacity: disabled ? 0.45 : 1,
          borderRadius: radius.md,
          ...(Platform.OS === 'web'
            ? { boxShadow: '0px 4px 8px rgba(0,0,0,0.2)' }
            : {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 8,
              }),
        },
        style,
      ]}
    >
      <View
        style={{
          borderRadius: radius.md,
          overflow: 'hidden',
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.primary : 'rgba(255,255,255,0.08)',
          minHeight: prominent ? 64 : sizes.button,
        }}
      >
        {Platform.OS === 'web' ? (
          <View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: fill }, webBlur]} />
        ) : (
          <>
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'light'}
              blurMethod="dimezisBlurViewSdk31Plus"
              blurTarget={Platform.OS === 'android' ? target ?? undefined : undefined}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            />
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: fill }} />
          </>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: prominent ? 64 : sizes.button,
            paddingHorizontal: prominent ? 24 : 20,
          }}
        >
          {showArrow ? <View style={{ width: 32 }} /> : null}
          {loading ? <ActivityIndicator color={labelColor} /> : icon}
          <Text style={[{ flex: showArrow ? 1 : undefined, textAlign: 'center', color: labelColor, fontSize: prominent ? 20 : 18 }, inter('bold')]}>{label}</Text>
          {showArrow ? (
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowRight color="#FFFFFF" size={16} />
            </View>
          ) : null}
        </View>
        <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.9)' }} />
        <View style={{ pointerEvents: 'none', position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} />
        <LinearGradient
          colors={[shine, 'transparent', 'transparent', shine]}
          locations={[0, 0.2, 0.8, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ pointerEvents: 'none', position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
      </View>
    </AnimatedPressable>
  );
}
