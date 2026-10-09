import { createContext, useContext, useEffect, type ReactNode, type RefObject } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeContext';

export const GlassTargetContext = createContext<RefObject<View | null> | null>(null);

/**
 * Vidro só no tema escuro. No claro o chamador mantém a superfície sólida.
 * Blur real em cards de destaque (iOS direto; Android com BlurTargetView + dimezisBlurViewSdk31Plus).
 * Listas usam blur=false: superfície translúcida, sem BlurView.
 * Web não usa BlurView.
 */
export function GlassSurface({
  children,
  radius,
  blur = false,
  shimmer = false,
  style,
}: {
  children: ReactNode;
  radius: number;
  blur?: boolean;
  shimmer?: boolean;
  style?: ViewStyle;
}) {
  const { isDark, reduceAnimations } = useTheme();
  const target = useContext(GlassTargetContext);
  if (!isDark) {
    return <View style={style}>{children}</View>;
  }
  const canBlur = blur && Platform.OS !== 'web' && (Platform.OS !== 'android' || Boolean(target));
  return (
    <View
      style={[
        {
          borderRadius: radius,
          ...(Platform.OS === 'web'
            ? { boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.25)' }
            : { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 }),
        },
        style,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.1)']}
        style={{ borderRadius: radius, padding: 1 }}
      >
        <View style={{ borderRadius: radius - 1, overflow: 'hidden' }}>
          {canBlur ? (
            <BlurView
              intensity={90}
              tint="dark"
              blurMethod="dimezisBlurViewSdk31Plus"
              blurTarget={Platform.OS === 'android' ? target ?? undefined : undefined}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            />
          ) : (
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(18, 24, 43, 0.72)' }} />
          )}
          {children}
          <LinearGradient
            colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1 }}
          />
          {shimmer && !reduceAnimations ? <GlassShimmer /> : null}
        </View>
      </LinearGradient>
    </View>
  );
}

function GlassShimmer() {
  const x = useSharedValue(-200);
  const opacity = useSharedValue(0);
  useEffect(() => {
    x.value = withDelay(200, withTiming(200, { duration: 800 }));
    opacity.value = withDelay(200, withSequence(withTiming(0.3, { duration: 400 }), withTiming(0, { duration: 400 })));
  }, [opacity, x]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: 80, pointerEvents: 'none' }, style]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

export function AndroidBlurTarget({ targetRef, children }: { targetRef: RefObject<View | null>; children: ReactNode }) {
  if (Platform.OS !== 'android') {
    return <>{children}</>;
  }
  return (
    <View style={{ flex: 1 }}>
      <BlurTargetView ref={targetRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      {children}
    </View>
  );
}
