import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Nfc, Settings, SmartphoneNfc, Wrench, ChevronRight } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrevilleLogo } from '@/components/brand/TrevilleLogo';
import { Screen } from '@/components/layout/Screen';
import { ExpoGoBanner } from '@/components/nfc/ExpoGoBanner';
import { NfcPulse } from '@/components/nfc/NfcPulse';
import { ReaderModeBadge } from '@/components/nfc/ReaderModeBadge';
import { Card } from '@/components/ui/Card';
import { HistoryItem } from '@/components/ui/HistoryItem';
import { IconButton } from '@/components/ui/IconButton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusCard } from '@/components/ui/StatusCard';
import { APP_NAME } from '@/constants/config';
import { setPendingRead } from '@/core/nfc/pendingRead';
import { getOperations } from '@/core/offline/database';
import { useNfc } from '@/hooks/useNfc';
import { useTagDispatch } from '@/hooks/useTagDispatch';
import { openNfcFlow } from '@/lib/nfcEntry';
import { push } from '@/lib/navigation';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { Operation } from '@/types/history';
import { formatDayLabel } from '@/utils/formatters';

export default function HomeScreen() {
  const { colors, fs } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stacked = width < 360;
  const nfc = useNfc();
  const nfcRef = useRef(nfc);
  const { isNfcSupported, isNfcEnabled, simulationAvailable } = nfc;
  const [recent, setRecent] = useState<Operation[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void nfcRef.current.checkNfcStatus();
      void getOperations({ filter: 'all', limit: 3 })
        .then(setRecent)
        .catch(() => setRecent([]))
        .finally(() => setLoadingRecent(false));
    }, []),
  );

  useTagDispatch(
    (tag, records) => {
      setPendingRead(tag, records);
      push('/read');
    },
    { passive: true, enabled: isNfcSupported && isNfcEnabled },
  );

  const ready = isNfcSupported && isNfcEnabled && !simulationAvailable;
  const status = ready
    ? 'Tudo pronto para começar.'
    : simulationAvailable
      ? 'NFC indisponível neste navegador.'
      : isNfcSupported
        ? 'O NFC está desligado.'
        : 'NFC não disponível neste dispositivo.';

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}>
          <TrevilleLogo size={32} color={colors.primary} />
          <View accessibilityRole="header" accessibilityLabel={APP_NAME} style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 }}>
            <Text style={[{ fontSize: fs(28), color: colors.primary }, inter('bold')]}>Tréville</Text>
            <Text style={[{ fontSize: fs(17), color: colors.textSecondary }, inter('semibold')]}>Aproxima</Text>
          </View>
          <IconButton accessibilityLabel="Ajustes" onPress={() => push('/(tabs)/settings')}>
            <Settings color={colors.textSecondary} size={22} />
          </IconButton>
        </View>
        <ExpoGoBanner />
        <StatusCard title="NFC" subtitle={status} blur />
        <Card accessibilityLabel="Mantenha o app aberto e aproxime sua tag" onPress={() => void openNfcFlow('read')} tone="accent" padding={28} blur style={{ alignItems: 'center', marginTop: 14, marginBottom: 14 }}>
          <NfcPulse size={156} />
          <Text style={[{ color: colors.textPrimary, fontSize: fs(16), textAlign: 'center', marginTop: 4, lineHeight: fs(22) }, inter('extrabold')]}>
            Mantenha o app aberto{'\n'}e aproxime sua tag
          </Text>
          <ReaderModeBadge style={{ marginTop: 10 }} />
        </Card>
        <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 12, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Modo leitura" icon={<Nfc color={colors.onPrimary} size={22} />} fullWidth onPress={() => void openNfcFlow('read')} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Gravar tag" tone="success" icon={<SmartphoneNfc color={colors.onSuccess} size={22} />} fullWidth onPress={() => void openNfcFlow('write')} />
          </View>
        </View>
        <Card accessibilityLabel="Diagnóstico NFC" onPress={() => push('/diagnostics')} padding={14} style={{ marginBottom: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Wrench color={colors.textSecondary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>Diagnóstico NFC</Text>
              <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>Verifique uma tag</Text>
            </View>
            <ChevronRight color={colors.textMuted} size={18} />
          </View>
        </Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(18) }, inter('extrabold')]}>Recentes</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Ver tudo" onPress={() => push('/(tabs)/history')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={[{ color: colors.primary }, inter('bold')]}>Ver tudo</Text>
          </Pressable>
        </View>
        {loadingRecent ? <Skeleton height={72} /> : null}
        {!loadingRecent && recent.length === 0 ? <Text style={[{ color: colors.textSecondary }, inter('regular')]}>Nenhuma leitura ou gravação ainda.</Text> : null}
        {recent.map((item, index) => (
          <HistoryItem
            key={item.id}
            index={index}
            type={item.contentType ?? item.payload?.contentType}
            title={item.displayTitle || item.title}
            subtitle={`${item.tagType ?? 'NTAG213'} · ${formatDayLabel(item.createdAt)}`}
            onPress={() => push(`/tag-details/${item.id}`)}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}
