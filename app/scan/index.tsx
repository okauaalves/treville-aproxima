import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { ChevronRight, Nfc } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { NfcPulse } from '@/components/nfc/NfcPulse';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Card } from '@/components/ui/Card';
import { setPendingRead } from '@/core/nfc/pendingRead';
import { formatUid } from '@/core/nfc/TagAnalyzer';
import { useNfc } from '@/hooks/useNfc';
import { push } from '@/lib/navigation';
import { useTheme } from '@/theme/ThemeContext';
import type { NfcTag } from '@/types/nfc';

export default function ScanScreen() {
  const { colors, fs } = useTheme();
  const nfc = useNfc();
  const nfcRef = useRef(nfc);
  const [tag, setTag] = useState<NfcTag | null>(null);

  useEffect(() => {
    const api = nfcRef.current;
    let alive = true;
    void api.registerTagEvent((found, records) => {
      if (!alive) {
        return;
      }
      setPendingRead(found, records);
      setTag(found);
    });
    return () => {
      alive = false;
      void api.unregisterTagEvent();
    };
  }, []);

  const detected = !!tag;

  return (
    <Screen>
      <AppHeader title="Detectando tag..." back />
      <View style={{ flex: 1, paddingHorizontal: 16, alignItems: 'center' }}>
        <NfcPulse active={!detected} />
        <Text style={{ color: colors.textPrimary, fontSize: fs(22), fontWeight: '800', marginTop: 8 }}>{detected ? 'TAG DETECTADA' : 'AGUARDANDO TAG'}</Text>
        <Text style={{ color: colors.textSecondary, marginTop: 6, textAlign: 'center' }}>Aproxime a tag NFC para continuar.</Text>
        {detected && tag ? (
          <View style={{ alignSelf: 'stretch', marginTop: 22, gap: 12 }}>
            <Card accessibilityLabel="Tag identificada" onPress={() => push('/read')} padding={14}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Nfc color={colors.primary} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Tag identificada</Text>
                  <Text style={{ color: colors.textSecondary }}>{tag.type}</Text>
                </View>
                <ChevronRight color={colors.textMuted} size={18} />
              </View>
            </Card>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Card style={{ flex: 1 }} padding={14}>
                <Text style={{ color: colors.textSecondary, fontSize: fs(12) }}>UID</Text>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', marginTop: 4 }}>{formatUid(tag.uid)}</Text>
              </Card>
              <Card style={{ flex: 1 }} padding={14}>
                <Text style={{ color: colors.textSecondary, fontSize: fs(12) }}>Capacidade</Text>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', marginTop: 4 }}>{tag.capacity} bytes</Text>
              </Card>
            </View>
          </View>
        ) : null}
        {nfc.simulationAvailable && nfc.simulateTag && !detected ? (
          <View style={{ marginTop: 24, alignSelf: 'stretch' }}>
            <PrimaryButton label="Modo de teste" variant="secondary" onPress={() => nfc.simulateTag?.('default')} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
