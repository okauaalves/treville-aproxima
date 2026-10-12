import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { CircleAlert, Eye, EyeOff, KeyRound, Lock } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { setNewPassword } from '@/lib/authActions';
import { validateNewPassword } from '@/lib/authForm';
import { replace } from '@/lib/navigation';
import { getCurrentSession, isSupabaseConfigured } from '@/lib/supabase';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

type Status = 'checking' | 'ready' | 'expired' | 'local';

export default function ResetPasswordScreen() {
  const { colors, fs } = useTheme();
  const [status, setStatus] = useState<Status>(isSupabaseConfigured ? 'checking' : 'local');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }
    void getCurrentSession()
      .then((session) => setStatus(session?.user ? 'ready' : 'expired'))
      .catch(() => setStatus('expired'));
  }, []);

  async function save() {
    const invalid = validateNewPassword(password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await setNewPassword(password);
      useToastStore.getState().show('Senha atualizada.', 'success');
      replace('/(tabs)');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a senha.');
    } finally {
      setSaving(false);
    }
  }

  const eye = (
    <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setShow((value) => !value)} hitSlop={8}>
      {show ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}
    </Pressable>
  );

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound color={colors.primary} size={32} />
            </View>
            <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(26), marginTop: 16, textAlign: 'center' }, inter('extrabold')]}>Definir nova senha</Text>
          </View>
          {status === 'checking' ? <ActivityIndicator color={colors.primary} /> : null}
          {status === 'local' || status === 'expired' ? (
            <Card>
              <View style={{ alignItems: 'center', gap: 12 }}>
                <CircleAlert color={colors.warning} size={32} />
                <Text style={[{ color: colors.textPrimary, fontSize: fs(16), textAlign: 'center' }, inter('semibold')]}>
                  {status === 'local'
                    ? 'Modo local: a troca de senha só existe para contas online (Supabase).'
                    : 'Este link expirou ou já foi usado. Peça um novo link de recuperação.'}
                </Text>
                {status === 'expired' ? <PrimaryButton label="Pedir novo link" fullWidth onPress={() => replace('/(auth)/forgot')} /> : null}
                <PrimaryButton label="Ir para o login" variant="ghost" fullWidth onPress={() => replace('/(auth)/login')} />
              </View>
            </Card>
          ) : null}
          {status === 'ready' ? (
            <Card>
              <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginBottom: 16 }, inter('regular')]}>Escolha uma senha com ao menos 6 caracteres. Ela substitui a anterior em todos os aparelhos.</Text>
              <Input label="Nova senha" value={password} onChangeText={(value) => { setPassword(value); setError(''); }} secureTextEntry={!show} autoComplete="new-password" textContentType="newPassword" placeholder="Nova senha" leftIcon={<Lock color={colors.textSecondary} size={18} />} rightIcon={eye} />
              <Input label="Confirmar senha" value={confirm} onChangeText={(value) => { setConfirm(value); setError(''); }} secureTextEntry={!show} autoComplete="new-password" textContentType="newPassword" placeholder="Repita a senha" leftIcon={<Lock color={colors.textSecondary} size={18} />} onSubmitEditing={() => void save()} />
              {error ? <Text accessibilityRole="alert" style={[{ color: colors.error, marginBottom: 12 }, inter('medium')]}>{error}</Text> : null}
              <PrimaryButton label="Salvar nova senha" fullWidth loading={saving} onPress={() => void save()} />
              <PrimaryButton label="Agora não" variant="ghost" fullWidth style={{ marginTop: 8 }} onPress={() => replace('/(tabs)')} />
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
