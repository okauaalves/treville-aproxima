import { Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/ThemeContext';

export default function AccountScreen() {
  const { colors, fs } = useTheme();
  const user = useAuthStore((state) => state.user);
  return (
    <Screen>
      <AppHeader title="Conta" back />
      <View style={{ padding: 16 }}>
        <Text style={{ color: colors.textPrimary, fontSize: fs(18), fontWeight: '700' }}>{user?.email}</Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Os dados da conta ficam neste aparelho quando o Supabase não está configurado.</Text>
      </View>
    </Screen>
  );
}
