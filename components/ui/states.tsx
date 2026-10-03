import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { CircleAlert, CircleCheck, Inbox } from 'lucide-react-native';

import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export function EmptyState({ title, message }: { title: string; message: string }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
      <Inbox color={colors.textMuted} size={28} />
      <Text style={[{ color: colors.textPrimary, fontSize: fs(16), textAlign: 'center' }, inter('bold')]}>{title}</Text>
      <Text style={[{ color: colors.textSecondary, textAlign: 'center' }, inter('regular')]}>{message}</Text>
    </View>
  );
}

export function LoadingState({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[{ color: colors.textSecondary }, inter('medium')]}>{label}</Text>
    </View>
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  const { colors, fs } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', padding: 24, gap: 8 }}>
      <CircleAlert color={colors.error} size={28} />
      <Text style={[{ color: colors.error, fontSize: fs(16), textAlign: 'center' }, inter('bold')]}>{title}</Text>
      <Text style={[{ color: colors.textSecondary, textAlign: 'center' }, inter('regular')]}>{message}</Text>
    </View>
  );
}

export function SuccessState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 8, gap: 8 }}>
      <CircleCheck color={colors.success} size={36} />
      <Text style={[{ color: colors.success, fontSize: fs(18), textAlign: 'center' }, inter('extrabold')]}>{title}</Text>
      <Text style={[{ color: colors.textSecondary, textAlign: 'center' }, inter('regular')]}>{message}</Text>
      {action}
    </View>
  );
}
