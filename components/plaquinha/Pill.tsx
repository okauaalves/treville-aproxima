import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { ContentTypeColors } from '@/theme/colors';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export type PillTone = 'success' | 'primary' | 'muted' | 'warning' | 'violet';

export function Pill({ label, tone, icon }: { label: string; tone: PillTone; icon?: ReactNode }) {
  const { colors, fs, isDark } = useTheme();
  const violet = isDark ? ContentTypeColors.VCARD.dark : ContentTypeColors.VCARD.light;
  const palette = {
    success: { bg: colors.successBg, fg: colors.success },
    primary: { bg: colors.primaryGlow, fg: colors.primary },
    muted: { bg: colors.backgroundSecondary, fg: colors.textSecondary },
    warning: { bg: colors.warningBg, fg: colors.warning },
    violet: { bg: isDark ? 'rgba(167,139,250,0.16)' : 'rgba(124,58,237,0.10)', fg: violet },
  }[tone];
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: palette.bg }}>
      {icon}
      <Text style={[{ color: palette.fg, fontSize: fs(12) }, inter('bold')]}>{label}</Text>
    </View>
  );
}
