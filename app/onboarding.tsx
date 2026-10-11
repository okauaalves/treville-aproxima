import { ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Download, Hand, Nfc, ShieldAlert, Smartphone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ONBOARDING_KEY } from '@/lib/bootRoute';
import { replace } from '@/lib/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useBootStore } from '@/stores/bootStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

const STEPS: { title: string; text: string; icon: LucideIcon }[] = [
  {
    title: 'Como instalar este app',
    text: 'Se você recebeu um arquivo APK, abra-o e confirme a instalação. Na App Store ou na Play Store, o processo é o da loja.',
    icon: Download,
  },
  {
    title: 'Ative o NFC nas configurações do seu celular',
    text: 'Em Ajustes, procure NFC e deixe ligado. Sem isso o Tréville Aproxima não lê nem grava tags.',
    icon: Nfc,
  },
  {
    title: 'Permita instalar apps de fontes desconhecidas',
    text: 'Isso só é necessário para o APK fora da Play Store. Depois da instalação você pode desativar essa permissão.',
    icon: Smartphone,
  },
  {
    title: 'Aproxime tags NFC com cuidado',
    text: 'Encoste no ponto do NFC do celular e mantenha parado até o app confirmar. Não dobre nem molhe a tag.',
    icon: Hand,
  },
  {
    title: 'Não grave tags de outras pessoas sem permissão',
    text: 'Não use o NFC para fraude, phishing ou para apagar conteúdo que não é seu. Uma trava permanente não tem volta.',
    icon: ShieldAlert,
  },
];

export default function OnboardingScreen() {
  const { colors, fs } = useTheme();

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    useBootStore.getState().setOnboardingSeen(true);
    const user = useAuthStore.getState().user;
    replace(user ? '/(tabs)' : '/(auth)/login');
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 12, gap: 18 }}>
        <Text style={[{ color: colors.textPrimary, fontSize: fs(28) }, inter('extrabold')]}>Antes de começar</Text>
        <Text style={[{ color: colors.textSecondary, fontSize: fs(15) }, inter('regular')]}>Aproxime. Configure. Conecte.</Text>
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <View key={step.title} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                <Icon color={colors.primary} size={22} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>{step.title}</Text>
                <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>{step.text}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ padding: 24 }}>
        <PrimaryButton label="Entendi, continuar" fullWidth onPress={() => void finish()} />
      </View>
    </Screen>
  );
}
