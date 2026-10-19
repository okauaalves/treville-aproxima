import { Text, View } from 'react-native';
import { Camera, Check, Globe, Link2, MessageCircle, Share2, Star } from 'lucide-react-native';

import type { BrandLinkDraft, BrandLinkType } from '@/lib/brandLinkLogic';
import { LINK_DEFS, normalizeBrandLinkInput } from '@/lib/brandLinkLogic';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { DESCRIPTION_MAX } from '@/supabase/functions/_shared/brandPageRenderer';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const ICONS: Record<BrandLinkType, typeof Globe> = {
  social: Share2,
  instagram: Camera,
  google_reviews: Star,
  portfolio: Link2,
  about: Globe,
  contact: MessageCircle,
};

const DESCRIPTION_PLACEHOLDERS: Record<BrandLinkType, string> = {
  social: 'Ex.: Conecte-se comigo',
  instagram: 'Ex.: Acompanhe meu dia',
  google_reviews: 'Ex.: Veja o que dizem',
  portfolio: 'Ex.: Projetos e trabalhos',
  about: 'Ex.: Conheça minha história',
  contact: 'Ex.: Fale comigo',
};

type Props = {
  draft: BrandLinkDraft;
  onChangeRaw: (raw: string) => void;
  onChangeDescription: (description: string) => void;
  onToggle: (active: boolean) => void;
};

export function LinkEditorCard({ draft, onChangeRaw, onChangeDescription, onToggle }: Props) {
  const { colors, fs } = useTheme();
  const def = LINK_DEFS.find((item) => item.type === draft.link_type)!;
  const Icon = ICONS[draft.link_type];
  const normalized = normalizeBrandLinkInput(draft.link_type, draft.raw);
  const filled = normalized.ok && Boolean(normalized.url);
  const error = !normalized.ok ? normalized.error : undefined;

  return (
    <Card padding={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.md,
            backgroundColor: colors.primaryGlow,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon color={colors.primary} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>{def.title}</Text>
          <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('regular')]}>{def.hint}</Text>
        </View>
        {filled ? (
          <View
            accessibilityLabel="Preenchido"
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.successBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check color={colors.success} size={16} strokeWidth={2.5} />
          </View>
        ) : (
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }} />
        )}
        <Toggle value={draft.is_active} onValueChange={onToggle} accessibilityLabel={`Ativar ${def.title}`} />
      </View>
      <View style={{ gap: 10 }}>
        <Input
          label="Subtítulo (opcional)"
          value={draft.description}
          onChangeText={(value) => onChangeDescription(value.slice(0, DESCRIPTION_MAX))}
          maxLength={DESCRIPTION_MAX}
          placeholder={DESCRIPTION_PLACEHOLDERS[draft.link_type]}
          editable={draft.is_active}
          containerStyle={{ marginBottom: 0 }}
        />
        <Input
          label="URL / destino"
          value={draft.raw}
          onChangeText={onChangeRaw}
          placeholder={def.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={draft.link_type === 'contact' ? 'phone-pad' : 'url'}
          error={error}
          editable={draft.is_active}
          containerStyle={{ marginBottom: 0 }}
        />
      </View>
    </Card>
  );
}