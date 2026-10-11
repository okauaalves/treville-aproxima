import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { ExpoGoBanner } from '@/components/nfc/ExpoGoBanner';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Card } from '@/components/ui/Card';
import { StatusCard } from '@/components/ui/StatusCard';
import type { DiagnosticReportData } from '@/core/nfc/DiagnosticEngine';
import { deviceChecks, type DeviceCheck } from '@/core/nfc/deviceStatus';
import { assessNfc } from '@/core/nfc/readiness';
import { ReaderModeBadge } from '@/components/nfc/ReaderModeBadge';
import { nfcManager } from '@/core/nfc/NfcManager';
import { useNfc } from '@/hooks/useNfc';
import { useDispatchState } from '@/hooks/useTagDispatch';
import { replace } from '@/lib/navigation';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export default function DiagnosticsScreen() {
  const { colors, fs } = useTheme();
  const nfc = useNfc();
  const nfcRef = useRef(nfc);
  const dispatch = useDispatchState();
  const [report, setReport] = useState<DiagnosticReportData | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [checks, setChecks] = useState<DeviceCheck[]>([]);

  useEffect(() => {
    void deviceChecks().then(setChecks);
  }, []);

  useEffect(() => {
    const api = nfcRef.current;
    return () => {
      void api.unregisterTagEvent('diagnostics');
    };
  }, []);

  async function start() {
    const assessment = await assessNfc();
    if (!assessment.ready) {
      replace(`/nfc-unavailable?intent=read&reason=${assessment.reason ?? 'unsupported'}`);
      return;
    }
    setWaiting(true);
    setReport(null);
    await nfc.registerTagEvent(
      async (tag) => {
        const result = await nfcRef.current.runDiagnostic(tag);
        setReport(result);
        setWaiting(false);
        await nfcRef.current.unregisterTagEvent('diagnostics');
      },
      undefined,
      'diagnostics',
    );
  }

  return (
    <Screen>
      <AppHeader title="Diagnóstico NFC" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <ExpoGoBanner />
        <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>A análise só lê a tag. Nada é gravado.</Text>
        <ReaderModeBadge style={{ alignSelf: 'flex-start' }} />
        {nfcManager.getMode() === 'native' ? (
          <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>
            Reader mode: {dispatch.active ? `ativo (${dispatch.owner === 'diagnostics' ? 'diagnóstico' : 'tela atual'})` : dispatch.techSession ? 'sessão de gravação/leitura aberta' : 'inativo'}
          </Text>
        ) : null}
        {checks.map((item) => (
          <StatusCard key={item.id} title={item.label} subtitle={item.ok ? item.reason : `${item.reason} ${item.solution}`} />
        ))}
        <PrimaryButton label={waiting ? 'Aguardando tag...' : 'Iniciar diagnóstico'} onPress={() => void start()} disabled={waiting} />
        {nfc.simulationAvailable && nfc.simulateTag && waiting ? <PrimaryButton label="Simular tag (modo de teste)" variant="secondary" onPress={() => nfc.simulateTag?.('default')} /> : null}
        {report ? (
          <Card>
            <Text style={{ color: report.canBeUsed ? colors.success : colors.error, fontWeight: '800', marginBottom: 8 }}>{report.canBeUsed ? 'Tag utilizável' : 'Tag com restrições'}</Text>
            <Line label="Modelo" value={report.tag.type} />
            <Line label="Capacidade" value={`${report.tag.capacity} bytes`} />
            <Line label="Gravável" value={report.tag.capabilities.canWrite ? 'Sim' : 'Não'} />
            <Line label="Bloqueada" value={report.tag.capabilities.isReadOnly ? 'Sim' : 'Não'} />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: colors.textSecondary }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
