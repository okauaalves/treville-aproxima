import { useState } from 'react';
import { Text, View } from 'react-native';
import { LayoutGrid, Nfc, SmartphoneNfc } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { setSetting } from '@/core/offline/database';
import { replace } from '@/lib/navigation';
import { useAuthStore } from '@/stores/authStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

const STEPS = [
  { title: 'Leia tags NFC', text: 'Aproxime o celular e veja o que a tag contém.', icon: Nfc },
  { title: 'Grave conteúdos', text: 'WhatsApp, cartão, Wi-Fi, link e outros formatos.', icon: SmartphoneNfc },
  { title: 'Gerencie seus templates e histórico', text: 'Tudo fica salvo neste aparelho.', icon: LayoutGrid },
];

export default function OnboardingScreen() {
  const { colors, fs } = useTheme();
  const [index, setIndex] = useState(0);
  const step = STEPS[index] ?? STEPS[0];
  const Icon = step.icon;
  const last = index === STEPS.length - 1;

  async function finish() {
    await setSetting('onboardingSeen', 'true');
    replace(useAuthStore.getState().user ? '/(tabs)' : '/(auth)/login');
  }

  return (
    <Screen>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#F4F8FF', alignItems: 'center', justifyContent: 'center' }}>
          <Icon color={colors.primary} size={32} />
        </View>
        <Text style={[{ color: colors.textPrimary, fontSize: fs(28) }, inter('extrabold')]}>{step.title}</Text>
        <Text style={[{ color: colors.textSecondary, fontSize: fs(16) }, inter('regular')]}>{step.text}</Text>
        <Text style={[{ color: colors.textMuted }, inter('medium')]}>{index + 1} de {STEPS.length}</Text>
      </View>
      <View style={{ padding: 24, gap: 8 }}>
        <PrimaryButton label={last ? 'Começar' : 'Continuar'} onPress={() => (last ? void finish() : setIndex((value) => value + 1))} />
        {last ? null : <PrimaryButton label="Pular" variant="secondary" onPress={() => void finish()} />}
      </View>
    </Screen>
  );
}
