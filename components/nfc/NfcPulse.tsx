import { useEffect } from 'react';
import { View } from 'react-native';
import { Nfc } from 'lucide-react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeContext';

function Ring({ size, delay, color, active }: { size: number; delay: number; color: string; active: boolean }) {
  const scale = useSharedValue(0.86);
  const opacity = useSharedValue(0.35);
  useEffect(() => {
    if (!active) {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value = 0.9;
      opacity.value = 0.28;
      return;
    }
    scale.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1600 }), -1, true));
    opacity.value = withDelay(delay, withRepeat(withTiming(0.08, { duration: 1600 }), -1, true));
  }, [active, delay, opacity, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color }, style]} />;
}

/** Ondas NFC do mockup. A animação para quando o usuário reduz animações. */
export function NfcPulse({ size = 132, active = true }: { size?: number; active?: boolean }) {
  const { colors, reduceAnimations } = useTheme();
  const core = size * 0.42;
  const animate = active && !reduceAnimations;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ring size={size} delay={0} color={colors.primary} active={animate} />
      <Ring size={size * 0.74} delay={180} color={colors.primary} active={animate} />
      <View style={{ width: core, height: core, borderRadius: core / 2, backgroundColor: colors.surface, borderWidth: 2, borderColor: `${colors.primary}33`, alignItems: 'center', justifyContent: 'center' }}>
        <Nfc color={colors.primary} size={core * 0.5} strokeWidth={2} />
      </View>
    </View>
  );
}
