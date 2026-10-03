import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function SafeScreen({ children, bottom = 100 }: { children: ReactNode; bottom?: number }) {
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, bottom) }}>{children}</View>;
}
