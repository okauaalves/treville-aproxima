import { Lock, LogOut } from 'lucide-react-native';

import { AccessNotice } from '@/components/access/AccessNotice';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/ThemeContext';

export default function AccessDeniedScreen() {
  const { colors } = useTheme();
  const email = useAuthStore((state) => state.user?.email);
  return (
    <AccessNotice
      testID="access-denied"
      icon={<Lock color={colors.error} size={40} strokeWidth={2} />}
      tint={colors.error}
      tintBg={colors.errorBg}
      title="Acesso negado"
      lines={['Sua conta foi bloqueada.', 'Entre em contato para mais informações.']}
      email={email}
    >
      <PrimaryButton label="Sair" variant="ghost" fullWidth icon={<LogOut color={colors.primary} size={18} />} onPress={() => void useAuthStore.getState().signOut()} />
    </AccessNotice>
  );
}
