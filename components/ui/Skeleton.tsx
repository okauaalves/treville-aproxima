import { useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeContext';

export function Skeleton({ height = 72 }: { height?: number }) {
  const { colors, reduceAnimations, isDark } = useTheme();
  const x = useSharedValue(-180);
  useEffect(() => {
    if (reduceAnimations) {
      x.value = 0;
      return;
    }
    x.value = withRepeat(withTiming(280, { duration: 1100 }), -1, false);
  }, [reduceAnimations, x]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={{ height, borderRadius: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.surfaceElevated, marginBottom: 12, overflow: 'hidden' }}>
      {reduceAnimations ? null : (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: 120 }, slide]}>
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
    </View>
  );
}
