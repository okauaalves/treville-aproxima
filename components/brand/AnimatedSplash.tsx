import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SplashVideo } from '@/components/brand/SplashVideo';
import { TrevilleLogo } from '@/components/brand/TrevilleLogo';
import { APP_NAME, APP_TAGLINE } from '@/constants/config';
import { canLeaveSplash, decideSplashMode, SPLASH_VIDEO_BACKGROUND } from '@/lib/splash';
import { inter } from '@/theme/fonts';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/theme/ThemeContext';

const SPRING = { damping: 12, stiffness: 100 };

function prefersReducedMotionOnWeb(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) : false;
}

export function AnimatedSplash({ bootReady, onFinished }: { bootReady: boolean; onFinished: () => void }) {
  const reduceSetting = useSettingsStore((state) => state.reduceAnimations);
  const [systemReduce, setSystemReduce] = useState(prefersReducedMotionOnWeb);
  const reduce = reduceSetting || systemReduce;
  const [mode] = useState(() => decideSplashMode({ platform: Platform.OS, reduceMotion: reduce }));
  const [introFinished, setIntroDone] = useState(false);
  const introDone = introFinished || (mode === 'video' && reduce);
  const veil = useSharedValue(1);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void AccessibilityInfo.isReduceMotionEnabled?.().then(setSystemReduce);
  }, []);

  useEffect(() => {
    if (!canLeaveSplash({ introDone, bootReady })) {
      return;
    }
    const fade = reduce ? 120 : 320;
    veil.value = withTiming(0, { duration: fade });
    const timer = setTimeout(onFinished, fade + 16);
    return () => clearTimeout(timer);
  }, [bootReady, introDone, onFinished, reduce, veil]);

  const finishIntro = useCallback(() => setIntroDone(true), []);
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));

  return (
    <Animated.View style={[{ flex: 1 }, veilStyle]}>
      {mode === 'video' ? (
        <VideoIntro introDone={introDone} bootReady={bootReady} onEnd={finishIntro} />
      ) : (
        <LogoIntro introDone={introDone} bootReady={bootReady} reduce={reduce} onDone={finishIntro} />
      )}
    </Animated.View>
  );
}

function VideoIntro({ introDone, bootReady, onEnd }: { introDone: boolean; bootReady: boolean; onEnd: () => void }) {
  const insets = useSafeAreaInsets();
  const hidden = useRef(false);
  const hideNative = useCallback(() => {
    if (hidden.current) {
      return;
    }
    hidden.current = true;
    void SplashScreen.hideAsync();
  }, []);

  return (
    <View accessibilityLabel={`Abertura do ${APP_NAME}`} style={{ flex: 1, backgroundColor: SPLASH_VIDEO_BACKGROUND }}>
      <SplashVideo onReady={hideNative} onEnd={onEnd} />
      {!introDone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pular abertura"
          onPress={() => {
            hideNative();
            onEnd();
          }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <Text style={[{ position: 'absolute', top: insets.top + 12, right: 16, color: '#475569', backgroundColor: 'rgba(15,23,42,0.06)', borderRadius: 999, overflow: 'hidden', fontSize: 14, paddingHorizontal: 14, paddingVertical: 6 }, inter('semibold')]}>
            Pular
          </Text>
        </Pressable>
      ) : null}
      {introDone && !bootReady ? (
        <ActivityIndicator accessibilityLabel="Carregando" color="#64748B" style={{ position: 'absolute', bottom: insets.bottom + 48, alignSelf: 'center' }} />
      ) : null}
    </View>
  );
}

function LogoIntro({ introDone, bootReady, reduce, onDone }: { introDone: boolean; bootReady: boolean; reduce: boolean; onDone: () => void }) {
  const { colors } = useTheme();
  const scale = useSharedValue(reduce ? 1 : 0);
  const logoOpacity = useSharedValue(reduce ? 1 : 0);
  const titleY = useSharedValue(reduce ? 0 : 20);
  const titleOpacity = useSharedValue(reduce ? 1 : 0);
  const subtitleOpacity = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (reduce) {
      logoOpacity.value = withTiming(1, { duration: 300 });
      titleOpacity.value = withTiming(1, { duration: 300 });
      subtitleOpacity.value = withTiming(1, { duration: 300 });
      const timer = setTimeout(onDone, 300);
      return () => clearTimeout(timer);
    }
    scale.value = withSequence(withSpring(1.1, SPRING), withSpring(1, SPRING));
    logoOpacity.value = withTiming(1, { duration: 400 });
    titleY.value = withDelay(300, withTiming(0, { duration: 400 }));
    titleOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
    subtitleOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    const timer = setTimeout(onDone, 1800);
    return () => clearTimeout(timer);
  }, [logoOpacity, onDone, reduce, scale, subtitleOpacity, titleOpacity, titleY]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: scale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: subtitleOpacity.value }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Abrindo ${APP_NAME}`}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: colors.background }}
    >
      <Animated.View style={logoStyle}>
        <TrevilleLogo size={120} color={colors.primary} />
      </Animated.View>
      <Animated.Text style={[{ color: colors.primary, fontSize: 28, marginTop: 16, textAlign: 'center' }, inter('bold'), titleStyle]}>{APP_NAME}</Animated.Text>
      <Animated.Text style={[{ color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center' }, inter('regular'), subtitleStyle]}>{APP_TAGLINE}</Animated.Text>
      {introDone && !bootReady ? <ActivityIndicator color={colors.primary} style={{ marginTop: 28 }} /> : <View style={{ height: 48 }} />}
    </View>
  );
}
