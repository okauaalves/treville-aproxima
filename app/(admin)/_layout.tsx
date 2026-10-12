import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useTheme } from '@/theme/ThemeContext';

export default function AdminLayout() {
  const { colors } = useTheme();
  const { isAdmin, loading } = useIsAdmin();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Verificando permissão" />
      </View>
    );
  }
  if (!isAdmin) {
    return <Redirect href="/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
