import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Check, Minus } from 'lucide-react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export type StepVisual = 'pending' | 'active' | 'success' | 'error' | 'skipped';

export function StepProgress({ steps, note = false }: { steps: { id: string; label: string; hint?: string; status: StepVisual }[]; note?: boolean }) {
  const { colors } = useTheme();
  return (
    <View>
      {steps.map((step, index) => (
        <StepRow key={step.id} step={step} line={index < steps.length - 1} lineDone={step.status === 'success' && steps[index + 1]?.status === 'success'} />
      ))}
      {note ? <Text style={[{ color: colors.textMuted, marginTop: 8, fontSize: 12 }, inter('regular')]}>Etapas marcadas como não aplicáveis pertencem só à gravação.</Text> : null}
    </View>
  );
}

function StepRow({ step, line, lineDone }: { step: { label: string; hint?: string; status: StepVisual }; line: boolean; lineDone: boolean }) {
  const { colors, fs, reduceAnimations } = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (step.status !== 'active' || reduceAnimations) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(1.12, { duration: 700 }), -1, true);
  }, [pulse, reduceAnimations, step.status]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const done = step.status === 'success';
  const active = step.status === 'active';
  const failed = step.status === 'error';
  const skipped = step.status === 'skipped';
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ alignItems: 'center', width: 28 }}>
        <Animated.View
          style={[
            {
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: done ? colors.success : failed ? colors.error : active ? colors.primary : 'transparent',
              borderWidth: done || failed || active ? 0 : 1.5,
              borderColor: colors.border,
            },
            animated,
          ]}
        >
          {done ? <Check color={colors.onSuccess} size={16} strokeWidth={2.5} /> : null}
          {skipped ? <Minus color={colors.textMuted} size={14} /> : null}
        </Animated.View>
        {line ? <View style={{ width: 2, minHeight: 18, flex: 1, backgroundColor: lineDone ? colors.success : colors.border }} /> : null}
      </View>
      <View style={{ paddingBottom: 8, flex: 1 }}>
        <Text style={[{ color: active ? colors.primary : skipped ? colors.textMuted : failed ? colors.error : colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>{step.label}</Text>
        {active && step.hint ? <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{step.hint}</Text> : null}
        {skipped ? <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('regular')]}>Não se aplica</Text> : null}
      </View>
    </View>
  );
}
