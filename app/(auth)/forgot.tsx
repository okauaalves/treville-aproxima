import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { CircleCheck, Info, Mail, MailQuestionMark } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { requestPasswordReset } from '@/lib/authActions';
import { resendCooldown } from '@/lib/authForm';
import { replace } from '@/lib/navigation';
import { isSupabaseConfigured } from '@/lib/supabase';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import { isValidEmail } from '@/utils/validators';

export default function ForgotScreen() {
  const { colors, fs } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wait = resendCooldown(sentAt, now);

  useEffect(() => {
    if (sentAt === null) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sentAt]);

  async function send() {
    if (!isValidEmail(email.trim())) {
      setError('Informe um e-mail válido.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await requestPasswordReset(email);
      const stamp = Date.now();
      setSentAt(stamp);
      setNow(stamp);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const label = sentAt === null ? 'Enviar link de recuperação' : wait > 0 ? `Reenviar em ${wait}s` : 'Reenviar link';

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <MailQuestionMark color={colors.primary} size={32} />
            </View>
            <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(26), marginTop: 16, textAlign: 'center' }, inter('extrabold')]}>Recuperar senha</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(15), marginTop: 6, textAlign: 'center' }, inter('regular')]}>Informe o e-mail da sua conta. Enviaremos um link para definir uma nova senha.</Text>
          </View>
          <Card>
            {!isSupabaseConfigured ? (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <Info color={colors.warning} size={20} />
                <Text style={[{ flex: 1, color: colors.textSecondary, fontSize: fs(14) }, inter('medium')]}>Modo local: as contas criadas neste aparelho não têm senha online, então não há link para enviar. Configure o Supabase para usar contas online.</Text>
              </View>
            ) : null}
            <Input
              label="E-mail"
              value={email}
              onChangeText={(value) => { setEmail(value); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="seu@email.com"
              editable={isSupabaseConfigured}
              error={error || undefined}
              leftIcon={<Mail color={colors.textSecondary} size={18} />}
              onSubmitEditing={() => void send()}
            />
            {sentAt !== null ? (
              <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.successBg, marginBottom: 14 }}>
                <CircleCheck color={colors.success} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>Link enviado para seu e-mail</Text>
                  <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginTop: 2 }, inter('regular')]}>Abra o link neste aparelho. Se não chegar em alguns minutos, confira o spam.</Text>
                </View>
              </View>
            ) : null}
            <PrimaryButton label={label} fullWidth loading={loading} disabled={!isSupabaseConfigured || wait > 0} onPress={() => void send()} />
            <PrimaryButton label="Voltar ao login" variant="ghost" fullWidth style={{ marginTop: 8 }} onPress={() => replace('/(auth)/login')} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
