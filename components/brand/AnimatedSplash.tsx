import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { TrevilleLogo } from '@/components/brand/TrevilleLogo';
import { APP_NAME, APP_TAGLINE } from '@/constants/config';
import { canLeaveSplash, SPLASH_DURATION_MS, SPLASH_REDUCED_DURATION_MS } from '@/lib/splash';
import { inter } from '@/theme/fonts';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/theme/ThemeContext';

const BRAND_BLUE = '#3B82F6';
const LOGO_SIZE = 150;
const NATIVE_DRIVER = Platform.OS !== 'web';

/** Coordenadas das três colunas em public/logo.svg (viewBox 3486.82 x 2963.26). */
const SVG_WIDTH = 3486.82;
const SVG_HEIGHT = 2963.26;
const COLUMN_WIDTH = 417;
const COLUMNS = [
  { cx: 945, cy: 1528, height: 2471, rise: 0.28 },
  { cx: 1692, cy: 1528, height: 2781, rise: -0.28 },
  { cx: 2458, cy: 1528, height: 2471, rise: 0.28 },
];

const UNIT = LOGO_SIZE / SVG_WIDTH;
const OFFSET_Y = (LOGO_SIZE - SVG_HEIGHT * UNIT) / 2;
const DOT = COLUMN_WIDTH * UNIT;

function prefersReducedMotionOnWeb(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) : false;
}

export function AnimatedSplash({ bootReady, onFinished }: { bootReady: boolean; onFinished: () => void }) {
  const { colors, scheme } = useTheme();
  const reduceSetting = useSettingsStore((state) => state.reduceAnimations);
  const [systemReduce, setSystemReduce] = useState(prefersReducedMotionOnWeb);
  const reduce = reduceSetting || systemReduce;
  const [introDone, setIntroDone] = useState(false);

  const [{ appear, form, columnsOpacity, flash, logo, veil }] = useState(() => ({
    appear: COLUMNS.map(() => new Animated.Value(0)),
    form: new Animated.Value(0),
    columnsOpacity: new Animated.Value(1),
    flash: new Animated.Value(0),
    logo: new Animated.Value(0),
    veil: new Animated.Value(1),
  }));

  useEffect(() => {
    void SplashScreen.hideAsync();
    if (Platform.OS !== 'web') {
      void AccessibilityInfo.isReduceMotionEnabled?.().then(setSystemReduce);
    }
  }, []);

  useEffect(() => {
    const timing = (value: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.cubic)) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: NATIVE_DRIVER });

    const animation = reduce
      ? timing(logo, 1, SPLASH_REDUCED_DURATION_MS)
      : Animated.sequence([
          Animated.stagger(
            150,
            appear.map((value) => timing(value, 1, 220, Easing.out(Easing.back(2)))),
          ),
          timing(form, 1, 380, Easing.inOut(Easing.cubic)),
          Animated.parallel([
            Animated.sequence([timing(flash, 1, 90, Easing.out(Easing.quad)), timing(flash, 0, 180, Easing.in(Easing.quad))]),
            timing(columnsOpacity, 0, 90),
            Animated.sequence([Animated.delay(60), timing(logo, 1, 380)]),
          ]),
        ]);
    animation.start();
    const timer = setTimeout(() => setIntroDone(true), reduce ? SPLASH_REDUCED_DURATION_MS : SPLASH_DURATION_MS);
    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [appear, columnsOpacity, flash, form, logo, reduce]);

  useEffect(() => {
    if (!canLeaveSplash({ introDone, bootReady })) {
      return;
    }
    const fade = reduce ? 120 : 220;
    Animated.timing(veil, { toValue: 0, duration: fade, useNativeDriver: NATIVE_DRIVER }).start();
    const timer = setTimeout(onFinished, fade + 16);
    return () => clearTimeout(timer);
  }, [bootReady, introDone, onFinished, reduce, veil]);

  const logoScale = logo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const textShift = logo.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <Animated.View
      testID="splash-intro"
      accessibilityRole="progressbar"
      accessibilityLabel={`Abrindo ${APP_NAME}`}
      style={{ flex: 1, opacity: veil, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: colors.background }}
    >
      <View style={{ width: LOGO_SIZE, height: LOGO_SIZE }}>
        {reduce
          ? null
          : COLUMNS.map((column, index) => {
              const stretch = column.height / COLUMN_WIDTH;
              const scaleY = form.interpolate({ inputRange: [0, 1], outputRange: [1, stretch] });
              const translateY = form.interpolate({ inputRange: [0, 1], outputRange: [column.rise * column.height * UNIT, 0] });
              return (
                <Animated.View
                  key={column.cx}
                  style={{
                    position: 'absolute',
                    left: column.cx * UNIT - DOT / 2,
                    top: OFFSET_Y + column.cy * UNIT - DOT / 2,
                    width: DOT,
                    height: DOT,
                    borderRadius: DOT / 2,
                    backgroundColor: BRAND_BLUE,
                    opacity: Animated.multiply(appear[index], columnsOpacity),
                    transform: [{ translateY }, { scale: appear[index] }, { scaleY }],
                  }}
                />
              );
            })}
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, opacity: logo, transform: [{ scale: logoScale }] }}>
          <TrevilleLogo size={LOGO_SIZE} color={BRAND_BLUE} />
        </Animated.View>
      </View>
      <Animated.Text style={[{ color: colors.primary, fontSize: 28, marginTop: 16, textAlign: 'center', opacity: logo, transform: [{ translateY: textShift }] }, inter('bold')]}>
        {APP_NAME}
      </Animated.Text>
      <Animated.Text style={[{ color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center', opacity: logo }, inter('regular')]}>{APP_TAGLINE}</Animated.Text>
      {introDone && !bootReady ? <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} style={{ marginTop: 28 }} /> : <View style={{ height: 48 }} />}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#FFFFFF', opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, scheme === 'dark' ? 0.35 : 0.9] }) }}
      />
    </Animated.View>
  );
}
