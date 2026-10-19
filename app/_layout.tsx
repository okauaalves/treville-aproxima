import 'react-native-gesture-handler';
import '../global.css';

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
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
import { validateConfig } from '@/constants/config';
import { initDatabase, pruneOldOperations } from '@/core/offline/database';
import { nfcManager } from '@/core/nfc/NfcManager';
import { REMOTE_SYNC_ENABLED, startAutoSync, syncIfOnline } from '@/core/offline/syncEngine';
import { decideGate } from '@/lib/access';
import { isFallbackAdminEmail } from '@/lib/adminCheck';
import { restoreLocalSession } from '@/lib/authActions';
import { readOnboardingDone } from '@/lib/bootRoute';
import { bindAuthRefresh, getCurrentSession, isSupabaseConfigured, onAuthStateChange } from '@/lib/supabase';
import { useAccessStore } from '@/stores/accessStore';
import { useAuthStore } from '@/stores/authStore';
import { useBootStore } from '@/stores/bootStore';
import { useQrColorStore } from '@/stores/qrColorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { AppThemeProvider, useTheme } from '@/theme/ThemeContext';
import { logger } from '@/utils/logger';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 0,
  fade: false,
});

function RootNavigator() {
  const { navigationTheme, scheme, colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const userId = user?.id ?? null;
  const accessStatus = useAccessStore((state) => (state.userId === userId ? state.status : null));
  const gate = decideGate({ configured: isSupabaseConfigured, hasUser: !!user, status: accessStatus, knownAdmin: isFallbackAdminEmail(user?.email) });

  // Reavalia o acesso na troca de usuário e ao voltar ao primeiro plano (aprovado/bloqueado pelo admin).
  useEffect(() => {
    const known = useAccessStore.getState();
    if (known.userId !== userId || known.status === null) {
      void known.refresh(userId);
    }
    void useQrColorStore.getState().loadForUser(userId);
    if (!userId || !isSupabaseConfigured) {
      return;
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void useAccessStore.getState().refresh(userId);
      }
    });
    return () => sub.remove();
  }, [userId]);

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
        <Stack.Protected guard={gate === 'signed_out'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={gate === 'waiting'}>
          <Stack.Screen name="waiting-approval" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={gate === 'denied'}>
          <Stack.Screen name="access-denied" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={gate === 'app'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan/index" />
          <Stack.Screen name="scan-qr" />
          <Stack.Screen name="read/index" />
          <Stack.Screen name="write/index" />
          <Stack.Screen name="write/choose" />
          <Stack.Screen name="write/configure" />
          <Stack.Screen name="write/progress" />
          <Stack.Screen name="nfc-unavailable" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="account" />
          <Stack.Screen name="licenses" />
          <Stack.Screen name="diagnostics/index" />
          <Stack.Screen name="tag-result/index" options={{ animation: 'fade_from_bottom', contentStyle: { backgroundColor: '#081128' } }} />
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
      validateConfig();
      await initDatabase();
      // Com o envio ao Supabase desligado, `synced` nunca vira 1: proteger "não enviadas" travaria a limpeza.
      await pruneOldOperations({ keepUnsynced: REMOTE_SYNC_ENABLED }).catch((error: unknown) => logger.warn('Falha ao limpar o histórico', error));
      await nfcManager.initialize();
      await useSettingsStore.getState().loadFromDatabase();
      const seen = await readOnboardingDone(AsyncStorage);
      useBootStore.getState().setOnboardingSeen(seen);
      if (isSupabaseConfigured) {
        const session = await getCurrentSession();
        // O splash cobre a primeira checagem de acesso: a tela certa já abre sem piscar.
        await useAccessStore.getState().refresh(session?.user?.id ?? null);
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
