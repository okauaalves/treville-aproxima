import 'react-native-gesture-handler';
import '../global.css';

import { useEffect, useRef, useState } from 'react';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

import { AnimatedSplash } from '@/components/brand/AnimatedSplash';
import { Toast } from '@/components/ui/Toast';
import { initDatabase } from '@/core/offline/database';
import { nfcManager } from '@/core/nfc/NfcManager';
import { startAutoSync, syncIfOnline } from '@/core/offline/syncEngine';
import { restoreLocalSession } from '@/lib/authActions';
import { readOnboardingDone } from '@/lib/bootRoute';
import { bindAuthRefresh, getCurrentSession, isSupabaseConfigured, onAuthStateChange } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useBootStore } from '@/stores/bootStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { AppThemeProvider, useTheme } from '@/theme/ThemeContext';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 0,
  fade: false,
});

function RootNavigator() {
  const { navigationTheme, scheme, colors } = useTheme();
  const user = useAuthStore((state) => state.user);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="auth/reset-password" options={{ animation: 'fade' }} />
        <Stack.Screen name="terms" />
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan/index" />
          <Stack.Screen name="read/index" />
          <Stack.Screen name="write/index" />
          <Stack.Screen name="write/choose" />
          <Stack.Screen name="write/configure" />
          <Stack.Screen name="write/progress" />
          <Stack.Screen name="nfc-unavailable" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="account" />
          <Stack.Screen name="licenses" />
          <Stack.Screen name="diagnostics/index" />
          <Stack.Screen name="tag-details/[id]" />
          <Stack.Screen name="tag-details/technical" />
          <Stack.Screen name="automation/index" />
          <Stack.Screen name="template/[id]" />
          <Stack.Screen name="plaquinha/qr/[id]" />
          <Stack.Screen name="plaquinha/stats/[id]" />
          <Stack.Screen name="perfil/editar" />
          <Stack.Screen name="perfil/links/[plaquinhaId]" />
          <Stack.Screen name="(admin)" />
        </Stack.Protected>
      </Stack>
      <Toast />
    </ThemeProvider>
  );
}

function BootShell() {
  const [booting, setBooting] = useState(true);
  const [showApp, setShowApp] = useState(false);
  const unsub = useRef<() => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await initDatabase();
      await nfcManager.initialize();
      await useSettingsStore.getState().loadFromDatabase();
      const seen = await readOnboardingDone(AsyncStorage);
      useBootStore.getState().setOnboardingSeen(seen);
      if (isSupabaseConfigured) {
        const session = await getCurrentSession();
        useAuthStore.getState().setUser(session?.user ?? null);
        const subscription = onAuthStateChange((next) => {
          useAuthStore.getState().setUser(next);
          if (next) {
            void syncIfOnline();
          }
        });
        const refresh = bindAuthRefresh();
        const stopSync = startAutoSync();
        void syncIfOnline();
        unsub.current = () => {
          subscription.unsubscribe();
          refresh();
          stopSync();
        };
      } else {
        const local = await restoreLocalSession();
        useAuthStore.getState().setUser(local);
      }
      if (alive) {
        setBooting(false);
      }
    })();
    return () => {
      alive = false;
      unsub.current();
    };
  }, []);

  if (!showApp) {
    return <AnimatedSplash bootReady={!booting} onFinished={() => setShowApp(true)} />;
  }
  return <RootNavigator />;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!loaded) {
    return null;
  }

  return (
    <AppThemeProvider>
      <BootShell />
    </AppThemeProvider>
  );
}
