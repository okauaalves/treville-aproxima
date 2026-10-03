import { useEffect } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeContext';

export function Skeleton({ height = 72 }: { height?: number }) {
  const { colors, reduceAnimations } = useTheme();
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    if (reduceAnimations) {
      cancelAnimation(opacity);
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [opacity, reduceAnimations]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ height, borderRadius: 20, backgroundColor: colors.glassBg, marginBottom: 12 }, style]} />;
}
