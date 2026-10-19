import { Pressable, ScrollView, Text, View } from 'react-native';
import { Clock, Globe, House, LayoutGrid, QrCode, Settings } from 'lucide-react-native';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrevilleLogo } from '@/components/brand/TrevilleLogo';
import { APP_NAME } from '@/constants/config';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const ICONS = {
  index: House,
  history: Clock,
  templates: LayoutGrid,
  plaquinhas: QrCode,
  pagina: Globe,
  settings: Settings,
} as const;

const LABELS: Record<string, string> = {
  index: 'Início',
  history: 'Histórico',
  templates: 'Templates',
  plaquinhas: 'Plaquinhas',
  pagina: 'Página',
  settings: 'Ajustes',
};

/** Tab bar embaixo no celular; a partir de 600px vira sidebar à esquerda (rail de 96 no tablet, 220 com rótulos ao lado no bigTablet). */
export function BottomNavigation({ state, navigation }: BottomTabBarProps) {
  const { colors, fs } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTabletUp, isBigTablet, sidebarWidth } = useBreakpoint();

  const items = state.routes.map((route, index) => {
    const focused = state.index === index;
    const Icon = ICONS[route.name as keyof typeof ICONS] ?? House;
    const color = focused ? colors.primary : colors.textMuted;
    const label = LABELS[route.name] ?? route.name;
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };
    if (!isTabletUp) {
      return (
        <Pressable
          key={route.key}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: focused }}
          onPress={onPress}
          style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2 }}
        >
          <Icon color={color} size={22} strokeWidth={focused ? 2.4 : 2} />
          <Text style={[{ color, fontSize: fs(11) }, inter(focused ? 'bold' : 'medium')]}>{label}</Text>
        </Pressable>
      );
    }
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: isBigTablet ? 48 : 64,
          flexDirection: isBigTablet ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: isBigTablet ? 'flex-start' : 'center',
          gap: isBigTablet ? 12 : 4,
          paddingHorizontal: isBigTablet ? 14 : 4,
          paddingVertical: 8,
          borderRadius: radius.md,
          backgroundColor: focused ? colors.primaryGlow : pressed ? colors.surfaceElevated : 'transparent',
        })}
      >
        <Icon color={color} size={isBigTablet ? 22 : 24} strokeWidth={focused ? 2.4 : 2} />
        <Text numberOfLines={1} style={[{ color: focused ? colors.primary : colors.textSecondary, fontSize: isBigTablet ? fs(15) : fs(11) }, inter(focused ? 'bold' : 'medium')]}>
          {label}
        </Text>
      </Pressable>
    );
  });

  if (!isTabletUp) {
    return (
      <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8 }}>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>{items}</View>
      </View>
    );
  }

  return (
    <View
      testID="sidebar"
      style={{
        width: sidebarWidth + insets.left,
        paddingLeft: insets.left + (isBigTablet ? 16 : 8),
        paddingRight: isBigTablet ? 16 : 8,
        paddingTop: insets.top + 16,
        paddingBottom: Math.max(insets.bottom, 16),
        backgroundColor: colors.surface,
        borderRightWidth: 1,
        borderRightColor: colors.border,
      }}
    >
      <View
        accessibilityRole="header"
        accessibilityLabel={APP_NAME}
        style={{ flexDirection: isBigTablet ? 'row' : 'column', alignItems: 'center', gap: 10, paddingHorizontal: isBigTablet ? 6 : 0, marginBottom: 24 }}
      >
        <TrevilleLogo size={isBigTablet ? 32 : 36} color={colors.primary} />
        {isBigTablet ? (
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[{ fontSize: fs(18), color: colors.primary }, inter('bold')]}>Tréville</Text>
            <Text numberOfLines={1} style={[{ fontSize: fs(13), color: colors.textSecondary }, inter('semibold')]}>Aproxima</Text>
          </View>
        ) : null}
      </View>
      <ScrollView accessibilityRole="tablist" contentContainerStyle={{ gap: 6 }} showsVerticalScrollIndicator={false}>
        {items}
      </ScrollView>
    </View>
  );
}
