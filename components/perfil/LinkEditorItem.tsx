import { Pressable, Text, View } from 'react-native';
import { ArrowDown, ArrowUp, Trash } from 'lucide-react-native';

import { ProfileLinkIcon } from '@/components/perfil/ProfileIcons';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { presetFor, type ProfileLink } from '@/lib/perfilLogic';
import { LINK_TITLE_MAX } from '@/supabase/functions/_shared/profilePage';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

function SmallButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.35 : 1, backgroundColor: pressed ? colors.primaryGlow : colors.surfaceElevated })}
    >
      {children}
    </Pressable>
  );
}

export function LinkEditorItem({
  link,
  index,
  total,
  error,
  onChange,
  onMove,
  onRemove,
}: {
  link: ProfileLink;
  index: number;
  total: number;
  error?: string;
  onChange: (patch: Partial<ProfileLink>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { colors, fs } = useTheme();
  const preset = presetFor(link.icon);
  const label = link.title.trim() || preset.label;
  return (
    <Card padding={14} style={{ marginBottom: 12, opacity: link.is_active ? 1 : 0.7 }}>
      <View testID="profile-link-item" style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryGlow, alignItems: 'center', justifyContent: 'center' }}>
            <ProfileLinkIcon icon={link.icon} color={colors.primary} />
          </View>
          <Text numberOfLines={1} style={[{ flex: 1, color: colors.textSecondary, fontSize: fs(12) }, inter('bold')]}>
            {index + 1}. {preset.label}
          </Text>
          <Toggle value={link.is_active} onValueChange={(value) => onChange({ is_active: value })} accessibilityLabel={link.is_active ? `Ocultar ${label}` : `Mostrar ${label}`} />
        </View>
        <Input label="Título" value={link.title} onChangeText={(title) => onChange({ title: title.slice(0, LINK_TITLE_MAX) })} maxLength={LINK_TITLE_MAX} containerStyle={{ marginBottom: 0 }} />
        <Input
          label="Link"
          value={link.url}
          onChangeText={(url) => onChange({ url })}
          placeholder={preset.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={link.icon === 'phone' || link.icon === 'whatsapp' ? 'phone-pad' : link.icon === 'email' ? 'email-address' : 'url'}
          error={error}
          containerStyle={{ marginBottom: 0 }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SmallButton label={`Subir ${label}`} disabled={index === 0} onPress={() => onMove(-1)}>
            <ArrowUp color={colors.primary} size={18} />
          </SmallButton>
          <SmallButton label={`Descer ${label}`} disabled={index === total - 1} onPress={() => onMove(1)}>
            <ArrowDown color={colors.primary} size={18} />
          </SmallButton>
          <View style={{ flex: 1 }} />
          <SmallButton label={`Excluir ${label}`} onPress={onRemove}>
            <Trash color={colors.error} size={18} />
          </SmallButton>
        </View>
      </View>
    </Card>
  );
}
