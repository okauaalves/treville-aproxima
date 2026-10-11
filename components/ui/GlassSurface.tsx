import { createContext, useContext, useEffect, type ReactNode, type RefObject } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeContext';

export const GlassTargetContext = createContext<RefObject<View | null> | null>(null);

/**
 * Vidro só no tema escuro (BlurView intensity 60, borda glassBorder). No claro o chamador mantém a superfície sólida.
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
  const { colors, isDark, reduceAnimations } = useTheme();
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
            ? { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)' }
            : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }),
        },
        style,
      ]}
    >
      <View style={{ borderRadius: radius, borderWidth: 1, borderColor: colors.glassBorder }}>
        <View style={{ borderRadius: radius - 1, overflow: 'hidden' }}>
          {canBlur ? (
            <>
              <BlurView
                intensity={60}
                tint="dark"
                blurMethod="dimezisBlurViewSdk31Plus"
                blurTarget={Platform.OS === 'android' ? target ?? undefined : undefined}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
              />
              <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.glassBg, opacity: 0.6 }} />
            </>
          ) : (
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.surface }} />
          )}
          {children}
          <LinearGradient
            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1 }}
          />
          {shimmer && !reduceAnimations ? <GlassShimmer /> : null}
        </View>
      </View>
    </View>
  );
}

function GlassShimmer() {
  const x = useSharedValue(-200);
  const opacity = useSharedValue(0);
  useEffect(() => {
    x.value = withDelay(200, withTiming(200, { duration: 800 }));
    opacity.value = withDelay(200, withSequence(withTiming(0.15, { duration: 400 }), withTiming(0, { duration: 400 })));
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
