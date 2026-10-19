import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { CircleAlert } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { classifyAuthCallback, parseAuthCallback } from '@/lib/authCallback';
import { replace } from '@/lib/navigation';
import { consumeRecoveryEvent, getCurrentSession, handleAuthCallbackUrl, isSupabaseConfigured, translateAuthError } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

const CALLBACK_TIMEOUT_MS = 15_000;

function webUrl(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.href;
  }
  return null;
}

/** Destino de treville://auth/callback (nativo, inclusive a frio) e de <origem>/auth/callback (web). */
export default function AuthCallbackScreen() {
  const { colors, fs } = useTheme();
  const linkingUrl = Linking.useLinkingURL();
  const url = webUrl() ?? linkingUrl;
  const handled = useRef<string | null>(null);
  const [failure, setError] = useState('');
  const error = isSupabaseConfigured ? failure : 'Modo local: o login online não está configurado neste app.';

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        setError('Tempo esgotado ao conectar. Tente entrar de novo.');
      }
    }, CALLBACK_TIMEOUT_MS);

    // Sem URL ainda (deep link a frio): espera o Linking — não marca handled nem redireciona.
    if (!url) {
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    if (handled.current === url) {
      clearTimeout(timer);
      return () => {
        cancelled = true;
      };
    }
    handled.current = url;

    void (async () => {
      try {
        const params = parseAuthCallback(url);
        if (classifyAuthCallback(params) === 'empty') {
          const session = await getCurrentSession();
          if (cancelled) {
            return;
          }
          replace(session ? '/(tabs)' : '/(auth)/login');
          return;
        }
        const result = await handleAuthCallbackUrl(url);
        if (cancelled) {
          return;
        }
        if (!result.session?.user) {
          setError('Não foi possível concluir o acesso.');
          return;
        }
        useAuthStore.getState().setUser(result.session.user);
        const recovery = consumeRecoveryEvent() || result.recovery;
        replace(result.invite ? '/auth/reset-password?mode=invite' : recovery ? '/auth/reset-password' : '/(tabs)');
      } catch (caught) {
        const session = await getCurrentSession().catch(() => null);
        if (cancelled) {
          return;
        }
        if (session?.user) {
          useAuthStore.getState().setUser(session.user);
          replace(consumeRecoveryEvent() ? '/auth/reset-password' : '/(tabs)');
          return;
        }
        setError(translateAuthError(caught));
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {error ? (
          <Card style={{ width: '100%' }}>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <CircleAlert color={colors.error} size={40} />
              <Text accessibilityRole="alert" style={[{ color: colors.textPrimary, fontSize: fs(17), textAlign: 'center' }, inter('semibold')]}>{error}</Text>
              <PrimaryButton label="Ir para o login" fullWidth onPress={() => replace('/(auth)/login')} />
            </View>
          </Card>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={[{ color: colors.textSecondary, fontSize: fs(15), marginTop: 12 }, inter('medium')]}>Conectando...</Text>
          </>
        )}
      </View>
    </Screen>
  );
}
