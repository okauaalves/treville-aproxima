import { ActivityIndicator, View } from 'react-native';
import { Redirect, type Href } from 'expo-router';

import { decideGate, gateRoute } from '@/lib/access';
import { decideInitialRoute } from '@/lib/bootRoute';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAccessStore } from '@/stores/accessStore';
import { useAuthStore } from '@/stores/authStore';
import { useBootStore } from '@/stores/bootStore';
import { useTheme } from '@/theme/ThemeContext';

export default function Index() {
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const onboardingSeen = useBootStore((state) => state.onboardingSeen);
  const status = useAccessStore((state) => (state.userId === (user?.id ?? null) ? state.status : null));
  const gate = decideGate({ configured: isSupabaseConfigured, hasUser: Boolean(user), status });
  const initial = decideInitialRoute({ onboardingSeen, hasSession: Boolean(user) });
  if (initial === '/(tabs)' && gate === 'checking') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Verificando acesso" />
      </View>
    );
  }
  const href: Href = initial === '/(tabs)' ? ((gateRoute(gate) ?? initial) as Href) : initial;
  return <Redirect href={href} />;
}
