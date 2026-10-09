import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { ExpoGoBanner } from '@/components/nfc/ExpoGoBanner';
import { NfcPulse } from '@/components/nfc/NfcPulse';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Card } from '@/components/ui/Card';
import { setPendingRead } from '@/core/nfc/pendingRead';
import { formatUid } from '@/core/nfc/TagAnalyzer';
import { useNfc } from '@/hooks/useNfc';
import { replace } from '@/lib/navigation';
import { useTheme } from '@/theme/ThemeContext';
import type { NfcTag, ParsedRecord } from '@/types/nfc';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function ScanScreen() {
  const { colors, fs } = useTheme();
  const params = useLocalSearchParams<{ intent?: string; contentType?: string; prefill?: string; test?: string }>();
  const intent = readParam(params.intent) === 'write' ? 'write' : 'read';
  const contentType = readParam(params.contentType);
  const prefill = readParam(params.prefill);
  const testMode = __DEV__ && readParam(params.test) === '1';
  const nfc = useNfc();
  const nfcRef = useRef(nfc);
  const [tag, setTag] = useState<NfcTag | null>(null);
  const [records, setRecords] = useState<ParsedRecord[]>([]);

  useEffect(() => {
    const api = nfcRef.current;
    let alive = true;
    void api.registerTagEvent((found, foundRecords) => {
      if (!alive) {
        return;
      }
      setPendingRead(found, foundRecords);
      setTag(found);
      setRecords(foundRecords);
    });
    return () => {
      alive = false;
      void api.unregisterTagEvent();
    };
  }, []);

  const detected = !!tag;
  const readOnly = tag ? !tag.capabilities.canWrite || tag.capabilities.isReadOnly : false;
  const current = records[0];

  function continueFlow() {
    if (intent === 'read') {
      replace('/read');
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
      <AppHeader title={intent === 'write' ? 'Identificar tag' : 'Detectando tag...'} back />
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <ExpoGoBanner />
        <View style={{ alignItems: 'center' }}>
          <NfcPulse active={!detected} />
          <Text style={{ color: colors.textPrimary, fontSize: fs(22), fontWeight: '800', marginTop: 8 }}>{detected ? 'TAG DETECTADA' : 'AGUARDANDO TAG'}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 6, textAlign: 'center' }}>Aproxime a tag NFC e mantenha parado até confirmar.</Text>
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
            <PrimaryButton label={intent === 'read' ? 'Ver conteúdo' : contentType ? 'Configurar' : 'Escolher tipo de conteúdo'} fullWidth onPress={continueFlow} />
          </View>
        ) : null}
        {testMode && !detected ? (
          <View style={{ marginTop: 24 }}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 8 }}>Modo de teste — simulação só neste ambiente de desenvolvimento.</Text>
            <PrimaryButton label="Simular tag (modo de teste)" variant="secondary" fullWidth onPress={() => nfc.simulateTag?.('default')} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
