import { FadeIn, FadeInDown, type EntryOrExitLayoutType } from 'react-native-reanimated';

export function listEntering(index: number, reduce: boolean) {
  if (reduce) {
    return FadeIn.duration(120);
  }
  return FadeInDown.delay(Math.min(index, 8) * 50).springify().damping(18).stiffness(160);
}

export function screenEntering(reduce: boolean): EntryOrExitLayoutType {
  if (reduce) {
    return FadeIn.duration(200);
  }
  return FadeInDown.springify().damping(18).stiffness(140);
}
