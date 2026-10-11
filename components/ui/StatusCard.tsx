import { Text, View } from 'react-native';
import { Nfc } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export function StatusCard({ title, subtitle, blur = false }: { title: string; subtitle: string; blur?: boolean }) {
  const { colors, fs, isDark } = useTheme();
  return (
    <Card padding={14} blur={blur}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? colors.surfaceElevated : colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
          <Nfc color={colors.primary} size={22} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>{title}</Text>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{subtitle}</Text>
        </View>
      </View>
    </Card>
  );
}
