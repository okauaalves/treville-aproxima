import { Tabs } from 'expo-router';

import { BottomNavigation } from '@/components/ui/BottomNavigation';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useLaunchTag } from '@/hooks/useLaunchTag';
import { useTheme } from '@/theme/ThemeContext';

export default function TabsLayout() {
  const { reduceAnimations } = useTheme();
  const { isTabletUp } = useBreakpoint();
  useLaunchTag();
  return (
    <Tabs
      tabBar={(props) => <BottomNavigation {...props} />}
      screenOptions={{ headerShown: false, animation: reduceAnimations ? 'none' : 'fade', tabBarPosition: isTabletUp ? 'left' : 'bottom' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="history" options={{ title: 'Histórico' }} />
      <Tabs.Screen name="templates" options={{ title: 'Templates' }} />
      <Tabs.Screen name="plaquinhas" options={{ title: 'Plaquinhas' }} />
      <Tabs.Screen name="pagina" options={{ title: 'Minha Página' }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
