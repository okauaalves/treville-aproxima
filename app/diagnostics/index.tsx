import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Cpu } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { ExpoGoBanner } from '@/components/nfc/ExpoGoBanner';
import { ReadOnlyBadge } from '@/components/nfc/ReadOnlyBadge';
import { RfidNotice } from '@/components/nfc/RfidNotice';
import { useTagTools } from '@/components/nfc/TagTools';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Card } from '@/components/ui/Card';
import { StatusCard } from '@/components/ui/StatusCard';
import { diagnosticEngine, type DiagnosticReportData } from '@/core/nfc/DiagnosticEngine';
import { deviceChecks, type DeviceCheck } from '@/core/nfc/deviceStatus';
import { assessNfc } from '@/core/nfc/readiness';
import { ReaderModeBadge } from '@/components/nfc/ReaderModeBadge';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import { errorMessages } from '@/core/nfc/errors';
import { NFC_DIAGNOSTIC_TIMEOUT_MS, nfcManager } from '@/core/nfc/NfcManager';
import { setPendingRead } from '@/core/nfc/pendingRead';
import { formatUid } from '@/core/nfc/TagAnalyzer';
import { chipLabel, classifyTag, summarizeRecords } from '@/core/nfc/technical';
import { useNfc } from '@/hooks/useNfc';
import { useDispatchState } from '@/hooks/useTagDispatch';
import { useUidHash } from '@/hooks/useUidHash';
import { push, replace } from '@/lib/navigation';
import { useNfcStore } from '@/stores/nfcStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { NfcTag } from '@/types/nfc';

export default function DiagnosticsScreen() {
  const { colors, fs } = useTheme();
  const nfc = useNfc();
  const nfcRef = useRef(nfc);
  const dispatch = useDispatchState();
  const [report, setReport] = useState<DiagnosticReportData | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [checks, setChecks] = useState<DeviceCheck[]>([]);
  const [timedOut, setTimedOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tag = report?.tag ?? null;
  const uidHash = useUidHash(tag?.uid);

  useEffect(() => {
    void deviceChecks().then(setChecks);
  }, []);

  function clearTimer() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  useEffect(() => {
    const api = nfcRef.current;
    const pending = timer;
    return () => {
      if (pending.current) {
        clearTimeout(pending.current);
      }
      void api.unregisterTagEvent('diagnostics');
    };
  }, []);

  function show(next: NfcTag, persisted?: DiagnosticReportData) {
    setPendingRead(next, ndefEngine.parseContent(next.ndefRecords));
    useNfcStore.getState().setCurrentTag(next);
    setReport(persisted ?? diagnosticEngine.runDiagnostic(next));
  }

  const tools = useTagTools({
    tag,
    records: tag?.ndefRecords ?? [],
    uidHash,
    summary: summarizeRecords(tag?.ndefRecords ?? []),
    live: true,
    onTagChanged: (next) => show(next),
  });

  async function start() {
    const assessment = await assessNfc();
    if (!assessment.ready && !(assessment.testMode && nfcManager.isSimulation())) {
      replace(`/nfc-unavailable?intent=read&reason=${assessment.reason ?? 'unsupported'}`);
      return;
    }
    clearTimer();
    setTimedOut(false);
    setWaiting(true);
    setReport(null);
    nfcManager.rearmReading();
    // Leitura única: o reader mode segue ligado (só descarta tags) até sair da tela; desligá-lo com a
    // tag encostada faria o Android abrir o link ou reabrir o app pelo intent.
    await nfc.registerTagEvent(
      async (detected) => {
        clearTimer();
        const result = await nfcRef.current.runDiagnostic(detected);
        show(detected, result);
        setWaiting(false);
      },
      () => {
        clearTimer();
        setWaiting(false);
      },
      'diagnostics',
      { once: true },
    );
    timer.current = setTimeout(() => {
      timer.current = null;
      setWaiting(false);
      setTimedOut(true);
      void nfcRef.current.unregisterTagEvent('diagnostics');
    }, NFC_DIAGNOSTIC_TIMEOUT_MS);
  }

  const tagClass = tag ? classifyTag(tag.technologies, tag.capabilities.supportsNdef) : null;

  return (
    <Screen>
      <AppHeader title="Diagnóstico NFC" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <ExpoGoBanner />
        <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>A análise só lê a tag. Nada é gravado sem a sua confirmação.</Text>
        <ReaderModeBadge style={{ alignSelf: 'flex-start' }} />
        {nfcManager.getMode() === 'native' ? (
          <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>
            Reader mode: {dispatch.active ? `ativo (${dispatch.owner === 'diagnostics' ? 'diagnóstico' : 'tela atual'})` : dispatch.techSession ? 'sessão de gravação/leitura aberta' : 'inativo'}
          </Text>
        ) : null}
        {checks.map((item) => (
          <StatusCard key={item.id} title={item.label} subtitle={item.ok ? item.reason : `${item.reason} ${item.solution}`} />
        ))}
        <PrimaryButton label={waiting ? 'Aproxime a tag' : report ? 'Ler novamente' : 'Iniciar diagnóstico'} onPress={() => void start()} disabled={waiting} />
        {timedOut ? <Text style={[{ color: colors.error, fontSize: fs(14) }, inter('semibold')]}>{errorMessages.TIMEOUT}</Text> : null}
        {nfc.simulationAvailable && nfc.simulateTag && waiting ? (
          <View style={{ gap: 8 }}>
            <PrimaryButton label="Simular tag (modo de teste)" variant="secondary" onPress={() => nfc.simulateTag?.('default')} />
            <PrimaryButton label="Simular tag RFID sem NDEF (modo de teste)" variant="secondary" onPress={() => nfc.simulateTag?.('rfid')} />
          </View>
        ) : null}
        {report && tag ? (
          <>
            {tagClass === 'rfid' ? <RfidNotice uid={formatUid(tag.uid)} technologies={tag.technologies} /> : null}
            <Card>
              <Text style={{ color: report.canBeUsed ? colors.success : colors.error, fontWeight: '800', marginBottom: 8 }}>{report.canBeUsed ? 'Tag utilizável' : 'Tag com restrições'}</Text>
              {tag.capabilities.supportsNdef && !tag.capabilities.canWrite ? <View style={{ marginBottom: 8 }}><ReadOnlyBadge /></View> : null}
              <Line label="Modelo" value={chipLabel({ chip: tag.type, chipEstimated: tag.type.startsWith('NTAG') })} />
              <Line label="Capacidade" value={tag.capacity > 0 ? `${tag.capacity} bytes` : '—'} />
              <Line label="NDEF" value={tag.capabilities.supportsNdef ? 'Sim' : tagClass === 'formatable' ? 'Não (formatável)' : 'Não'} />
              <Line label="Gravável" value={tag.capabilities.canWrite ? 'Sim' : 'Não'} />
              <Line label="Somente leitura" value={tag.capabilities.isReadOnly ? 'Sim' : 'Não'} />
              <Line label="Conteúdo" value={tagClass === 'ndef' ? summarizeRecords(tag.ndefRecords, 40) : 'Não legível (sem NDEF)'} />
            </Card>
            <PrimaryButton label="Ver dados técnicos" variant="secondary" fullWidth icon={<Cpu color={colors.primary} size={18} />} onPress={() => push('/tag-details/technical?source=current')} />
            {tagClass !== 'rfid' ? (
              <>
                <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('extrabold')]}>Ferramentas da tag</Text>
                {tools.actions}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      {tools.overlays}
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 }}>
      <Text style={{ color: colors.textSecondary }}>{label}</Text>
      <Text style={{ flexShrink: 1, textAlign: 'right', color: colors.textPrimary, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
