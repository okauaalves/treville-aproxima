import { useEffect } from 'react';
import { Text, View } from 'react-native';
import * as Linking from 'expo-linking';

import { createSessionFromUrl } from '@/lib/supabase';
import { replace } from '@/lib/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/ThemeContext';

export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  useEffect(() => {
    void (async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        const session = await createSessionFromUrl(url);
        if (session?.user) {
          useAuthStore.getState().setUser(session.user);
          replace('/(tabs)');
          return;
        }
      }
      replace('/(auth)/login');
    })();
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.textSecondary }}>Conectando...</Text>
    </View>
  );
}
