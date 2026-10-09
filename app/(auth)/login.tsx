import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';

import { GoogleMark } from '@/components/brand/GoogleMark';
import { TrevilleLogo } from '@/components/brand/TrevilleLogo';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Input } from '@/components/ui/Input';
import { APP_TAGLINE } from '@/constants/config';
import { inter } from '@/theme/fonts';
import { signInAccount, signInGoogleAccount } from '@/lib/authActions';
import { push, replace } from '@/lib/navigation';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { useTheme } from '@/theme/ThemeContext';
import { validateLogin } from '@/lib/authForm';

export default function LoginScreen() {
  const { colors, fs } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    const invalid = validateLogin(email, password);
    if (invalid) {
      setError(invalid);
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
          {!isSupabaseConfigured ? <Text style={[{ color: colors.textMuted, textAlign: 'center', marginBottom: 12, fontSize: fs(13) }, inter('medium')]}>Modo local — preencha o .env com a URL e a anon key do Supabase para entrar de verdade. A senha não fica salva neste aparelho.</Text> : null}
          <View style={{ alignItems: 'center' }}>
            <TrevilleLogo size={120} />
            <Text style={[{ color: colors.primary, fontSize: fs(28), marginTop: 12 }, inter('bold')]}>Tréville</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginTop: 4 }, inter('regular')]}>{APP_TAGLINE}</Text>
          </View>
          <Card style={{ marginTop: 24 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(22), marginBottom: 16 }, inter('bold')]}>Entrar</Text>
            <Input label="E-mail" value={email} onChangeText={(value) => { setEmail(value); setError(''); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="seu@email.com" leftIcon={<Mail color={colors.textSecondary} size={18} />} />
            <Input label="Senha" value={password} onChangeText={(value) => { setPassword(value); setError(''); }} secureTextEntry={!show} placeholder="Senha" leftIcon={<Lock color={colors.textSecondary} size={18} />} rightIcon={<Pressable accessibilityRole="button" accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setShow((value) => !value)}>{show ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}</Pressable>} />
            {error ? <Text accessibilityRole="alert" style={[{ color: colors.error, marginBottom: 12 }, inter('medium')]}>{error}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Esqueci minha senha" onPress={() => push('/(auth)/forgot')} style={{ alignSelf: 'flex-end', marginBottom: 16 }}>
              <Text style={[{ color: colors.primary, fontSize: fs(13) }, inter('semibold')]}>Esqueci minha senha</Text>
            </Pressable>
            <PrimaryButton label="Entrar" fullWidth loading={loading} onPress={() => void submit()} />
            <PrimaryButton label="Continuar com Google" variant="secondary" icon={<GoogleMark />} fullWidth style={{ marginTop: 12 }} onPress={() => void signInGoogleAccount().then((user) => { if (user) { useAuthStore.getState().setUser(user); replace('/(tabs)'); } }).catch((caught: unknown) => { const message = caught instanceof Error ? caught.message : 'Google indisponível'; setError(message); useToastStore.getState().show(message, 'error'); })} />
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
