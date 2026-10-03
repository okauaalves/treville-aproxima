import { Pressable, Text, View } from 'react-native';
import { Clock, House, LayoutGrid, Settings } from 'lucide-react-native';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

const ICONS = {
  index: House,
  history: Clock,
  templates: LayoutGrid,
  settings: Settings,
} as const;

const LABELS: Record<string, string> = {
  index: 'Início',
  history: 'Histórico',
  templates: 'Templates',
  settings: 'Ajustes',
};

export function BottomNavigation({ state, navigation }: BottomTabBarProps) {
  const { colors, fs } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8 }}>
      <View style={{ flexDirection: 'row' }}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const Icon = ICONS[route.name as keyof typeof ICONS] ?? House;
          const color = focused ? colors.primary : colors.textMuted;
          const label = LABELS[route.name] ?? route.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={() => navigation.navigate(route.name)}
              style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2 }}
            >
              <Icon color={color} size={22} strokeWidth={focused ? 2.4 : 2} />
              <Text style={[{ color, fontSize: fs(11) }, inter(focused ? 'bold' : 'medium')]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
