import { Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { useTheme } from '@/theme/ThemeContext';

export function RoutePlaceholder({ title }: { title: string }) {
  const { colors, fs } = useTheme();
  return (
    <Screen>
      <AppHeader title={title} back />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.textSecondary, fontSize: fs(15), textAlign: 'center' }}>{title}</Text>
      </View>
    </Screen>
  );
}
