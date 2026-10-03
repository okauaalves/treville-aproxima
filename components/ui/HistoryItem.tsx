import { Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { TypeBadge } from '@/components/ui/TypeBadge';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { ContentType } from '@/theme/colors';

export function HistoryItem({ title, subtitle, type, onPress }: { title: string; subtitle: string; type: ContentType | string | null | undefined; onPress: () => void }) {
  const { colors, fs } = useTheme();
  return (
    <Card accessibilityLabel={title} onPress={onPress} padding={12} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TypeBadge type={type} />
        <View style={{ flex: 1 }}>
          <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>{title}</Text>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{subtitle}</Text>
        </View>
        <ChevronRight color={colors.textMuted} size={18} />
      </View>
    </Card>
  );
}
