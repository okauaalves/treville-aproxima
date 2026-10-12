import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { SafeScreen } from '@/components/layout/SafeScreen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Input } from '@/components/ui/Input';
import { requestPasswordReset } from '@/lib/authActions';
import { replace } from '@/lib/navigation';
import { useToastStore } from '@/stores/toastStore';
import { useTheme } from '@/theme/ThemeContext';

export default function ForgotScreen() {
  const { colors, fs } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  return (
    <Screen>
      <SafeScreen bottom={24}>
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: colors.textPrimary, fontSize: fs(28), fontWeight: '700' }}>Recuperar senha</Text>
          <Text style={{ color: colors.textSecondary, marginVertical: 12 }}>Enviaremos um link se a conta online existir.</Text>
          <Input label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <PrimaryButton label="Enviar link" loading={loading} fullWidth onPress={() => {
            setLoading(true);
            void requestPasswordReset(email).then(() => useToastStore.getState().show('Se o e-mail existir, o link foi enviado.', 'success')).catch((error: unknown) => useToastStore.getState().show(error instanceof Error ? error.message : 'Falha ao enviar', 'error')).finally(() => setLoading(false));
          }} />
          <PrimaryButton label="Voltar" variant="ghost" onPress={() => replace('/(auth)/login')} />
        </ScrollView>
      </SafeScreen>
    </Screen>
  );
}
