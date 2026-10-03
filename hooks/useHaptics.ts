import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/stores/settingsStore';

export function useHaptics() {
  const enabled = useSettingsStore((state) => state.vibrationEnabled);
  return {
    impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
      if (!enabled) {
        return;
      }
      void Haptics.impactAsync(style).catch(() => undefined);
    },
    notify(type: Haptics.NotificationFeedbackType) {
      if (!enabled) {
        return;
      }
      void Haptics.notificationAsync(type).catch(() => undefined);
    },
  };
}
