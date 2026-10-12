import { Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';

import { withAlpha } from '@/theme/colors';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export function ReadOnlyBadge() {
  const { colors, fs } = useTheme();
  return (
    <View
      accessibilityLabel="Somente leitura"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: withAlpha(colors.warning, '22'), borderWidth: 1, borderColor: colors.warning }}
    >
      <Lock color={colors.warning} size={14} />
      <Text style={[{ color: colors.warning, fontSize: fs(12) }, inter('bold')]}>Somente leitura</Text>
    </View>
  );
}
