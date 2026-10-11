import { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeContext';

const TRACK_W = 52;
const THUMB = 28;
const TRAVEL = TRACK_W - THUMB - 4;

/**
 * Goo sem BlurView: o thumb estica no meio da viagem (scaleX) e a sombra
 * aumenta. Um halo translúcido substitui o blur, que pesaria em listas no Android.
 */
export function Toggle({ value, onValueChange, accessibilityLabel }: { value: boolean; onValueChange: (value: boolean) => void; accessibilityLabel: string }) {
  const { colors, reduceAnimations } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);
  const pressed = useSharedValue(0);

  useEffect(() => {
    progress.value = reduceAnimations
      ? withTiming(value ? 1 : 0, { duration: 120 })
      : withSpring(value ? 1 : 0, { damping: 15, stiffness: 120 });
  }, [progress, reduceAnimations, value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#D1D1D6', colors.primary]),
  }));

  const thumbStyle = useAnimatedStyle(() => {
    const stretch = reduceAnimations ? 0 : 4 * progress.value * (1 - progress.value);
    const pressX = 1 + pressed.value * 0.2;
    const pressY = 1 - pressed.value * 0.1;
    return {
      transform: [
        { translateX: interpolate(progress.value, [0, 1], [2, 2 + TRAVEL]) },
        { scaleX: (1 + stretch * 0.45) * pressX },
        { scaleY: (1 - stretch * 0.12) * pressY },
      ],
    };
  });

  const haloStyle = useAnimatedStyle(() => {
    const stretch = reduceAnimations ? 0 : 4 * progress.value * (1 - progress.value);
    return {
      opacity: stretch * 0.55,
      transform: [{ translateX: interpolate(progress.value, [0, 1], [2, 2 + TRAVEL]) }, { scale: 1.35 + stretch * 0.2 }],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const stretch = reduceAnimations ? 0 : 4 * progress.value * (1 - progress.value);
    const radius = 4 + stretch * 10;
    return Platform.OS === 'web'
      ? { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 2px ${radius}px rgba(0,0,0,0.2)` }
      : { shadowRadius: radius, shadowOpacity: 0.2 + stretch * 0.15, shadowOffset: { width: 0, height: 2 }, shadowColor: '#000', elevation: 4 };
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      onPressIn={() => {
        pressed.value = reduceAnimations ? withTiming(1, { duration: 80 }) : withSpring(1, { damping: 15, stiffness: 180 });
      }}
      onPressOut={() => {
        pressed.value = reduceAnimations ? withTiming(0, { duration: 80 }) : withSpring(0, { damping: 8, stiffness: 120 });
      }}
      hitSlop={8}
    >
      <Animated.View style={[{ width: TRACK_W, height: 32, borderRadius: 16, justifyContent: 'center' }, trackStyle]}>
        <Animated.View
          style={[
            { pointerEvents: 'none', position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.primary },
            haloStyle,
          ]}
        />
        <Animated.View
          style={[
            {
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.08)',
              overflow: 'hidden',
            },
            thumbStyle,
            shadowStyle,
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12 }}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', backgroundColor: selected ? colors.primary : colors.surface, borderWidth: 1, borderColor: selected ? colors.primary : colors.border }}>
            <Text style={{ color: selected ? colors.onPrimary : colors.textSecondary, fontSize: fs(13), fontWeight: '600' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
