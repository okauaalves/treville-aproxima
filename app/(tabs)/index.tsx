import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronRight, Nfc, Settings, ShieldCheck, SmartphoneNfc } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrevilleLogo } from '@/components/brand/TrevilleLogo';
import { contentColumn } from '@/components/layout/ContentContainer';
import { Screen } from '@/components/layout/Screen';
import { ExpoGoBanner } from '@/components/nfc/ExpoGoBanner';
import { NfcPulse } from '@/components/nfc/NfcPulse';
import { Card } from '@/components/ui/Card';
import { CountBadge } from '@/components/ui/CountBadge';
import { HistoryItem } from '@/components/ui/HistoryItem';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusCard } from '@/components/ui/StatusCard';
import { APP_NAME } from '@/constants/config';
import { getOperations } from '@/core/offline/database';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useNfc } from '@/hooks/useNfc';
import { usePendingAccessCount } from '@/hooks/usePendingAccessCount';
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
  const { width, isLarge, isBigTablet, horizontalPadding, contentMaxWidth, sidebarWidth } = useBreakpoint();
  const twoColumns = isBigTablet;
  const areaWidth = width - sidebarWidth;
  // No Fold aberto (~904) a sidebar de 220 come espaço: o padding de 64 cai para 32 para as colunas não ficarem estreitas demais.
  const padding = twoColumns && areaWidth < 800 ? 32 : horizontalPadding;
  const maxWidth = contentMaxWidth;
  const columnWidth = Math.min(areaWidth - padding * 2, maxWidth ?? Infinity);
  const leftWidth = twoColumns ? ((columnWidth - COLUMN_GAP) * 45) / 100 : columnWidth;
  const pulseSize = Math.min(isLarge ? 260 : 240, leftWidth - 40);
  const buttonSize = Math.round(pulseSize * 0.56);
  const nfc = useNfc();
  const nfcRef = useRef(nfc);
  const { isNfcSupported, isNfcEnabled, simulationAvailable } = nfc;
  const [recent, setRecent] = useState<Operation[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const { isAdmin, pending } = usePendingAccessCount();

  useFocusEffect(
    useCallback(() => {
      void nfcRef.current.checkNfcStatus();
      void getOperations({ filter: 'all', limit: 3 })
        .then(setRecent)
        .catch(() => setRecent([]))
        .finally(() => setLoadingRecent(false));
    }, []),
  );

  const ready = isNfcSupported && isNfcEnabled && !simulationAvailable;

  /** Home sem sessão NFC: no Android o SO pode abrir o link da tag. Reader Mode só nas telas de leitura/gravação. */
  function readTag() {
    void openNfcFlow('read');
  }

  const problem = ready
    ? null
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
      {isAdmin ? (
        <IconButton accessibilityLabel={pending > 0 ? `Painel Admin: ${pending} ${pending === 1 ? 'pedido pendente' : 'pedidos pendentes'}` : 'Painel Admin'} onPress={() => push('/admin')}>
          <View testID="home-admin">
            <ShieldCheck color={colors.primary} size={22} />
            <CountBadge count={pending} style={{ position: 'absolute', top: -8, right: -12 }} />
          </View>
        </IconButton>
      ) : null}
      <IconButton accessibilityLabel="Ajustes" onPress={() => push('/(tabs)/settings')}>
        <Settings color={colors.textSecondary} size={22} />
      </IconButton>
    </View>
  );

  const scanner = (
    <>
      {problem ? <StatusCard title="NFC" subtitle={problem} blur /> : null}
      <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 22 }}>
        <View style={{ width: pulseSize, height: pulseSize, alignItems: 'center', justifyContent: 'center' }}>
          <NfcPulse size={pulseSize} active={false} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ler tag"
            onPress={readTag}
            style={({ pressed }) => ({
              position: 'absolute',
              width: buttonSize,
              height: buttonSize,
              borderRadius: buttonSize / 2,
              backgroundColor: pressed ? colors.primaryPressed : colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transform: [{ scale: pressed ? 0.97 : 1 }],
              shadowColor: colors.primary,
              shadowOpacity: 0.35,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
            })}
          >
            <Nfc color={colors.onPrimary} size={buttonSize * 0.3} strokeWidth={2} />
            <Text style={[{ color: colors.onPrimary, fontSize: fs(20) }, inter('extrabold')]}>Ler tag</Text>
          </Pressable>
        </View>
        <Text style={[{ color: colors.textPrimary, fontSize: fs(22), marginTop: 14, textAlign: 'center' }, inter('extrabold')]}>
          Toque para ler
        </Text>
      </View>
      <View testID="home-actions" style={{ marginBottom: 18 }}>
        <Card accessibilityLabel="Gravar tag" onPress={() => void openNfcFlow('write')} padding={16} blur>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
              <SmartphoneNfc color={colors.success} size={22} />
            </View>
            <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(17) }, inter('bold')]}>Gravar tag</Text>
            <ChevronRight color={colors.textMuted} size={20} />
          </View>
        </Card>
      </View>
    </>
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
      {!loadingRecent && recent.length === 0 ? <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>Nada por aqui ainda.</Text> : null}
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
              <View testID="home-right" style={{ flex: 55 }}>{recents}</View>
            </View>
          ) : (
            <>
              {scanner}
              {recents}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
