import type { ReactNode, RefObject } from 'react';
import { useRef } from 'react';
import { Platform, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CONTENT_WIDTH, ContentContainer } from '@/components/layout/ContentContainer';
import { GradientBackground } from '@/components/layout/GradientBackground';
import { AndroidBlurTarget, GlassTargetContext } from '@/components/ui/GlassSurface';
import { screenEntering } from '@/theme/enter';
import { useTheme } from '@/theme/ThemeContext';

/** Fundo em gradiente na tela inteira; o conteúdo fica numa coluna de até `maxWidth` (500 nas telas internas). `maxWidth={null}` libera a largura toda. */
export function Screen({ children, maxWidth = CONTENT_WIDTH.inner }: { children?: ReactNode; maxWidth?: number | null }) {
  const { reduceAnimations } = useTheme();
  const targetRef = useRef<View>(null);
  return (
    <GradientBackground>
      <GlassTargetContext.Provider value={Platform.OS === 'android' ? (targetRef as RefObject<View | null>) : null}>
        <AndroidBlurTarget targetRef={targetRef as RefObject<View | null>}>
          <Animated.View entering={screenEntering(reduceAnimations)} style={{ flex: 1 }}>
            <ContentContainer maxWidth={maxWidth}>{children}</ContentContainer>
          </Animated.View>
        </AndroidBlurTarget>
      </GlassTargetContext.Provider>
    </GradientBackground>
  );
}
