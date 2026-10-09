import { Pressable, ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { TypeBadge } from '@/components/ui/TypeBadge';
import { CONTENT_TYPE_META } from '@/constants/nfcTypes';
import { getPendingRead } from '@/core/nfc/pendingRead';
import { replace } from '@/lib/navigation';
import { useNfcStore } from '@/stores/nfcStore';
import { inter } from '@/theme/fonts';
import type { ContentType } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';

const TYPES = Object.keys(CONTENT_TYPE_META) as ContentType[];

export default function ChooseTypeScreen() {
  const { colors, fs } = useTheme();
  const tag = useNfcStore((state) => state.currentTag);
  const pending = getPendingRead();
  const readOnly = tag ? !tag.capabilities.canWrite || tag.capabilities.isReadOnly : false;

  function pick(type: ContentType) {
    replace(`/write/configure?contentType=${type}`);
  }

  return (
    <Screen>
      <AppHeader title="Escolher conteúdo" back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 8 }}>
        <Text style={[{ color: colors.textSecondary }, inter('regular')]}>
          {tag ? `${tag.type} · ${tag.capacity} bytes · ${readOnly ? 'somente leitura' : 'gravável'}` : 'Nenhum tipo vem selecionado.'}
        </Text>
        {pending?.records[0] ? (
          <Text style={[{ color: colors.textSecondary, marginBottom: 8 }, inter('regular')]}>
            Conteúdo atual: {pending.records[0].displayTitle}
          </Text>
        ) : null}
        {readOnly ? <Text style={{ color: colors.warning, marginBottom: 8 }}>Esta tag está somente leitura. A gravação deve falhar.</Text> : null}
        {TYPES.map((type) => (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={CONTENT_TYPE_META[type].name}
            onPress={() => pick(type)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
          >
            <TypeBadge type={type} />
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>{CONTENT_TYPE_META[type].name}</Text>
              <Text style={[{ color: colors.textSecondary }, inter('regular')]}>{CONTENT_TYPE_META[type].description}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
