import { useCallback } from 'react';
import { withSpring, withTiming, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeContext';

const SPRING = { damping: 18, stiffness: 380, mass: 1 };

export function usePressScale() {
  const { reduceAnimations } = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pressIn = useCallback(() => {
    scale.value = reduceAnimations ? withTiming(0.97, { duration: 80 }) : withSpring(0.97, SPRING);
  }, [reduceAnimations, scale]);
  const pressOut = useCallback(() => {
    scale.value = reduceAnimations ? withTiming(1, { duration: 80 }) : withSpring(1, SPRING);
  }, [reduceAnimations, scale]);
  return { animated, pressIn, pressOut };
}
