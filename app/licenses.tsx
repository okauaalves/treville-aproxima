import { Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { useTheme } from '@/theme/ThemeContext';

const LICENSES = ['Expo SDK 57', 'React Native', 'react-native-nfc-manager', 'Supabase', 'NativeWind', 'Zustand'];

export default function LicensesScreen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <AppHeader title="Licenças" back />
      <View style={{ padding: 16 }}>
        {LICENSES.map((item) => (
          <Text key={item} style={{ color: colors.textPrimary, marginBottom: 8 }}>{item}</Text>
        ))}
      </View>
    </Screen>
  );
}
