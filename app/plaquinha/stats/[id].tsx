import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Clock, Nfc, QrCode, ScanLine } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { StackedScanChart } from '@/components/plaquinha/ScanChart';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { replace } from '@/lib/navigation';
import {
  aggregateScans,
  formatDateTimePtBr,
  getPlaquinha,
  getScanDetails,
  plaquinhasAvailable,
  SCAN_TYPE_LABELS,
  type RedirectLink,
  type ScanDetails,
} from '@/lib/plaquinhas';
import { useAuthStore } from '@/stores/authStore';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

function MetricCard({ label, value, icon, testID, small }: { label: string; value: string; icon: React.ReactNode; testID: string; small?: boolean }) {
  const { colors, fs } = useTheme();
  return (
    <Card padding={16} style={{ flexGrow: 1, flexBasis: '45%' }}>
      <View testID={testID} accessible accessibilityLabel={`${label}: ${value}`} style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryGlow, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
          <Text numberOfLines={1} style={[{ flex: 1, color: colors.textSecondary, fontSize: fs(13) }, inter('semibold')]}>
            {label}
          </Text>
        </View>
        <Text numberOfLines={2} style={[{ color: colors.textPrimary, fontSize: fs(small ? 15 : 28) }, inter(small ? 'bold' : 'extrabold')]}>
          {value}
        </Text>
      </View>
    </Card>
  );
}

export default function PlaquinhaStatsScreen() {
  const { colors, fs } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const { isTabletUp } = useBreakpoint();
  const available = plaquinhasAvailable() && !!user;
  const [link, setLink] = useState<RedirectLink | null>(null);
  const [details, setDetails] = useState<ScanDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const week = useMemo(() => aggregateScans(details?.week ?? [], new Date()), [details]);

  const load = useCallback(async () => {
    if (!available || !id) {
      setLoading(false);
      return;
    }
    try {
      const found = await getPlaquinha(id);
      setLink(found);
      if (!found) {
        setError('Essa plaquinha não existe ou não é sua.');
        return;
      }
      setDetails(await getScanDetails(found.id));
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as estatísticas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [available, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const title = link ? `Stats — ${link.name}` : 'Estatísticas';

  return (
    <Screen maxWidth={isTabletUp ? 880 : null}>
      <AppHeader title={title} back />
      {!available ? (
        <View style={{ paddingHorizontal: 20 }}>
          <ErrorState title="Plaquinhas precisam de conta e conexão" message="Entre com sua conta para ver as estatísticas." />
        </View>
      ) : loading ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }} accessibilityLabel="Carregando estatísticas">
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Skeleton height={96} />
            </View>
            <View style={{ flex: 1 }}>
              <Skeleton height={96} />
            </View>
          </View>
          <Skeleton height={220} />
          <Skeleton height={260} />
        </View>
      ) : error || !link || !details ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <ErrorState title="Estatísticas indisponíveis" message={error ?? 'Não foi possível carregar.'} />
          <PrimaryButton label="Voltar" variant="secondary" onPress={() => replace('/(tabs)/plaquinhas')} />
        </View>
      ) : (
        <ScrollView
          testID="plaquinha-stats"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 14 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <MetricCard testID="stat-total" label="Total" value={String(link.scan_count)} icon={<ScanLine color={colors.primary} size={18} />} />
            <MetricCard testID="stat-qr" label="Via QR" value={String(details.qr)} icon={<QrCode color={colors.primary} size={18} />} />
            <MetricCard testID="stat-nfc" label="Via NFC" value={String(details.nfc)} icon={<Nfc color={colors.success} size={18} />} />
            <MetricCard testID="stat-ultimo" label="Último scan" value={formatDateTimePtBr(details.lastScanAt)} icon={<Clock color={colors.primary} size={18} />} small />
          </View>
          <Text style={[{ color: colors.textMuted, fontSize: fs(11), marginTop: -6 }, inter('regular')]}>
            Total vem do contador da plaquinha. QR e NFC contam os registros guardados (até 90 dias).
          </Text>

          <Card padding={16}>
            <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(16), marginBottom: 4 }, inter('bold')]}>
              Últimos 7 dias
            </Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(12), marginBottom: 12 }, inter('regular')]}>
              {week.sample} {week.sample === 1 ? 'scan' : 'scans'} na semana
            </Text>
            <StackedScanChart days={week.days} max={week.maxPerDay} />
          </Card>

          <Card padding={16}>
            <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(16), marginBottom: 8 }, inter('bold')]}>
              Últimos scans
            </Text>
            {details.recent.length === 0 ? (
              <EmptyState title="Nenhum scan ainda" message="Quando alguém escanear o QR Code ou a tag, aparece aqui." />
            ) : (
              <View testID="ultimos-scans">
                {details.recent.map((scan, index) => {
                  const nfc = scan.scan_type === 'nfc';
                  return (
                    <View
                      key={scan.id ?? `${scan.scanned_at}-${index}`}
                      accessible
                      accessibilityLabel={`${formatDateTimePtBr(scan.scanned_at)}, ${nfc ? SCAN_TYPE_LABELS.nfc : SCAN_TYPE_LABELS.qr}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: nfc ? `${colors.success}1A` : colors.primaryGlow }}>
                        {nfc ? <Nfc color={colors.success} size={16} /> : <QrCode color={colors.primary} size={16} />}
                      </View>
                      <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(14) }, inter('medium')]}>{formatDateTimePtBr(scan.scanned_at)}</Text>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: nfc ? `${colors.success}1A` : colors.primaryGlow }}>
                        <Text style={[{ color: nfc ? colors.success : colors.primary, fontSize: fs(12) }, inter('bold')]}>{nfc ? 'NFC' : 'QR'}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}
