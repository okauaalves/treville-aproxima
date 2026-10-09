import { Tabs } from 'expo-router';

import { BottomNavigation } from '@/components/ui/BottomNavigation';
import { useTheme } from '@/theme/ThemeContext';

export default function TabsLayout() {
  const { reduceAnimations } = useTheme();
  return (
    <Tabs tabBar={(props) => <BottomNavigation {...props} />} screenOptions={{ headerShown: false, animation: reduceAnimations ? 'none' : 'fade' }}>
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="history" options={{ title: 'Histórico' }} />
      <Tabs.Screen name="templates" options={{ title: 'Templates' }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
