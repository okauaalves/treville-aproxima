import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChartColumn, IdCard, Nfc, Pencil, QrCode, ShieldCheck } from 'lucide-react-native';
import Animated from 'react-native-reanimated';

import { DestinationIcon } from '@/components/plaquinha/DestinoForm';
import { Pill } from '@/components/plaquinha/Pill';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import type { EditBadge } from '@/lib/editAccessLogic';
import { isDestinationType, SYNC_LABELS, syncStatus, type RedirectLink } from '@/lib/plaquinhaLogic';
import { listEntering } from '@/theme/enter';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

function Action({ label, icon, onPress, a11yLabel }: { label: string; icon: ReactNode; onPress: () => void; a11yLabel?: string }) {
  const { colors, fs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 4,
        paddingVertical: 8,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.primaryGlow : colors.surfaceElevated,
      })}
    >
      {icon}
      <Text numberOfLines={1} style={[{ color: colors.primary, fontSize: fs(12) }, inter('bold')]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PlaquinhaCard({
  link,
  index,
  onEdit,
  onQr,
  onWrite,
  onToggle,
  onProfile,
  onStats,
  access,
}: {
  link: RedirectLink;
  index: number;
  onEdit: () => void;
  onQr: () => void;
  onWrite: () => void;
  onToggle?: (next: boolean) => void;
  onProfile?: () => void;
  onStats: () => void;
  /** Plaquinha de outro usuário com edição autorizada: só destino, QR e NFC. */
  access?: EditBadge;
}) {
  const { colors, fs, reduceAnimations } = useTheme();
  const type = isDestinationType(link.destination_type) ? link.destination_type : 'url';
  const shared = access !== undefined;
  return (
    <Animated.View entering={listEntering(index, reduceAnimations)}>
      <Card padding={16} style={{ marginBottom: 12 }}>
        <View testID={shared ? 'plaquinha-card-shared' : 'plaquinha-card'} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <DestinationIcon type={type} size={40} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>
                {link.name}
              </Text>
              <Text numberOfLines={1} ellipsizeMode="middle" style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>
                {link.destination_type === 'empty' ? 'Sem destino' : link.destination_url}
              </Text>
            </View>
            {onToggle && !shared ? (
              <Toggle value={link.is_active} onValueChange={onToggle} accessibilityLabel={link.is_active ? `Desativar ${link.name}` : `Ativar ${link.name}`} />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {access ? <Pill label={access.label} tone={access.tone} icon={<ShieldCheck color={colors.success} size={12} />} /> : null}
            {link.nfc_synced ? <Pill label="NFC" tone="success" /> : null}
            <Pill label="QR" tone="primary" />
            {link.profile_enabled ? <Pill label="Perfil ativo" tone="violet" /> : <Pill label="Link direto" tone="primary" />}
            {!link.is_active ? <Pill label="Inativa" tone="muted" /> : null}
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver stats de ${link.name}: ${link.scan_count} scans, ${SYNC_LABELS[syncStatus(link)]}`}
              onPress={onStats}
              hitSlop={8}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: pressed ? colors.primaryGlow : 'transparent' })}
            >
              <ChartColumn color={colors.primary} size={14} />
              <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('semibold')]}>
                {link.scan_count} {link.scan_count === 1 ? 'scan' : 'scans'} · {SYNC_LABELS[syncStatus(link)]}
              </Text>
              <Text style={[{ color: colors.primary, fontSize: fs(12) }, inter('bold')]}>· Ver stats</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action label="Editar" icon={<Pencil color={colors.primary} size={16} />} onPress={onEdit} />
            <Action label="QR Code" icon={<QrCode color={colors.primary} size={16} />} onPress={onQr} />
            <Action label="Gravar NFC" icon={<Nfc color={colors.primary} size={16} />} onPress={onWrite} />
            {onProfile && !shared ? <Action label="Perfil" a11yLabel={`Editar perfil de ${link.name}`} icon={<IdCard color={colors.primary} size={16} />} onPress={onProfile} /> : null}
          </View>
          {access?.kind === 'authorized' ? (
            <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('medium')]}>{access.detail} · compartilhada com você</Text>
          ) : null}
        </View>
      </Card>
    </Animated.View>
  );
}
