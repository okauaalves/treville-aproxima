import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Nfc, Settings, SmartphoneNfc, Wrench, ChevronRight } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrevilleLogo } from '@/components/brand/TrevilleLogo';
import { contentColumn } from '@/components/layout/ContentContainer';
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
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useNfc } from '@/hooks/useNfc';
import { useTagDispatch } from '@/hooks/useTagDispatch';
import { openNfcFlow } from '@/lib/nfcEntry';
import { push } from '@/lib/navigation';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { Operation } from '@/types/history';
import { formatDayLabel } from '@/utils/formatters';

const COLUMN_GAP = 32;

export default function HomeScreen() {
  const { colors, fs } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, isLarge, isTablet, isBigTablet, horizontalPadding, contentMaxWidth, sidebarWidth } = useBreakpoint();
  const twoColumns = isBigTablet;
  const areaWidth = width - sidebarWidth;
  // No Fold aberto (~904) a sidebar de 220 come espaço: o padding de 64 cai para 32 para as colunas não ficarem estreitas demais.
  const padding = twoColumns && areaWidth < 800 ? 32 : horizontalPadding;
  const maxWidth = contentMaxWidth;
  const columnWidth = Math.min(areaWidth - padding * 2, maxWidth ?? Infinity);
  const leftWidth = twoColumns ? ((columnWidth - COLUMN_GAP) * 45) / 100 : columnWidth;
  const stacked = leftWidth < (twoColumns ? 340 : 328);
  const pulseSize = isLarge ? 140 : Math.min(156, leftWidth - 80);
  const scannerPadding = isLarge || isTablet ? 32 : 28;
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

  const header = (
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
  );

  const scanner = (
    <>
    <StatusCard title="NFC" subtitle={status} blur />
    <Card accessibilityLabel="Mantenha o app aberto e aproxime sua tag" onPress={() => void openNfcFlow('read')} tone="accent" padding={scannerPadding} blur style={{ alignItems: 'center', marginTop: 14, marginBottom: 14 }}>
      <NfcPulse size={pulseSize} />
      <Text style={[{ color: colors.textPrimary, fontSize: fs(16), textAlign: 'center', marginTop: 4, lineHeight: fs(22) }, inter('extrabold')]}>
        Mantenha o app aberto{'\n'}e aproxime sua tag
      </Text>
      <ReaderModeBadge style={{ marginTop: 10 }} />
    </Card>
    <View testID="home-actions" style={{ flexDirection: stacked ? 'column' : 'row', gap: 12, marginBottom: 12 }}>
      <View style={{ flex: stacked ? undefined : 1 }}>
        <PrimaryButton label="Modo leitura" icon={<Nfc color={colors.onPrimary} size={22} />} fullWidth onPress={() => void openNfcFlow('read')} />
      </View>
      <View style={{ flex: stacked ? undefined : 1 }}>
        <PrimaryButton label="Gravar tag" tone="success" icon={<SmartphoneNfc color={colors.onSuccess} size={22} />} fullWidth onPress={() => void openNfcFlow('write')} />
      </View>
    </View>
    </>
  );

  const diagnostics = (
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
  );

  const recents = (
    <View style={{ marginBottom: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(18) }, inter('extrabold')]}>Recentes</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Ver tudo" onPress={() => push('/(tabs)/history')} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={[{ color: colors.primary, fontSize: fs(14) }, inter('bold')]}>Ver tudo</Text>
      </Pressable>
    </View>
    {loadingRecent ? <Skeleton height={72} /> : null}
    {!loadingRecent && recent.length === 0 ? <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>Nenhuma leitura ou gravação ainda.</Text> : null}
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
    </View>
  );

  return (
    <Screen maxWidth={null}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: padding, paddingBottom: Math.max(insets.bottom, 24) }}>
        <View testID="home-content" style={contentColumn(maxWidth)}>
          {header}
          <ExpoGoBanner />
          {twoColumns ? (
            <View testID="home-columns" style={{ flexDirection: 'row', gap: COLUMN_GAP, alignItems: 'flex-start' }}>
              <View testID="home-left" style={{ flex: 45 }}>{scanner}</View>
              <View testID="home-right" style={{ flex: 55 }}>
                {recents}
                {diagnostics}
              </View>
            </View>
          ) : (
            <>
              {scanner}
              {diagnostics}
              {recents}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
