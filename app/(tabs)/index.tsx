import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Nfc, Settings, SmartphoneNfc, Wrench, ChevronRight } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/Screen';
import { NfcPulse } from '@/components/nfc/NfcPulse';
import { Card } from '@/components/ui/Card';
import { HistoryItem } from '@/components/ui/HistoryItem';
import { IconButton } from '@/components/ui/IconButton';
import { StatusCard } from '@/components/ui/StatusCard';
import { getOperations } from '@/core/offline/database';
import { useNfc } from '@/hooks/useNfc';
import { push } from '@/lib/navigation';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
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

  useFocusEffect(
    useCallback(() => {
      void nfcRef.current.checkNfcStatus();
      void getOperations({ filter: 'all', limit: 3 }).then(setRecent).catch(() => setRecent([]));
    }, []),
  );

  const ready = simulationAvailable || (isNfcSupported && isNfcEnabled);
  const status = ready
    ? 'Tudo pronto para começar.'
    : isNfcSupported
      ? 'O NFC está desligado.'
      : 'NFC não disponível neste dispositivo/navegador.';

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Text style={[{ flex: 1, fontSize: fs(28), color: colors.textPrimary }, inter('extrabold')]}>
            Tags do <Text style={{ color: colors.primary }}>Luiz</Text>
          </Text>
          <IconButton accessibilityLabel="Ajustes" onPress={() => push('/(tabs)/settings')}>
            <Settings color={colors.textSecondary} size={22} />
          </IconButton>
        </View>
        <StatusCard title="NFC" subtitle={status} />
        <Card accessibilityLabel="Aproxime uma tag NFC aqui" onPress={() => push('/scan')} tone="accent" padding={28} style={{ alignItems: 'center', marginTop: 14, marginBottom: 14 }}>
          <NfcPulse size={156} />
          <Text style={[{ color: colors.textPrimary, fontSize: fs(16), textAlign: 'center', marginTop: 4, lineHeight: fs(22) }, inter('extrabold')]}>
            Aproxime uma tag{'\n'}NFC aqui
          </Text>
        </Card>
        <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 12, marginBottom: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Ler tag" onPress={() => push('/scan')} style={{ flex: 1, minHeight: 72, borderRadius: radius.lg, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Nfc color="#fff" size={22} />
            <Text style={[{ color: '#fff', fontSize: fs(16), lineHeight: fs(20) }, inter('bold')]}>Ler tag</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Gravar tag" onPress={() => push('/write/configure')} style={{ flex: 1, minHeight: 72, borderRadius: radius.lg, backgroundColor: colors.success, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <SmartphoneNfc color="#fff" size={22} />
            <Text style={[{ color: '#fff', fontSize: fs(16), lineHeight: fs(20) }, inter('bold')]}>Gravar tag</Text>
          </Pressable>
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
        {recent.length === 0 ? <Text style={[{ color: colors.textSecondary }, inter('regular')]}>Nenhuma leitura ou gravação ainda.</Text> : null}
        {recent.map((item) => (
          <HistoryItem
            key={item.id}
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
