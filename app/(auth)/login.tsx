import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Eye, EyeOff, Lock, Mail, Nfc } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Input } from '@/components/ui/Input';
import { inter } from '@/theme/fonts';
import { signInAccount, signInGoogleAccount } from '@/lib/authActions';
import { push, replace } from '@/lib/navigation';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { useTheme } from '@/theme/ThemeContext';
import { isValidEmail } from '@/utils/validators';

export default function LoginScreen() {
  const { colors, fs } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const validEmail = isValidEmail(email);

  async function submit() {
    if (!validEmail || password.length < 6) {
      setError(password.length < 6 ? 'A senha precisa ter ao menos 6 caracteres.' : 'Informe um e-mail válido.');
      useToastStore.getState().show('Verifique e-mail e senha.', 'error');
      return;
    }
    setLoading(true);
    try {
      const user = await signInAccount(email, password);
      useAuthStore.getState().setUser(user);
      replace('/(tabs)');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Não foi possível entrar.';
      setError(message);
      useToastStore.getState().show(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 48, flexGrow: 1, justifyContent: 'center' }}>
          {!isSupabaseConfigured ? <Text style={[{ color: colors.textMuted, textAlign: 'center', marginBottom: 12, fontSize: fs(13) }, inter('medium')]}>Modo local — a senha não fica salva neste aparelho</Text> : null}
          <View style={{ alignItems: 'center' }}>
            <Nfc color={colors.primary} size={42} />
            <Text style={[{ color: colors.textPrimary, fontSize: fs(28), marginTop: 12 }, inter('extrabold')]}>
              Tags do <Text style={{ color: colors.primary }}>Luiz</Text>
            </Text>
          </View>
          <Card style={{ marginTop: 24 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(22), marginBottom: 16 }, inter('bold')]}>Entrar</Text>
            <Input label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="seu@email.com" error={error && !validEmail ? error : undefined} leftIcon={<Mail color={colors.textSecondary} size={18} />} />
            <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry={!show} placeholder="Senha" error={error && password.length < 6 ? error : undefined} leftIcon={<Lock color={colors.textSecondary} size={18} />} rightIcon={<Pressable accessibilityRole="button" accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setShow((value) => !value)}>{show ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}</Pressable>} />
            <Pressable accessibilityRole="button" accessibilityLabel="Esqueci minha senha" onPress={() => push('/(auth)/forgot')} style={{ alignSelf: 'flex-end', marginBottom: 16 }}>
              <Text style={[{ color: colors.primary, fontSize: fs(13) }, inter('semibold')]}>Esqueci minha senha</Text>
            </Pressable>
            <PrimaryButton label="Entrar" fullWidth loading={loading} onPress={() => void submit()} />
            <PrimaryButton label="Continuar com Google" variant="secondary" fullWidth style={{ marginTop: 12 }} onPress={() => void signInGoogleAccount().then((user) => { if (user) { useAuthStore.getState().setUser(user); replace('/(tabs)'); } }).catch((caught: unknown) => useToastStore.getState().show(caught instanceof Error ? caught.message : 'Google indisponível', 'error'))} />
          </Card>
          <Text style={[{ textAlign: 'center', marginTop: 20, color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>
            Não tem conta?{' '}
            <Text accessibilityRole="link" onPress={() => push('/(auth)/register')} style={[{ color: colors.primary }, inter('semibold')]}>Criar conta</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
