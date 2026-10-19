import { Pressable, Text, View } from 'react-native';

import { BrandPagePreview } from '@/components/pagina/BrandPagePreview';
import type { BrandThemeMode } from '@/lib/brandPages';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const THEMES: { mode: BrandThemeMode; label: string }[] = [
  { mode: 'dark', label: 'Escuro' },
  { mode: 'light', label: 'Claro' },
  { mode: 'balanced', label: 'Equilibrado' },
];

type Props = {
  selected: BrandThemeMode;
  thumbHtml: Record<BrandThemeMode, string>;
  primaryColor?: string | null;
  onSelect: (mode: BrandThemeMode) => void;
};

/** Miniaturas estáticas (HTML cacheado) — um toque aplica o tema no rascunho. */
export function ThemePicker({ selected, thumbHtml, primaryColor, onSelect }: Props) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <Text style={[{ color: colors.textPrimary, fontSize: fs(18) }, inter('extrabold')]}>Escolha o visual</Text>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(13), lineHeight: fs(19) }, inter('regular')]}>
        Miniaturas com a logo e as cores da sua marca
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {THEMES.map(({ mode, label }) => {
          const active = selected === mode;
          return (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityLabel={`Tema ${label}`}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(mode)}
              style={{
                flex: 1,
                borderRadius: radius.lg,
                borderWidth: 2,
                borderColor: active ? primaryColor || colors.primary : colors.border,
                overflow: 'hidden',
                backgroundColor: colors.surface,
              }}
            >
              <View pointerEvents="none" style={{ height: 132 }}>
                <BrandPagePreview html={thumbHtml[mode]} height={132} />
              </View>
              <Text
                style={[
                  {
                    textAlign: 'center',
                    paddingVertical: 8,
                    color: active ? colors.primary : colors.textSecondary,
                    fontSize: fs(12),
                    backgroundColor: colors.surface,
                  },
                  inter(active ? 'bold' : 'medium'),
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
