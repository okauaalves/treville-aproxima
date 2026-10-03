import { Easing, withSpring, withTiming, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

export const motionEasing = Easing.bezier(0.16, 1, 0.3, 1);

export function buildSpringConfig(reduceAnimations: boolean): WithSpringConfig {
  return reduceAnimations
    ? { damping: 20, stiffness: 300, mass: 1 }
    : { damping: 15, stiffness: 100, mass: 1 };
}

export function buildTimingConfig(reduceAnimations: boolean): WithTimingConfig {
  return { duration: reduceAnimations ? 150 : 350, easing: motionEasing };
}

export function springOrTiming(
  toValue: number,
  reduceAnimations: boolean,
  springConfig: WithSpringConfig = buildSpringConfig(reduceAnimations),
  timingConfig: WithTimingConfig = buildTimingConfig(reduceAnimations),
): number {
  'worklet';
  if (reduceAnimations) {
    return withTiming(toValue, timingConfig);
  }
  return withSpring(toValue, springConfig);
}
