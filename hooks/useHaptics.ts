import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/stores/settingsStore';

/** No web, navigator.vibrate antes de um toque real do usuário é bloqueado e gera erro no console. */
function canVibrate(): boolean {
  if (Platform.OS !== 'web') {
    return true;
  }
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }) : undefined;
  return Boolean(nav?.userActivation?.hasBeenActive);
}

export function useHaptics() {
  const enabled = useSettingsStore((state) => state.vibrationEnabled);
  return {
    impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
      if (!enabled || !canVibrate()) {
        return;
      }
      void Haptics.impactAsync(style).catch(() => undefined);
    },
    notify(type: Haptics.NotificationFeedbackType) {
      if (!enabled || !canVibrate()) {
        return;
      }
      void Haptics.notificationAsync(type).catch(() => undefined);
    },
  };
}
