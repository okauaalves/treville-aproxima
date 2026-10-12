import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { Check, IdCard, Nfc, QrCode } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { markOnboardingDone } from '@/lib/bootRoute';
import { push, replace } from '@/lib/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useBootStore } from '@/stores/bootStore';
import { withAlpha } from '@/theme/colors';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

const SLIDES: { title: string; text: string; icon: LucideIcon; animated?: boolean }[] = [
  { title: 'Aproxime sua tag', text: 'Abra o app e aproxime qualquer tag NFC', icon: Nfc, animated: true },
  { title: 'QR Code dinâmico', text: 'Mude o destino quando quiser sem trocar a plaquinha', icon: QrCode },
  { title: 'Seu perfil digital', text: 'Crie uma mini página com todos seus links', icon: IdCard },
];

const LAST = SLIDES.length - 1;

function PulseRing({ size, color, delay, reduce }: { size: number; color: string; delay: number; reduce: boolean }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(progress);
  }, [delay, progress, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: reduce ? 0.35 : 0.55 * (1 - progress.value),
    transform: [{ scale: reduce ? 1.25 : 1 + progress.value * 0.7 }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color, pointerEvents: 'none' }, style]}
    />
  );
}

function Hero({ icon: Icon, animated, size }: { icon: LucideIcon; animated?: boolean; size: number }) {
  const { colors, reduceAnimations } = useTheme();
  return (
    <View style={{ width: size * 1.9, height: size * 1.9, alignItems: 'center', justifyContent: 'center' }}>
      {animated ? (
        <>
          <PulseRing size={size} color={colors.primary} delay={0} reduce={reduceAnimations} />
          {reduceAnimations ? null : <PulseRing size={size} color={colors.primary} delay={1100} reduce={false} />}
        </>
      ) : null}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: withAlpha(colors.primary, '1F'),
          borderWidth: 1,
          borderColor: colors.glassBorder,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={colors.primary} size={size * 0.5} strokeWidth={1.6} />
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const { colors, fs } = useTheme();
  const { isTabletUp, height } = useBreakpoint();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const heroSize = Math.round(Math.min(isTabletUp ? 200 : 150, height * 0.2));
  const last = index === LAST;

  useEffect(() => {
    if (width) {
      scroller.current?.scrollTo({ x: index * width, animated: false });
    }
    // Só realinha quando a largura muda (rotação, janela redimensionada).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) {
      return;
    }
    const next = Math.max(0, Math.min(LAST, Math.round(event.nativeEvent.contentOffset.x / width)));
    if (next !== index) {
      setIndex(next);
    }
  }

  function goTo(next: number) {
    setIndex(next);
    scroller.current?.scrollTo({ x: next * width, animated: true });
  }

  async function finish() {
    setFinishing(true);
    try {
      await markOnboardingDone(AsyncStorage);
    } finally {
      useBootStore.getState().setOnboardingSeen(true);
      const user = useAuthStore.getState().user;
      replace(user ? '/(tabs)' : '/(auth)/login');
    }
  }

  return (
    <Screen maxWidth={720}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12, minHeight: 56 }}>
        {last ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Pular apresentação" hitSlop={12} onPress={() => goTo(LAST)} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={[{ color: colors.primary, fontSize: fs(15) }, inter('semibold')]}>Pular</Text>
          </Pressable>
        )}
      </View>
      <View style={{ flex: 1 }} onLayout={onLayout}>
        {width > 0 ? (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={onScroll}
            style={{ flex: 1 }}
          >
            {SLIDES.map((slide, slideIndex) => (
              <View
                key={slide.title}
                accessibilityElementsHidden={slideIndex !== index}
                importantForAccessibility={slideIndex === index ? 'auto' : 'no-hide-descendants'}
                style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 20 }}
              >
                <Hero icon={slide.icon} animated={slide.animated} size={heroSize} />
                <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(isTabletUp ? 32 : 28), textAlign: 'center' }, inter('extrabold')]}>{slide.title}</Text>
                <Text style={[{ color: colors.textSecondary, fontSize: fs(isTabletUp ? 18 : 16), textAlign: 'center', lineHeight: fs(isTabletUp ? 26 : 23), maxWidth: 420 }, inter('regular')]}>{slide.text}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 28, gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <View accessibilityRole="adjustable" accessibilityLabel={`Página ${index + 1} de ${SLIDES.length}`} style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {SLIDES.map((slide, dot) => (
            <Pressable key={slide.title} accessibilityLabel={`Ir para a página ${dot + 1}`} hitSlop={8} onPress={() => goTo(dot)}>
              <View style={{ width: dot === index ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: dot === index ? colors.primary : colors.border }} />
            </Pressable>
          ))}
        </View>
        {last ? (
          <View style={{ gap: 8 }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              accessibilityLabel="Li e aceito os Termos de uso"
              onPress={() => setAccepted((value) => !value)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: accepted ? colors.primary : colors.textMuted,
                  backgroundColor: accepted ? colors.primary : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {accepted ? <Check color={colors.onPrimary} size={16} strokeWidth={3} /> : null}
              </View>
              <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(14) }, inter('medium')]}>
                Li e aceito os{' '}
                <Text accessibilityRole="link" onPress={() => push('/terms')} style={[{ color: colors.primary, textDecorationLine: 'underline' }, inter('semibold')]}>Termos de uso</Text>
              </Text>
            </Pressable>
            <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('regular')]}>Use o NFC só em tags suas ou com permissão do dono. Uma trava permanente não tem volta.</Text>
          </View>
        ) : null}
        <PrimaryButton
          key={last ? 'start' : 'next'}
          label={last ? 'Começar' : 'Próximo'}
          fullWidth
          loading={finishing}
          disabled={last && !accepted}
          onPress={() => (last ? void finish() : goTo(index + 1))}
        />
      </View>
    </Screen>
  );
}
