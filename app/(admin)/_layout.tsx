import { Redirect, Stack } from 'expo-router';

import { isAdminUser } from '@/lib/adminAccess';
import { useAuthStore } from '@/stores/authStore';

export default function AdminLayout() {
  const user = useAuthStore((state) => state.user);
  if (!isAdminUser(user)) {
    return <Redirect href="/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
