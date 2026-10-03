import { Text } from 'react-native';

import { StepProgress, type StepVisual } from '@/components/ui/StepProgress';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { WriteStep } from '@/types/nfc';

const VISIBLE = ['prepare', 'write', 'reread', 'interpret', 'compare', 'confirm'] as const;

export function WriteProgress({ steps }: { steps: WriteStep[] }) {
  const { colors } = useTheme();
  const detecting = steps.find((step) => step.id === 'detect');
  const visible = VISIBLE.map((id) => steps.find((step) => step.id === id)).filter((step): step is WriteStep => !!step);
  return (
    <>
      {detecting?.status === 'active' ? (
        <Text style={[{ color: colors.primary, marginBottom: 12 }, inter('semibold')]}>Aproxime a tag para gravar</Text>
      ) : null}
      <StepProgress
        steps={visible.map((step) => ({
          id: step.id,
          label: step.label,
          status: step.status as StepVisual,
        }))}
      />
    </>
  );
}
