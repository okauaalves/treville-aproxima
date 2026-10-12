import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { CircleCheck, CircleX } from 'lucide-react-native';

import { Modal } from '@/components/ui/Modal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StepProgress, type StepVisual } from '@/components/ui/StepProgress';
import { nfcManager } from '@/core/nfc/NfcManager';
import { OPERATION_STEPS, type TagOperation, type TagOperationResult } from '@/core/nfc/tagOperations';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { NfcSimulationKind } from '@/types/nfc';

/**
 * Executa uma operação (clone, travar, formatar, apagar) mostrando as etapas. `run` só é chamado
 * uma vez por abertura; fechar durante a espera cancela a sessão NFC.
 */
export function TagOperationModal({
  visible,
  operation,
  title,
  instruction,
  successText,
  simulateKind,
  run,
  onClose,
}: {
  visible: boolean;
  operation: TagOperation;
  title: string;
  instruction: string;
  successText: string;
  simulateKind?: NfcSimulationKind;
  run: (onStep: (stepId: string) => void) => Promise<TagOperationResult>;
  onClose: (result: TagOperationResult | null) => void;
}) {
  const { colors, fs } = useTheme();
  const steps = OPERATION_STEPS[operation];
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<TagOperationResult | null>(null);
  const runRef = useRef(run);

  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    if (!visible) {
      return;
    }
    let alive = true;
    void runRef.current((stepId) => {
      if (alive) {
        setActive(stepId);
      }
    }).then((outcome) => {
      if (alive) {
        setResult(outcome);
      }
    });
    return () => {
      alive = false;
    };
  }, [steps, visible]);

  const current = active ?? steps[0]?.id ?? null;
  const activeIndex = steps.findIndex((step) => step.id === current);
  const visual = steps.map((step, index) => {
    let status: StepVisual = 'pending';
    if (result?.success) {
      status = 'success';
    } else if (index < activeIndex) {
      status = 'success';
    } else if (index === activeIndex) {
      status = result && !result.success ? 'error' : 'active';
    }
    return { id: step.id, label: step.label, status, hint: index === 0 ? instruction : undefined };
  });
  const running = result === null;
  const waiting = running && current === steps[0]?.id;

  function close() {
    if (running) {
      void nfcManager.cancelRequest();
    }
    const outcome = result;
    setResult(null);
    setActive(null);
    onClose(outcome);
  }

  return (
    <Modal visible={visible} title={title} onClose={close}>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginBottom: 12 }, inter('medium')]}>{instruction}</Text>
      <StepProgress steps={visual} />
      {result?.success ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <CircleCheck color={colors.success} size={22} />
          <Text style={[{ flex: 1, color: colors.success, fontSize: fs(15) }, inter('bold')]}>{successText}</Text>
        </View>
      ) : null}
      {result && !result.success ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
          <CircleX color={colors.error} size={22} />
          <Text style={[{ flex: 1, color: colors.error, fontSize: fs(14) }, inter('semibold')]}>{result.error?.message ?? 'A operação não foi concluída.'}</Text>
        </View>
      ) : null}
      {waiting && simulateKind && nfcManager.isSimulation() ? (
        <PrimaryButton label="Simular tag (modo de teste)" variant="secondary" fullWidth style={{ marginTop: 10 }} onPress={() => nfcManager.simulateTag(simulateKind)} />
      ) : null}
      <PrimaryButton label={running ? 'Cancelar' : 'Fechar'} variant={running ? 'secondary' : 'primary'} fullWidth style={{ marginTop: 12 }} onPress={close} />
    </Modal>
  );
}
