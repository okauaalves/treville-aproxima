import type { ReactNode, RefObject } from 'react';
import { useRef } from 'react';
import { Platform, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GradientBackground } from '@/components/layout/GradientBackground';
import { AndroidBlurTarget, GlassTargetContext } from '@/components/ui/GlassSurface';
import { screenEntering } from '@/theme/enter';
import { useTheme } from '@/theme/ThemeContext';

export function Screen({ children }: { children?: ReactNode }) {
  const { reduceAnimations } = useTheme();
  const targetRef = useRef<View>(null);
  return (
    <GradientBackground>
      <GlassTargetContext.Provider value={Platform.OS === 'android' ? (targetRef as RefObject<View | null>) : null}>
        <AndroidBlurTarget targetRef={targetRef as RefObject<View | null>}>
          <Animated.View entering={screenEntering(reduceAnimations)} style={{ flex: 1 }}>
            {children}
          </Animated.View>
        </AndroidBlurTarget>
      </GlassTargetContext.Provider>
    </GradientBackground>
  );
}
