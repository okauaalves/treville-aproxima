import { useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { ExpoGoBanner } from '@/components/nfc/ExpoGoBanner';
import { NfcPulse } from '@/components/nfc/NfcPulse';
import { ReaderModeBadge } from '@/components/nfc/ReaderModeBadge';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Card } from '@/components/ui/Card';
import { nfcManager } from '@/core/nfc/NfcManager';
import { setPendingRead } from '@/core/nfc/pendingRead';
import { formatUid } from '@/core/nfc/TagAnalyzer';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useNfc } from '@/hooks/useNfc';
import { useNfcTechSession } from '@/hooks/useNfcTechSession';
import { useTagDispatch } from '@/hooks/useTagDispatch';
import { replace } from '@/lib/navigation';
import { openReadResult } from '@/lib/readResult';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { NfcTag, ParsedRecord } from '@/types/nfc';

/** Após identificar (intent=write), engole redispatches no Android enquanto a tag segue encostada. */
const HOLDS_AFTER_DETECT = Platform.OS === 'android' && nfcManager.getMode() === 'native';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Modo leitura (intent=read) e identificação antes de gravar (intent=write). Sessão via requestTechnology + Reader Mode. */
export default function ScanScreen() {
  const { colors, fs } = useTheme();
  const params = useLocalSearchParams<{ intent?: string; contentType?: string; prefill?: string; plaquinha?: string; test?: string }>();
  const intent = readParam(params.intent) === 'write' ? 'write' : 'read';
  const contentType = readParam(params.contentType);
  const prefill = readParam(params.prefill);
  const plaquinha = readParam(params.plaquinha);
  const testMode = __DEV__ && readParam(params.test) === '1';
  const nfc = useNfc();
  const short = useBreakpoint().height < 500;
  const [tag, setTag] = useState<NfcTag | null>(null);
  const [records, setRecords] = useState<ParsedRecord[]>([]);
  const waiting = !tag;

  useEffect(() => {
    nfcManager.rearmReading();
  }, []);

  useNfcTechSession(
    (found, foundRecords) => {
      if (intent === 'read') {
        openReadResult(found, foundRecords, 'replace');
        return;
      }
      setPendingRead(found, foundRecords);
      setTag(found);
      setRecords(foundRecords);
    },
    {
      enabled: waiting,
      once: true,
      alertMessage: intent === 'write' ? 'Aproxime a tag que será gravada' : 'Aproxime a tag para ler',
    },
  );

  // Hold só depois da captura (write): evita Chrome abrir o link com a tag ainda encostada.
  useTagDispatch(
    () => undefined,
    { enabled: HOLDS_AFTER_DETECT && intent === 'write' && !!tag, once: true, passive: true },
  );

  const detected = !!tag;
  const readOnly = tag ? !tag.capabilities.canWrite || tag.capabilities.isReadOnly : false;
  const current = records[0];

  function continueFlow() {
    if (plaquinha) {
      replace(`/write/progress?plaquinha=${encodeURIComponent(plaquinha)}`);
      return;
    }
    if (contentType) {
      const query = prefill ? `&prefill=${encodeURIComponent(prefill)}` : '';
      replace(`/write/configure?contentType=${contentType}${query}`);
      return;
    }
    replace('/write/choose');
  }

  return (
    <Screen>
      <AppHeader title={intent === 'write' ? 'Identificar tag' : 'Ler tag'} back />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <ExpoGoBanner />
        <View style={{ alignItems: 'center', marginTop: intent === 'read' && !short ? 24 : 0 }}>
          <NfcPulse size={intent === 'read' ? (short ? 150 : 220) : 132} active={!detected} />
          <Text style={[{ color: colors.textPrimary, fontSize: fs(22), marginTop: 12, textAlign: 'center' }, inter('extrabold')]}>
            {detected ? 'TAG DETECTADA' : 'Aproxime a tag'}
          </Text>
          <ReaderModeBadge style={{ marginTop: 12 }} />
        </View>
        {detected && tag ? (
          <View style={{ alignSelf: 'stretch', marginTop: 22, gap: 12 }}>
            <Card padding={14}>
              <Text style={{ color: colors.textSecondary, fontSize: fs(12) }}>Modelo</Text>
              <Text style={{ color: colors.textPrimary, fontWeight: '700', marginTop: 4 }}>{tag.type}</Text>
              <Text style={{ color: colors.textSecondary, marginTop: 8 }}>UID {formatUid(tag.uid)} · {tag.capacity} bytes</Text>
              <Text style={{ color: readOnly ? colors.warning : colors.success, marginTop: 6, fontWeight: '700' }}>{readOnly ? 'Somente leitura' : 'Gravável'}</Text>
              <Text style={{ color: colors.textSecondary, marginTop: 6 }}>{current ? `Conteúdo atual: ${current.displayTitle}` : 'Sem conteúdo NDEF reconhecido.'}</Text>
            </Card>
            <PrimaryButton label={plaquinha ? 'Gravar plaquinha' : contentType ? 'Configurar' : 'Escolher tipo de conteúdo'} fullWidth onPress={continueFlow} />
          </View>
        ) : null}
        {testMode && !detected ? (
          <View style={{ marginTop: 24 }}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 8 }}>Modo de teste — simulação só neste ambiente de desenvolvimento.</Text>
            <PrimaryButton label="Simular tag (modo de teste)" variant="secondary" fullWidth onPress={() => nfc.simulateTag?.('default')} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
