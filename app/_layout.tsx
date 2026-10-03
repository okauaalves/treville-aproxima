import 'react-native-gesture-handler';
import '../global.css';

import { useEffect } from 'react';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

import { Toast } from '@/components/ui/Toast';
import { initDatabase } from '@/core/offline/database';
import { nfcManager } from '@/core/nfc/NfcManager';
import { restoreLocalSession } from '@/lib/authActions';
import { getCurrentUser, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { AppThemeProvider, useTheme } from '@/theme/ThemeContext';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 400,
  fade: true,
});

function RootNavigator() {
  const { navigationTheme, scheme, colors } = useTheme();

  useEffect(() => {
    void (async () => {
      await initDatabase();
      await nfcManager.initialize();
      await useSettingsStore.getState().loadFromDatabase();
      const remote = isSupabaseConfigured ? await getCurrentUser() : null;
      const local = remote ? null : await restoreLocalSession();
      useAuthStore.getState().setUser(remote ?? local ?? null);
    })();
  }, []);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Toast />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AppThemeProvider>
      <RootNavigator />
    </AppThemeProvider>
  );
}
