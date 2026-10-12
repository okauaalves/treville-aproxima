import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Eye, EyeOff, Lock, Mail, MailCheck, User } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Input } from '@/components/ui/Input';
import { inter } from '@/theme/fonts';
import { signUpAccount } from '@/lib/authActions';
import { validateRegister } from '@/lib/authForm';
import { replace } from '@/lib/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/ThemeContext';

export default function RegisterScreen() {
  const { colors, fs } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const busy = useRef(false);

  function edit(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setError('');
    };
  }

  async function submit() {
    if (busy.current) {
      return;
    }
    const invalid = validateRegister(name, email, password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await signUpAccount(name, email, password);
      if (result.needsConfirmation || !result.user) {
        setPendingEmail(email.trim().toLowerCase());
        return;
      }
      useAuthStore.getState().setUser(result.user);
      replace('/(tabs)');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível criar a conta.');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  const goLogin = () => (router.canGoBack() ? router.back() : replace('/(auth)/login'));

  if (pendingEmail) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <Card>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
                <MailCheck color={colors.success} size={34} />
              </View>
              <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(22), textAlign: 'center' }, inter('extrabold')]}>Confirme seu e-mail</Text>
              <Text accessibilityLiveRegion="polite" style={[{ color: colors.textSecondary, fontSize: fs(15), textAlign: 'center', lineHeight: fs(22) }, inter('regular')]}>
                Enviamos um link de confirmação para <Text style={[{ color: colors.textPrimary }, inter('semibold')]}>{pendingEmail}</Text>. Abra o link neste aparelho e depois entre com sua senha.
              </Text>
              <PrimaryButton label="Voltar ao login" fullWidth onPress={() => replace('/(auth)/login')} />
            </View>
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 48 }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(28), textAlign: 'center' }, inter('extrabold')]}>Criar conta</Text>
          <Card style={{ marginTop: 24 }}>
            <Input label="Nome completo" value={name} onChangeText={edit(setName)} autoComplete="name" textContentType="name" placeholder="Seu nome" leftIcon={<User color={colors.textSecondary} size={18} />} />
            <Input label="E-mail" value={email} onChangeText={edit(setEmail)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="seu@email.com" leftIcon={<Mail color={colors.textSecondary} size={18} />} />
            <Input
              label="Senha"
              value={password}
              onChangeText={edit(setPassword)}
              secureTextEntry={!show}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="Ao menos 6 caracteres"
              leftIcon={<Lock color={colors.textSecondary} size={18} />}
              rightIcon={
                <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'} hitSlop={8} onPress={() => setShow((value) => !value)}>
                  {show ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}
                </Pressable>
              }
            />
            <Input
              label="Confirmar senha"
              value={confirm}
              onChangeText={edit(setConfirm)}
              secureTextEntry={!show}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="Repita a senha"
              leftIcon={<Lock color={colors.textSecondary} size={18} />}
              error={confirm && confirm !== password ? 'As senhas não coincidem.' : undefined}
              onSubmitEditing={() => void submit()}
            />
            {error ? <Text accessibilityRole="alert" style={[{ color: colors.error, marginBottom: 12 }, inter('medium')]}>{error}</Text> : null}
            <PrimaryButton label="Criar conta" fullWidth loading={loading} onPress={() => void submit()} />
          </Card>
          <Pressable accessibilityRole="button" accessibilityLabel="Já tem conta? Entrar" onPress={goLogin}>
            <Text style={[{ textAlign: 'center', marginTop: 20, color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>
              Já tem conta? <Text style={[{ color: colors.primary }, inter('semibold')]}>Entrar</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
