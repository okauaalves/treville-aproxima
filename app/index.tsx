import { Redirect } from 'expo-router';

import { decideInitialRoute } from '@/lib/bootRoute';
import { useAuthStore } from '@/stores/authStore';
import { useBootStore } from '@/stores/bootStore';

export default function Index() {
  const user = useAuthStore((state) => state.user);
  const onboardingSeen = useBootStore((state) => state.onboardingSeen);
  return <Redirect href={decideInitialRoute({ onboardingSeen, hasSession: Boolean(user) })} />;
}
