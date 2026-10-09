import { Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Animated from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { TypeBadge } from '@/components/ui/TypeBadge';
import { inter } from '@/theme/fonts';
import { listEntering } from '@/theme/enter';
import { useTheme } from '@/theme/ThemeContext';
import type { ContentType } from '@/theme/colors';

export function HistoryItem({
  title,
  subtitle,
  type,
  onPress,
  index = 0,
}: {
  title: string;
  subtitle: string;
  type: ContentType | string | null | undefined;
  onPress: () => void;
  index?: number;
}) {
  const { colors, fs, reduceAnimations } = useTheme();
  return (
    <Animated.View entering={listEntering(index, reduceAnimations)}>
      <Card accessibilityLabel={title} onPress={onPress} padding={12} shimmer={index < 6} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TypeBadge type={type} />
          <View style={{ flex: 1 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>{title}</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{subtitle}</Text>
          </View>
          <ChevronRight color={colors.textMuted} size={18} />
        </View>
      </Card>
    </Animated.View>
  );
}
