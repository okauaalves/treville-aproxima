import { useState } from 'react';
import { Clock, LogOut, RefreshCw } from 'lucide-react-native';

import { AccessNotice } from '@/components/access/AccessNotice';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useAccessStore } from '@/stores/accessStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { useTheme } from '@/theme/ThemeContext';

/** Não promete e-mail de aprovação: o servidor não envia. O gate libera sozinho ao verificar de novo. */
export default function WaitingApprovalScreen() {
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const status = useAccessStore((state) => state.status);
  const [checking, setChecking] = useState(false);
  const offline = status === 'unknown';

  async function checkAgain() {
    setChecking(true);
    await useAccessStore.getState().refresh(user?.id ?? null);
    setChecking(false);
    const next = useAccessStore.getState().status;
    if (next === 'pending') {
      useToastStore.getState().show('Seu acesso ainda está em análise.', 'info');
    } else if (next === 'unknown') {
      useToastStore.getState().show('Sem conexão com o servidor. Tente de novo.', 'warning');
    }
  }

  return (
    <AccessNotice
      testID="waiting-approval"
      icon={<Clock color={colors.warning} size={40} strokeWidth={2} />}
      tint={colors.warning}
      tintBg={colors.warningBg}
      title={offline ? 'Não foi possível verificar' : 'Acesso solicitado!'}
      lines={
        offline
          ? ['Não conseguimos confirmar seu acesso agora.', 'Verifique a conexão e tente de novo.']
          : ['Seu acesso está sendo analisado.', 'Você poderá entrar assim que for aprovado.']
      }
      email={user?.email}
    >
      <PrimaryButton label="Verificar novamente" fullWidth loading={checking} icon={<RefreshCw color={colors.onPrimary} size={18} />} onPress={() => void checkAgain()} />
      <PrimaryButton label="Sair" variant="ghost" fullWidth icon={<LogOut color={colors.primary} size={18} />} onPress={() => void useAuthStore.getState().signOut()} />
    </AccessNotice>
  );
}
