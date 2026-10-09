import { useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Nfc } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { assessNfc, type NfcBlockReason } from '@/core/nfc/readiness';
import { nfcManager } from '@/core/nfc/NfcManager';
import { replace } from '@/lib/navigation';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const COPY: Record<NfcBlockReason, { title: string; message: string; solution: string }> = {
  'expo-go': {
    title: 'NFC indisponível no Expo Go',
    message: Platform.OS === 'ios'
      ? 'NFC disponível apenas no app instalado. Baixe o Tréville na App Store para usar o NFC.'
      : 'NFC disponível apenas no app instalado. Instale o APK do Tréville para usar o NFC.',
    solution: 'Histórico, templates e configurações continuam disponíveis.',
  },
  unsupported: {
    title: 'NFC indisponível',
    message: 'Este aparelho não oferece NFC para o Tréville.',
    solution: 'Use um celular com NFC pelo aplicativo instalado.',
  },
  disabled: {
    title: 'NFC desligado',
    message: 'O rádio NFC está desativado.',
    solution: 'Ative o NFC nas configurações do celular e tente de novo.',
  },
  permission: {
    title: 'Sem permissão de NFC',
    message: 'O sistema ainda não liberou o acesso ao NFC.',
    solution: 'Conceda a permissão quando o celular pedir.',
  },
  web: {
    title: 'Web NFC sem suporte',
    message: 'Este navegador não consegue ler nem gravar tags NFC.',
    solution: 'Use o Chrome no Android, em HTTPS, ou o aplicativo instalado.',
  },
};

export default function NfcUnavailableScreen() {
  const { colors, fs } = useTheme();
  const params = useLocalSearchParams<{ intent?: string; reason?: string; contentType?: string; prefill?: string; test?: string }>();
  const reason = (readParam(params.reason) || 'unsupported') as NfcBlockReason;
  const copy = COPY[reason] ?? COPY.unsupported;
  const intent = readParam(params.intent) === 'write' ? 'write' : 'read';
  const [busy, setBusy] = useState(false);
  const showTest = __DEV__ && (reason === 'web' || reason === 'expo-go');
  const showSettings = Platform.OS === 'android' && (reason === 'disabled' || reason === 'permission');

  async function retry() {
    setBusy(true);
    const assessment = await assessNfc();
    setBusy(false);
    if (!assessment.ready) {
      return;
    }
    const next = new URLSearchParams({ intent });
    const contentType = readParam(params.contentType);
    const prefill = readParam(params.prefill);
    if (contentType) {
      next.set('contentType', contentType);
    }
    if (prefill) {
      next.set('prefill', prefill);
    }
    replace(`/scan?${next.toString()}`);
  }

  async function openSettings() {
    if (Platform.OS === 'android') {
      const opened = await nfcManager.openSettings();
      if (!opened) {
        const linking = Linking as typeof Linking & { sendIntent?: (action: string) => Promise<void> };
        if (linking.sendIntent) {
          await linking.sendIntent('android.settings.NFC_SETTINGS').catch(() => Linking.openSettings());
        } else {
          await Linking.openSettings();
        }
      }
      return;
    }
    await Linking.openSettings();
  }

  function testMode() {
    const next = new URLSearchParams({ intent, test: '1' });
    const contentType = readParam(params.contentType);
    const prefill = readParam(params.prefill);
    if (contentType) {
      next.set('contentType', contentType);
    }
    if (prefill) {
      next.set('prefill', prefill);
    }
    replace(`/scan?${next.toString()}`);
  }

  return (
    <Screen>
      <AppHeader title="NFC indisponível" back />
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
          <Nfc color={colors.primary} size={32} />
        </View>
        <Text style={[{ color: colors.textPrimary, fontSize: fs(24) }, inter('extrabold')]}>{copy.title}</Text>
        <Text style={[{ color: colors.textSecondary, fontSize: fs(16) }, inter('regular')]}>{copy.message}</Text>
        <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('semibold')]}>{copy.solution}</Text>
        <View style={{ flex: 1 }} />
        {showSettings ? <PrimaryButton label="Abrir configurações de NFC" fullWidth onPress={() => void openSettings()} /> : null}
        <PrimaryButton label="Tentar novamente" variant="secondary" fullWidth loading={busy} onPress={() => void retry()} />
        {showTest ? (
          <>
            <Text style={[{ color: colors.textMuted, fontSize: fs(13), textAlign: 'center' }, inter('medium')]}>Só no desenvolvimento: simula uma tag, sem NFC real.</Text>
            <PrimaryButton label="Modo de teste (simulação)" variant="secondary" fullWidth onPress={testMode} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}
