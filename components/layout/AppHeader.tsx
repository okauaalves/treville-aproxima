import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/IconButton';
import { replace } from '@/lib/navigation';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export function AppHeader({ title, back, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const { colors, fs } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 8, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
      {back ? (
        <IconButton accessibilityLabel="Voltar" onPress={() => (router.canGoBack() ? router.back() : replace('/(tabs)'))}>
          <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={2} />
        </IconButton>
      ) : (
        <View style={{ width: 12 }} />
      )}
      <Text style={[{ color: colors.textPrimary, fontSize: fs(18), flex: 1 }, inter('bold')]}>{title}</Text>
      {right}
    </View>
  );
}
