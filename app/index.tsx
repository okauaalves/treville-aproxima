import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Nfc } from 'lucide-react-native';
import { Redirect, type Href } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { getAllSettings, initDatabase } from '@/core/offline/database';
import { restoreLocalSession } from '@/lib/authActions';
import { getCurrentUser, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export default function Index() {
  const { colors, fs } = useTheme();
  const [href, setHref] = useState<'/onboarding' | '/(tabs)' | '/(auth)/login' | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await initDatabase();
      const settings = await getAllSettings();
      const remote = isSupabaseConfigured ? await getCurrentUser() : null;
      const local = remote ? null : await restoreLocalSession();
      const user = remote
        ? { id: remote.id, email: remote.email, user_metadata: remote.user_metadata }
        : local;
      if (user) {
        useAuthStore.getState().setUser(user);
      }
      if (!alive) {
        return;
      }
      if (settings.onboardingSeen !== 'true') {
        setHref('/onboarding');
        return;
      }
      setHref(user ? '/(tabs)' : '/(auth)/login');
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!href) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Nfc color={colors.primary} size={42} />
          <Text style={[{ color: colors.textPrimary, fontSize: fs(28) }, inter('extrabold')]}>
            Tags do <Text style={{ color: colors.primary }}>Luiz</Text>
          </Text>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return <Redirect href={href as Href} />;
}
