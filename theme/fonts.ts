import type { TextStyle } from 'react-native';

/** Famílias carregadas por @expo-google-fonts/inter antes do splash sumir. */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export function inter(weight: keyof typeof fontFamily = 'regular'): TextStyle {
  return { fontFamily: fontFamily[weight] };
}
