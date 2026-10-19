import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as IntentLauncher from 'expo-intent-launcher';
import { ChevronRight, CircleX, Clock, Download, LayoutTemplate, Nfc, QrCode, Settings } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { isLatestApkUrlConfigured, LATEST_APK_URL } from '@/constants/config';
import { assessNfc, type NfcAssessment, type NfcBlockReason } from '@/core/nfc/readiness';
import { nfcManager } from '@/core/nfc/NfcManager';
import { replace } from '@/lib/navigation';
import { withAlpha } from '@/theme/colors';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const COPY: Record<NfcBlockReason, { title: string; message: string }> = {
  'expo-go': {
    title: 'NFC não disponível',
    message: 'Você está no Expo Go, que não inclui o módulo NFC. O NFC funciona só no app completo instalado.',
  },
  unsupported: {
    title: 'NFC não disponível',
    message: 'Este aparelho não tem NFC ou o hardware não respondeu.',
  },
  disabled: {
    title: 'NFC não disponível',
    message: 'O NFC está desligado neste celular. Ative nas configurações e volte ao app.',
  },
  permission: {
    title: 'NFC não disponível',
    message: 'O sistema ainda não liberou o acesso ao NFC para o Tréville Aproxima.',
  },
  web: {
    title: 'NFC não disponível',
    message: 'Este navegador não tem Web NFC. Use o Chrome no Android (em HTTPS) ou o app instalado.',
  },
};

const FEATURES: { label: string; detail: string; icon: LucideIcon; href: string }[] = [
  { label: 'Plaquinhas e QR Code', detail: 'Crie e edite destinos sem NFC', icon: QrCode, href: '/(tabs)/plaquinhas' },
  { label: 'Histórico', detail: 'Leituras e gravações anteriores', icon: Clock, href: '/(tabs)/history' },
  { label: 'Templates', detail: 'Modelos prontos de conteúdo', icon: LayoutTemplate, href: '/(tabs)/templates' },
];

const FORWARDED = ['contentType', 'prefill', 'plaquinha'] as const;

async function openNfcSettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    await Linking.openSettings();
    return;
  }
  if (await nfcManager.openSettings()) {
    return;
  }
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.NFC_SETTINGS);
  } catch {
    await Linking.openSettings();
  }
}

export default function NfcUnavailableScreen() {
  const { colors, fs } = useTheme();
  const params = useLocalSearchParams<{ intent?: string; reason?: string; contentType?: string; prefill?: string; plaquinha?: string }>();
  const [reason, setReason] = useState<NfcBlockReason>((readParam(params.reason) || 'unsupported') as NfcBlockReason);
  const copy = COPY[reason] ?? COPY.unsupported;
  const intent = readParam(params.intent) === 'write' ? 'write' : 'read';
  const [busy, setBusy] = useState(false);
  const [showApkHelp, setShowApkHelp] = useState(false);
  const leaving = useRef(false);
  const showTest = __DEV__ && (reason === 'web' || reason === 'expo-go');
  const canOpenSettings = Platform.OS === 'android' && (reason === 'disabled' || reason === 'permission');

  const forward = useCallback(
    (base: Record<string, string>): string => {
      const next = new URLSearchParams(base);
      for (const key of FORWARDED) {
        const value = readParam(params[key]);
        if (value) {
          next.set(key, value);
        }
      }
      return next.toString();
    },
    [params],
  );

  const applyAssessment = useCallback((assessment: NfcAssessment): boolean => {
    if (assessment.ready) {
      if (!leaving.current) {
        leaving.current = true;
        replace(`/scan?${forward({ intent })}`);
      }
      return true;
    }
    if (assessment.reason) {
      setReason(assessment.reason);
    }
    return false;
  }, [forward, intent]);

  const hasReasonParam = Boolean(readParam(params.reason));
  useEffect(() => {
    if (!hasReasonParam) {
      void assessNfc().then(applyAssessment);
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void assessNfc().then(applyAssessment);
      }
    });
    return () => sub.remove();
  }, [applyAssessment, hasReasonParam]);

  async function retry() {
    setBusy(true);
    try {
      applyAssessment(await assessNfc());
    } finally {
      setBusy(false);
    }
  }

  function downloadApp() {
    if (isLatestApkUrlConfigured()) {
      void Linking.openURL(LATEST_APK_URL);
      return;
    }
    setShowApkHelp(true);
  }

  const primary =
    canOpenSettings ? (
      <PrimaryButton label="Abrir configurações NFC" icon={<Settings color={colors.onPrimary} size={18} />} fullWidth onPress={() => void openNfcSettings()} />
    ) : reason === 'expo-go' ? (
      <PrimaryButton label="Baixar app completo" icon={<Download color={colors.onPrimary} size={18} />} fullWidth onPress={downloadApp} />
    ) : (
      <PrimaryButton label="Ver funcionalidades sem NFC" fullWidth onPress={() => replace('/(tabs)/plaquinhas')} />
    );

  return (
    <Screen>
      <AppHeader title="NFC indisponível" back />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 14 }}>
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 8 }}>
          <View accessibilityLabel="NFC indisponível" style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: withAlpha(colors.error, '1A'), alignItems: 'center', justifyContent: 'center' }}>
            <Nfc color={colors.textSecondary} size={64} strokeWidth={1.6} />
            <View style={{ position: 'absolute', right: 6, bottom: 6, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <CircleX color={colors.error} size={40} strokeWidth={2.2} />
            </View>
          </View>
          <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(26), textAlign: 'center' }, inter('extrabold')]}>{copy.title}</Text>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(16), textAlign: 'center', lineHeight: fs(23) }, inter('regular')]}>{copy.message}</Text>
        </View>
        {showApkHelp ? (
          <Card>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>Como instalar o app completo</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginTop: 6, lineHeight: fs(20) }, inter('regular')]}>
              Peça a quem compartilhou o app o link do APK (página de builds do projeto no EAS, em expo.dev). Abra o arquivo no celular, permita a instalação de fontes desconhecidas e confirme. Depois disso você pode desativar essa permissão.
            </Text>
          </Card>
        ) : null}
        {reason === 'disabled' ? (
          <Text style={[{ color: colors.textMuted, fontSize: fs(13), textAlign: 'center' }, inter('medium')]}>Ao voltar das configurações, o app confere de novo sozinho.</Text>
        ) : null}
        <View style={{ gap: 10 }}>
          {primary}
          {canOpenSettings || reason === 'expo-go' ? (
            <PrimaryButton label="Ver funcionalidades sem NFC" variant="secondary" fullWidth onPress={() => replace('/(tabs)/plaquinhas')} />
          ) : null}
          <PrimaryButton label="Tentar novamente" variant="ghost" fullWidth loading={busy} onPress={() => void retry()} />
        </View>
        <Text style={[{ color: colors.textPrimary, fontSize: fs(15), marginTop: 6 }, inter('bold')]}>Funciona sem NFC</Text>
        <View style={{ gap: 8 }}>
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.href} padding={12} accessibilityLabel={feature.label} onPress={() => replace(feature.href)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Icon color={colors.primary} size={22} />
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('semibold')]}>{feature.label}</Text>
                    <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{feature.detail}</Text>
                  </View>
                  <ChevronRight color={colors.textMuted} size={18} />
                </View>
              </Card>
            );
          })}
        </View>
        {showTest ? (
          <>
            <Text style={[{ color: colors.textMuted, fontSize: fs(13), textAlign: 'center' }, inter('medium')]}>Só no desenvolvimento: simula uma tag, sem NFC real.</Text>
            <PrimaryButton label="Modo de teste (simulação)" variant="secondary" fullWidth onPress={() => replace(`/scan?${forward({ intent, test: '1' })}`)} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
