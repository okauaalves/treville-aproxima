import { Text, View, type ViewStyle } from 'react-native';

import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

/** Contador vermelho (ex.: pedidos de acesso pendentes). Acima de 99 mostra "99+". */
export function CountBadge({ count, style }: { count: number; style?: ViewStyle }) {
  const { colors, fs } = useTheme();
  if (count <= 0) {
    return null;
  }
  return (
    <View
      testID="count-badge"
      style={[{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surfaceElevated }, style]}
    >
      <Text style={[{ color: colors.onDanger, fontSize: fs(11), lineHeight: fs(13) }, inter('bold')]}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}
