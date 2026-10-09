import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import * as Linking from 'expo-linking';

import { Screen } from '@/components/layout/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Input } from '@/components/ui/Input';
import { setNewPassword } from '@/lib/authActions';
import { parseAuthCallback } from '@/lib/authCallback';
import { createSessionFromUrl, translateAuthError } from '@/lib/supabase';
import { replace } from '@/lib/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { useTheme } from '@/theme/ThemeContext';

function currentUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.href;
  }
  return '';
}

export default function AuthCallbackScreen() {
  const { colors, fs } = useTheme();
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const url = currentUrl() || (await Linking.getInitialURL()) || '';
      try {
        if (url) {
          const session = await createSessionFromUrl(url);
          if (session?.user) {
            useAuthStore.getState().setUser(session.user);
            if (parseAuthCallback(url).type === 'recovery') {
              setRecovery(true);
              setLoading(false);
              return;
            }
            replace('/(tabs)');
            return;
          }
        }
      } catch (error) {
        useToastStore.getState().show(translateAuthError(error), 'error');
      }
      setLoading(false);
      if (!url) {
        replace('/(auth)/login');
      }
    })();
  }, []);

  async function save() {
    if (password.length < 6) {
      useToastStore.getState().show('A senha é fraca. Use ao menos 6 caracteres.', 'error');
      return;
    }
    setSaving(true);
    try {
      await setNewPassword(password);
      useToastStore.getState().show('Senha atualizada.', 'success');
      replace('/(tabs)');
    } catch (error) {
      useToastStore.getState().show(error instanceof Error ? error.message : 'Não foi possível salvar a senha.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textSecondary }}>Conectando...</Text>
        </View>
      </Screen>
    );
  }

  if (!recovery) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: colors.textSecondary, fontSize: fs(16) }}>Não foi possível concluir o acesso.</Text>
          <PrimaryButton label="Ir para o login" style={{ marginTop: 16 }} onPress={() => replace('/(auth)/login')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ padding: 24, gap: 12 }}>
        <Text style={{ color: colors.textPrimary, fontSize: fs(28), fontWeight: '800' }}>Nova senha</Text>
        <Input label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry />
        <PrimaryButton label="Salvar senha" fullWidth loading={saving} onPress={() => void save()} />
      </View>
    </Screen>
  );
}
