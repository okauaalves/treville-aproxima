import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

/** Fundo sólido do tema. Sem gradiente e sem blur, no claro e no escuro. */
export function Screen({ children }: { children?: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>;
}
