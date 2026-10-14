import { Text, View } from 'react-native';
import { Clock, Lock, ShieldX, TimerOff } from 'lucide-react-native';

import { Pill } from '@/components/plaquinha/Pill';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { editBadge, type EditRequestRow } from '@/lib/editAccessLogic';
import { formatDateTimePtBr } from '@/lib/plaquinhaLogic';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

/** Pedido ainda sem acesso (aguardando, negado, revogado ou vencido): a plaquinha não é visível. */
export function EditRequestCard({ request, onRequestAgain }: { request: EditRequestRow; onRequestAgain: () => void }) {
  const { colors, fs } = useTheme();
  const badge = editBadge(request);
  const tint = { warning: colors.warning, success: colors.success, error: colors.error, muted: colors.textSecondary }[badge.tone];
  const Icon = badge.kind === 'waiting' ? Clock : badge.kind === 'expired' ? TimerOff : ShieldX;
  return (
    <Card padding={16} style={{ marginBottom: 12 }}>
      <View testID="edit-request-card" style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
            <Lock color={colors.textSecondary} size={18} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>
              {request.link_name || request.link_id}
            </Text>
            <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('medium')]}>
              {request.link_id} · pedido em {formatDateTimePtBr(request.requested_at)}
            </Text>
          </View>
          <Pill label={badge.label} tone={badge.tone} icon={<Icon color={tint} size={12} />} />
        </View>
        <Text style={[{ color: tint, fontSize: fs(13) }, inter('semibold')]}>{badge.detail}</Text>
        {badge.canRequestAgain ? (
          <PrimaryButton label="Solicitar novamente" variant="secondary" fullWidth accessibilityLabel={`Solicitar novamente acesso a ${request.link_name}`} onPress={onRequestAgain} />
        ) : null}
      </View>
    </Card>
  );
}
