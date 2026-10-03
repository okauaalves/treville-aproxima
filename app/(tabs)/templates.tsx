import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { TemplateCard } from '@/components/ui/TemplateCard';
import { useFocusEffect } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { SegmentedControl } from '@/components/ui/Toggle';
import { ADVANCED_TEMPLATES, BASIC_TEMPLATES } from '@/constants/nfcTypes';
import { getTemplates } from '@/core/offline/database';
import { push } from '@/lib/navigation';
import type { ContentType } from '@/theme/colors';
import type { NfcTemplate } from '@/types/template';

const BASIC: { type: ContentType; name: string; description: string }[] = [
  { type: 'WHATSAPP', name: 'WhatsApp', description: 'Contato rápido' },
  { type: 'VCARD', name: 'Cartão de visita', description: 'vCard profissional' },
  { type: 'WIFI', name: 'Wi-Fi', description: 'Conexão automática' },
  { type: 'URL', name: 'Link (URL)', description: 'Site ou página' },
  { type: 'PHONE', name: 'Telefone', description: 'Ligação direta' },
  { type: 'EMAIL', name: 'E-mail', description: 'Enviar mensagem' },
];

export default function TemplatesScreen() {
  const [tab, setTab] = useState<'basic' | 'advanced'>('basic');
  const [mine, setMine] = useState<NfcTemplate[]>([]);

  useFocusEffect(
    useCallback(() => {
      void getTemplates().then(setMine).catch(() => setMine([]));
    }, []),
  );

  const advanced = [
    ...BASIC_TEMPLATES.filter((item) => item.type === 'LOCATION' || item.type === 'TEXT'),
    ...ADVANCED_TEMPLATES,
  ];

  return (
    <Screen>
      <AppHeader title="Templates" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'basic', label: 'Básicos' },
            { value: 'advanced', label: 'Avançados' },
          ]}
        />
        <View style={{ marginTop: 14 }}>
          {tab === 'basic'
            ? BASIC.map((item) => (
                <TemplateCard key={item.type} type={item.type} title={item.name} subtitle={item.description} onPress={() => push(`/template/builtin-${item.type}`)} />
              ))
            : advanced.map((item) => (
                <TemplateCard key={`${item.type}-${item.name}`} type={item.type} title={item.name} subtitle={item.description} onPress={() => push(`/template/builtin-${item.type}`)} />
              ))}
          {tab === 'advanced'
            ? mine.map((item) => (
                <TemplateCard key={item.id} type={item.type} title={item.name} subtitle="Meu template" onPress={() => push(`/template/${item.id}`)} />
              ))
            : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

