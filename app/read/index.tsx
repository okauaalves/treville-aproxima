import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { ExpoGoBanner } from '@/components/nfc/ExpoGoBanner';
import { Card } from '@/components/ui/Card';
import { StepProgress, type StepVisual } from '@/components/ui/StepProgress';
import { nfcManager } from '@/core/nfc/NfcManager';
import { getPendingRead, setPendingRead } from '@/core/nfc/pendingRead';
import { useNfc } from '@/hooks/useNfc';
import { replace } from '@/lib/navigation';
import { READ_RESULT_ROUTE } from '@/lib/readResult';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

/** Leitura mostra as 9 etapas do mockup. Só Detectar, Identificar e Analisar avançam; as demais ficam como círculos vazios, sem serem marcadas como concluídas. */
const STEPS = [
  { id: 'detect', label: 'Detectar', applies: true },
  { id: 'identify', label: 'Identificar', applies: true },
  { id: 'analyze', label: 'Analisar', hint: 'Lendo dados NDEF...', applies: true },
  { id: 'configure', label: 'Configurar', applies: false },
  { id: 'validate', label: 'Validar', applies: false },
  { id: 'write', label: 'Gravar', applies: false },
  { id: 'reread', label: 'Reler', applies: false },
  { id: 'compare', label: 'Comparar', applies: false },
  { id: 'confirm', label: 'Confirmar', applies: false },
];

export default function ReadingScreen() {
  const { colors, fs, reduceAnimations } = useTheme();
  const nfc = useNfc();
  const nfcRef = useRef(nfc);
  const [active, setActive] = useState(0);
  const [records, setRecords] = useState(getPendingRead()?.records.length ?? 0);
  const [failed, setFailed] = useState<string | null>(null);
  const applicable = STEPS.filter((step) => step.applies);

  useEffect(() => {
    let alive = true;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, reduceAnimations ? 40 : ms));
    void (async () => {
      try {
        let pending = getPendingRead();
        if (!pending) {
          const result = await nfcRef.current.startRead();
          nfcManager.lockReading();
          pending = { tag: result.tag, records: result.records };
          setPendingRead(result.tag, result.records);
        }
        if (!alive) {
          return;
        }
        setRecords(pending.records.length);
        for (let index = 0; index < applicable.length; index += 1) {
          setActive(index);
          await wait(index === 2 ? 900 : 280);
          if (!alive) {
            return;
          }
        }
        setActive(applicable.length);
        await nfcRef.current.persistRead(pending.tag, pending.records);
        if (alive) {
          replace(READ_RESULT_ROUTE);
        }
      } catch (error) {
        if (alive) {
          setFailed(error instanceof Error ? error.message : 'Falha na leitura');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [applicable.length, reduceAnimations]);

  const steps = STEPS.map((step) => {
    if (!step.applies) {
      return { id: step.id, label: step.label, status: 'pending' as StepVisual };
    }
    const index = applicable.findIndex((item) => item.id === step.id);
    let status: StepVisual = 'pending';
    if (failed && index === active) {
      status = 'error';
    } else if (index < active) {
      status = 'success';
    } else if (index === active) {
      status = 'active';
    }
    return { id: step.id, label: step.label, hint: step.hint, status };
  });

  return (
    <Screen>
      <AppHeader title="Lendo tag..." back />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}>
        <ExpoGoBanner />
        <StepProgress steps={steps} />
        {failed ? <Text style={[{ color: colors.error, marginTop: 12 }, inter('medium')]}>{failed}</Text> : null}
        <Card padding={14} style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <FileText color={colors.primary} size={20} />
            <View>
              <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>Dados encontrados</Text>
              <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{records === 1 ? '1 registro NDEF' : `${records} registros NDEF`}</Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
