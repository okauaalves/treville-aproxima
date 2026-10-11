import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import { useToastStore } from '@/stores/toastStore';

export function Toast() {
  const { colors, fs, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const message = useToastStore((state) => state.message);
  const variant = useToastStore((state) => state.variant);
  const hide = useToastStore((state) => state.hide);
  const translate = useSharedValue(-80);
  useEffect(() => {
    translate.value = withTiming(message ? 0 : -80, { duration: reduceAnimations ? 150 : 350 });
    if (!message) {
      return;
    }
    const timer = setTimeout(hide, 3200);
    return () => clearTimeout(timer);
  }, [hide, message, reduceAnimations, translate]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translate.value }] }));
  if (!message) {
    return null;
  }
  const background = variant === 'error' ? colors.error : variant === 'success' ? colors.success : variant === 'warning' ? colors.warning : colors.primary;
  return (
    <Animated.View style={[{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 50 }, style]}>
      <Pressable accessibilityRole="button" accessibilityLabel={message} onPress={hide} style={{ backgroundColor: background, borderRadius: 16, padding: 14 }}>
        <Text style={[{ color: variant === 'warning' ? '#0F172A' : variant === 'error' ? colors.onDanger : variant === 'success' ? colors.onSuccess : colors.onPrimary, fontSize: fs(14) }, inter('semibold')]}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

export const ToastHost = Toast;
