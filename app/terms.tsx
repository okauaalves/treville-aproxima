import { ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { SUPPORT_EMAIL } from '@/constants/config';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Uso responsável do NFC',
    body: 'Use o Tréville só em tags suas ou de quem autorizou a gravação. Não grave, apague ou trave tags de terceiros sem permissão. Não use o app para fraude, phishing, engenharia social ou para induzir alguém a abrir um link enganoso.',
  },
  {
    title: 'Limitações de responsabilidade',
    body: 'Tags podem falhar, chegar danificadas ou ficar somente leitura depois de uma trava permanente. O Tréville não garante que a gravação, a releitura ou a comparação recuperem dados já perdidos. Confira o conteúdo antes de travar uma tag. Este texto não é aconselhamento jurídico.',
  },
  {
    title: 'Dados coletados',
    body: 'O histórico de leituras e gravações fica neste aparelho. O identificador da tag é guardado como hash, não como o UID em claro. Se você criar uma conta, o serviço de autenticação (Supabase) recebe e-mail e nome. A sincronização com a nuvem, quando existir, é opcional.',
  },
  {
    title: 'Privacidade',
    body: 'O app funciona sem internet para ler e gravar. Não vendemos dados. Você pode apagar o histórico neste aparelho e sair da conta. A exclusão da conta no provedor de autenticação depende das ferramentas desse serviço. Para pedir a remoção de dados associados ao e-mail, escreva para o contato abaixo.',
  },
  {
    title: 'Contato e vigência',
    body: `Contato: ${SUPPORT_EMAIL} (placeholder — substitua em constants/config.ts). Vigência: 8 de outubro de 2026. Não há razão social nem CNPJ declarados neste texto.`,
  },
];

export default function TermsScreen() {
  const { colors, fs } = useTheme();
  return (
    <Screen>
      <AppHeader title="Termos de uso" back />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }}>
        <Text style={[{ color: colors.textSecondary }, inter('regular')]}>NFC Manager by Tréville. Texto genérico, não é aconselhamento jurídico.</Text>
        {SECTIONS.map((section) => (
          <View key={section.title} style={{ gap: 6 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(18) }, inter('bold')]}>{section.title}</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(15), lineHeight: fs(22) }, inter('regular')]}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
