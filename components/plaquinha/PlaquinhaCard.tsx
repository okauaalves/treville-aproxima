import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChartColumn, IdCard, Nfc, Pencil, QrCode } from 'lucide-react-native';
import Animated from 'react-native-reanimated';

import { DestinationIcon } from '@/components/plaquinha/DestinoForm';
import { Pill } from '@/components/plaquinha/Pill';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
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
}: {
  link: RedirectLink;
  index: number;
  onEdit: () => void;
  onQr: () => void;
  onWrite: () => void;
  onToggle: (next: boolean) => void;
  onProfile: () => void;
}) {
  const { colors, fs, reduceAnimations } = useTheme();
  const type = isDestinationType(link.destination_type) ? link.destination_type : 'url';
  return (
    <Animated.View entering={listEntering(index, reduceAnimations)}>
      <Card padding={16} style={{ marginBottom: 12 }}>
        <View testID="plaquinha-card" style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <DestinationIcon type={type} size={40} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>
                {link.name}
              </Text>
              <Text numberOfLines={1} ellipsizeMode="middle" style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>
                {link.destination_url}
              </Text>
            </View>
            <Toggle value={link.is_active} onValueChange={onToggle} accessibilityLabel={link.is_active ? `Desativar ${link.name}` : `Ativar ${link.name}`} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {link.nfc_synced ? <Pill label="NFC" tone="success" /> : null}
            <Pill label="QR" tone="primary" />
            {link.profile_enabled === undefined ? null : link.profile_enabled ? <Pill label="Perfil ativo" tone="violet" /> : <Pill label="Link direto" tone="primary" />}
            {!link.is_active ? <Pill label="Inativa" tone="muted" /> : null}
            <View style={{ flex: 1 }} />
            <View accessible accessibilityLabel={`${link.scan_count} scans, ${SYNC_LABELS[syncStatus(link)]}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ChartColumn color={colors.textMuted} size={14} />
              <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('semibold')]}>
                {link.scan_count} {link.scan_count === 1 ? 'scan' : 'scans'} · {SYNC_LABELS[syncStatus(link)]}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action label="Editar" icon={<Pencil color={colors.primary} size={16} />} onPress={onEdit} />
            <Action label="QR Code" icon={<QrCode color={colors.primary} size={16} />} onPress={onQr} />
            <Action label="Gravar NFC" icon={<Nfc color={colors.primary} size={16} />} onPress={onWrite} />
            <Action label="Perfil" a11yLabel={`Editar perfil de ${link.name}`} icon={<IdCard color={colors.primary} size={16} />} onPress={onProfile} />
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}
