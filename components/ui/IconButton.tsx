import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/hooks/usePressScale';
import { sizes } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function IconButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  const { animated, pressIn, pressOut } = usePressScale();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      hitSlop={8}
      style={[animated, { width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' }]}
    >
      {children}
    </AnimatedPressable>
  );
}
