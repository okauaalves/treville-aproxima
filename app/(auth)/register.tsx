import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Input } from '@/components/ui/Input';
import { inter } from '@/theme/fonts';
import { signUpAccount } from '@/lib/authActions';
import { validateRegister } from '@/lib/authForm';
import { replace } from '@/lib/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { useTheme } from '@/theme/ThemeContext';

export default function RegisterScreen() {
  const { colors, fs } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const invalid = validateRegister(name, email, password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await signUpAccount(name, email, password);
      if (result.needsConfirmation || !result.user) {
        useToastStore.getState().show('Enviamos um link de confirmação para seu e-mail', 'info');
        replace('/(auth)/login');
        return;
      }
      useAuthStore.getState().setUser(result.user);
      replace('/(tabs)');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Não foi possível criar a conta.';
      setError(message);
      useToastStore.getState().show(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingVertical: 48 }} keyboardShouldPersistTaps="handled">
          <Text style={[{ color: colors.textPrimary, fontSize: fs(28), textAlign: 'center' }, inter('extrabold')]}>Criar conta</Text>
          <Card style={{ marginTop: 24 }}>
            <Input label="Nome completo" value={name} onChangeText={setName} />
            <Input label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry />
            <Input label="Confirmar senha" value={confirm} onChangeText={setConfirm} secureTextEntry error={confirm && confirm !== password ? 'As senhas não coincidem.' : undefined} />
            {error ? <Text accessibilityRole="alert" style={[{ color: colors.error, marginBottom: 12 }, inter('medium')]}>{error}</Text> : null}
            <PrimaryButton label="Criar conta" fullWidth loading={loading} onPress={() => void submit()} />
          </Card>
          <Pressable accessibilityRole="button" accessibilityLabel="Entrar" onPress={() => (router.canGoBack() ? router.back() : replace('/(auth)/login'))}>
            <Text style={{ textAlign: 'center', marginTop: 20, color: colors.textSecondary }}>Já tem conta? <Text style={{ color: colors.primary, fontWeight: '600' }}>Entrar</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
