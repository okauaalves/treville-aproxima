import { Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Animated from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { TypeBadge } from '@/components/ui/TypeBadge';
import { inter } from '@/theme/fonts';
import { listEntering } from '@/theme/enter';
import type { ContentType } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';

export function TemplateCard({
  title,
  subtitle,
  type,
  onPress,
  index = 0,
  iconName,
  tint,
  variant = 'row',
  compact = false,
}: {
  title: string;
  subtitle: string;
  type: ContentType;
  onPress: () => void;
  index?: number;
  iconName?: string | null;
  tint?: string | null;
  /** `grid` empilha ícone, nome e descrição e estica até a altura da linha. */
  variant?: 'row' | 'grid';
  /** Grid em telas < 380px: menos padding e ícone menor para caber 2 colunas. */
  compact?: boolean;
}) {
  const { colors, fs, reduceAnimations } = useTheme();
  if (variant === 'grid') {
    return (
      <Animated.View entering={listEntering(index, reduceAnimations)} style={{ flex: 1 }}>
        <Card accessibilityLabel={title} onPress={onPress} padding={compact ? 12 : 16} shimmer={index < 6} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: compact ? 10 : 12 }}>
            <View style={{ flex: 1 }}>
              <TypeBadge type={type} iconName={iconName} tint={tint} size={compact ? 36 : 44} />
            </View>
            <ChevronRight color={colors.textMuted} size={16} />
          </View>
          <Text numberOfLines={2} style={[{ color: colors.textPrimary, fontSize: fs(15), lineHeight: fs(20) }, inter('bold')]}>
            {title}
          </Text>
          <Text numberOfLines={2} style={[{ color: colors.textSecondary, fontSize: fs(13), lineHeight: fs(18), marginTop: 2 }, inter('regular')]}>
            {subtitle}
          </Text>
        </Card>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={listEntering(index, reduceAnimations)}>
      <Card accessibilityLabel={title} onPress={onPress} padding={12} shimmer={index < 6} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TypeBadge type={type} iconName={iconName} tint={tint} />
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
