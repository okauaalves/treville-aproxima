import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export type PillTone = 'success' | 'primary' | 'muted' | 'warning';

export function Pill({ label, tone, icon }: { label: string; tone: PillTone; icon?: ReactNode }) {
  const { colors, fs } = useTheme();
  const palette = {
    success: { bg: colors.successBg, fg: colors.success },
    primary: { bg: colors.primaryGlow, fg: colors.primary },
    muted: { bg: colors.backgroundSecondary, fg: colors.textSecondary },
    warning: { bg: colors.warningBg, fg: colors.warning },
  }[tone];
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: palette.bg }}>
      {icon}
      <Text style={[{ color: palette.fg, fontSize: fs(12) }, inter('bold')]}>{label}</Text>
    </View>
  );
}
