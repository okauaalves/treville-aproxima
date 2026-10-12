import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';

import { GoogleMark } from '@/components/brand/GoogleMark';
import { TrevilleLogo } from '@/components/brand/TrevilleLogo';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Input } from '@/components/ui/Input';
import { APP_NAME } from '@/constants/config';
import { inter } from '@/theme/fonts';
import { signInAccount, signInGoogleAccount } from '@/lib/authActions';
import { push, replace } from '@/lib/navigation';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/ThemeContext';
import { validateLogin } from '@/lib/authForm';

const LOGIN_SUBTITLE = 'NFC Manager da Tréville';
const GOOGLE_ERROR = 'Não foi possível conectar com o Google';

export default function LoginScreen() {
  const { colors, fs } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const busy = useRef(false);

  async function submit() {
    if (busy.current) {
      return;
    }
    const invalid = validateLogin(email, password);
    if (invalid) {
      setError(invalid);
      return;
    }
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      const user = await signInAccount(email, password);
      useAuthStore.getState().setUser(user);
      replace('/(tabs)');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function google() {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setGoogleLoading(true);
    setError('');
    try {
      const user = await signInGoogleAccount();
      if (user) {
        useAuthStore.getState().setUser(user);
        replace('/(tabs)');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GOOGLE_ERROR);
      // No web o Alert do react-native-web não faz nada; lá vale o erro inline.
      if (Platform.OS !== 'web') {
        Alert.alert('Erro', GOOGLE_ERROR);
      }
    } finally {
      busy.current = false;
      setGoogleLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 48, flexGrow: 1, justifyContent: 'center' }}>
          {!isSupabaseConfigured ? <Text style={[{ color: colors.textMuted, textAlign: 'center', marginBottom: 12, fontSize: fs(13) }, inter('medium')]}>Modo local — preencha o .env com a URL e a anon key do Supabase para entrar de verdade. A senha não fica salva neste aparelho.</Text> : null}
          <View style={{ alignItems: 'center' }}>
            <TrevilleLogo size={120} color={colors.primary} />
            <Text accessibilityRole="header" style={[{ color: colors.primary, fontSize: fs(28), marginTop: 12, textAlign: 'center' }, inter('bold')]}>{APP_NAME}</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginTop: 4 }, inter('regular')]}>{LOGIN_SUBTITLE}</Text>
          </View>
          <Card style={{ marginTop: 24 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(22), marginBottom: 16 }, inter('bold')]}>Entrar</Text>
            <Input label="E-mail" value={email} onChangeText={(value) => { setEmail(value); setError(''); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="seu@email.com" leftIcon={<Mail color={colors.textSecondary} size={18} />} />
            <Input label="Senha" value={password} onChangeText={(value) => { setPassword(value); setError(''); }} secureTextEntry={!show} placeholder="Senha" leftIcon={<Lock color={colors.textSecondary} size={18} />} rightIcon={<Pressable accessibilityRole="button" accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setShow((value) => !value)}>{show ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}</Pressable>} />
            {error ? <Text accessibilityRole="alert" style={[{ color: colors.error, marginBottom: 12 }, inter('medium')]}>{error}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Esqueci minha senha" onPress={() => push('/(auth)/forgot')} style={{ alignSelf: 'flex-end', marginBottom: 16 }}>
              <Text style={[{ color: colors.primary, fontSize: fs(13) }, inter('semibold')]}>Esqueci minha senha</Text>
            </Pressable>
            <PrimaryButton label="Entrar" fullWidth loading={loading} disabled={googleLoading} onPress={() => void submit()} />
            <PrimaryButton label="Continuar com o Google" variant="secondary" icon={<GoogleMark />} fullWidth loading={googleLoading} disabled={loading} style={{ marginTop: 12 }} onPress={() => void google()} />
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
