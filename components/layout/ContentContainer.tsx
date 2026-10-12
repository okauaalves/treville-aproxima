import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

export const CONTENT_WIDTH = {
  inner: 500,
  settings: 600,
  history: 700,
  admin: 700,
  home: 1000,
} as const;

/** Estilo de coluna centralizada; serve direto em contentContainerStyle de listas. */
export function contentColumn(maxWidth?: number): ViewStyle {
  return maxWidth ? { width: '100%', maxWidth, alignSelf: 'center' } : { width: '100%' };
}

/** Coluna centralizada com largura máxima. `maxWidth={null}` ocupa a largura toda. */
export function ContentContainer({
  children,
  maxWidth = CONTENT_WIDTH.inner,
  flex = true,
  style,
}: {
  children?: ReactNode;
  maxWidth?: number | null;
  flex?: boolean;
  style?: ViewStyle;
}) {
  return <View style={[contentColumn(maxWidth ?? undefined), flex ? { flex: 1 } : null, style]}>{children}</View>;
}
