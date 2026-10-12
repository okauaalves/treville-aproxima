import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TypeBadge } from '@/components/ui/TypeBadge';
import { CONTENT_TYPE_META, isContentType } from '@/constants/nfcTypes';
import { deleteTemplate, getTemplates, saveTemplate } from '@/core/offline/database';
import { openNfcFlow } from '@/lib/nfcEntry';
import { replace } from '@/lib/navigation';
import { inter } from '@/theme/fonts';
import type { ContentType } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import { useToastStore } from '@/stores/toastStore';
import type { NfcPayload } from '@/types/nfc';
import type { NfcTemplate } from '@/types/template';

export default function TemplateDetailScreen() {
  const { colors, fs } = useTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const raw = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';
  const builtin = raw.startsWith('builtin-') ? raw.slice('builtin-'.length) : null;
  const [item, setItem] = useState<NfcTemplate | null>(null);

  useEffect(() => {
    if (builtin) {
      return;
    }
    void getTemplates().then((list) => setItem(list.find((template) => template.id === raw) ?? null));
  }, [builtin, raw]);

  const type = (builtin && isContentType(builtin) ? builtin : item?.type) as ContentType | undefined;
  const meta = type ? CONTENT_TYPE_META[type] : null;
  const title = item?.name ?? meta?.name ?? 'Template';
  const description = item ? 'Template salvo neste aparelho' : meta?.description ?? '';

  function useTemplate() {
    if (!type) {
      return;
    }
    const prefill = item ? JSON.stringify(item.configuration) : '';
    void openNfcFlow('write', { contentType: type, prefill }, 'replace');
  }

  async function duplicate() {
    if (!type) {
      return;
    }
    const configuration: NfcPayload = item?.configuration ?? { contentType: type };
    await saveTemplate({ name: `${title} cópia`, type, configuration });
    useToastStore.getState().show('Template duplicado.', 'success');
    replace('/(tabs)/templates');
  }

  async function remove() {
    if (!item) {
      return;
    }
    await deleteTemplate(item.id);
    useToastStore.getState().show('Template excluído.', 'success');
    replace('/(tabs)/templates');
  }

  return (
    <Screen>
      <AppHeader title={title} back />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {type ? <TypeBadge type={type} iconName={item?.icon} tint={item?.color} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(18) }, inter('bold')]}>{title}</Text>
            <Text style={[{ color: colors.textSecondary }, inter('regular')]}>{description}</Text>
          </View>
        </View>
        <PrimaryButton label="Usar" onPress={useTemplate} />
        <PrimaryButton label="Editar" variant="secondary" onPress={useTemplate} />
        <PrimaryButton label="Duplicar" variant="secondary" onPress={() => void duplicate()} />
        {item ? <PrimaryButton label="Excluir" tone="danger" onPress={() => void remove()} /> : null}
      </ScrollView>
    </Screen>
  );
}
