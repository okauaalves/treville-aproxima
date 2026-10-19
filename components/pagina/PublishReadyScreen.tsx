import { Image, Text, View } from 'react-native';

import { BrandPagePreview } from '@/components/pagina/BrandPagePreview';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import type { BrandLinkDraft } from '@/lib/brandLinkLogic';
import { LINK_DEFS } from '@/lib/brandLinkLogic';
import type { BrandPage, BrandThemeMode } from '@/lib/brandPages';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const THEME_LABEL: Record<BrandThemeMode, string> = {
  dark: 'Escuro',
  light: 'Claro',
  balanced: 'Equilibrado',
};

type Props = {
  page: BrandPage;
  brandName: string;
  themeMode: BrandThemeMode;
  links: BrandLinkDraft[];
  previewHtml: string;
  publicUrl: string | null;
  publishing: boolean;
  onPublish: () => void;
  onContinueEditing: () => void;
};

export function PublishReadyScreen({
  page,
  brandName,
  themeMode,
  links,
  previewHtml,
  publicUrl,
  publishing,
  onPublish,
  onContinueEditing,
}: Props) {
  const { colors, fs } = useTheme();
  const active = links.filter((link) => link.is_active && link.destination_url.trim());

  return (
    <View style={{ gap: 16, marginTop: 8 }}>
      <Text style={[{ color: colors.textPrimary, fontSize: fs(22) }, inter('extrabold')]}>Sua página está pronta</Text>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(14), lineHeight: fs(20) }, inter('regular')]}>
        Confira a prévia e publique quando quiser
      </Text>

      <BrandPagePreview html={previewHtml} height={420} />

      <Card padding={16}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {page.logo_url ? (
            <Image
              source={{ uri: page.logo_url }}
              style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceElevated }}
              resizeMode="contain"
            />
          ) : null}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>{brandName || 'Minha Página'}</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>
              Tema {THEME_LABEL[themeMode]} · {active.length} canal{active.length === 1 ? '' : 'is'}
            </Text>
          </View>
        </View>
        {active.length > 0 ? (
          <View style={{ marginTop: 12, gap: 6 }}>
            {active.map((link) => {
              const title = LINK_DEFS.find((d) => d.type === link.link_type)?.title ?? link.label;
              return (
                <Text key={link.link_type} style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('medium')]}>
                  • {title}
                </Text>
              );
            })}
          </View>
        ) : null}
        {publicUrl ? (
          <Text style={[{ color: colors.primary, fontSize: fs(12), marginTop: 12 }, inter('semibold')]} selectable>
            {publicUrl}
          </Text>
        ) : (
          <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginTop: 12 }, inter('regular')]}>
            Vincule uma plaquinha depois para ter um endereço público fixo.
          </Text>
        )}
      </Card>

      <PrimaryButton label={publishing ? 'Publicando…' : 'Publicar minha página'} onPress={onPublish} loading={publishing} disabled={publishing} fullWidth />
      <SecondaryButton label="Continuar editando" onPress={onContinueEditing} disabled={publishing} fullWidth />
    </View>
  );
}
