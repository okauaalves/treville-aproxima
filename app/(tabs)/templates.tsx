import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { TemplateCard } from '@/components/ui/TemplateCard';
import { SegmentedControl } from '@/components/ui/Toggle';
import { ADVANCED_TEMPLATES, BASIC_TEMPLATES } from '@/constants/nfcTypes';
import { getTemplates } from '@/core/offline/database';
import { useBreakpoint } from '@/hooks/useBreakpoint';
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

const GAP = 12;

type GridItem =
  | { key: string; kind: 'template'; type: ContentType; title: string; subtitle: string; href: string; iconName?: string | null; tint?: string | null }
  | { key: string; kind: 'filler' };

export default function TemplatesScreen() {
  const [tab, setTab] = useState<'basic' | 'advanced'>('basic');
  const [mine, setMine] = useState<NfcTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { width, isSmall, isTablet, isBigTablet, sidebarWidth } = useBreakpoint();
  const cols = isBigTablet ? 4 : isTablet ? 3 : 2;
  const maxWidth = isBigTablet ? 1000 : isTablet ? 760 : null;
  const areaWidth = Math.min(width - sidebarWidth, maxWidth ?? Infinity);
  const padding = isSmall ? 12 : isTablet ? 32 : isBigTablet ? (areaWidth < 800 ? 32 : 48) : 16;
  const cardWidth = (areaWidth - padding * 2 - GAP * (cols - 1)) / cols;
  const compact = cardWidth < 165;

  useFocusEffect(
    useCallback(() => {
      void getTemplates().then(setMine).catch(() => setMine([])).finally(() => setLoading(false));
    }, []),
  );

  const builtin = tab === 'basic'
    ? BASIC
    : [...BASIC_TEMPLATES.filter((item) => item.type === 'LOCATION' || item.type === 'TEXT'), ...ADVANCED_TEMPLATES];

  const items: GridItem[] = loading
    ? []
    : [
        ...mine.map((item): GridItem => ({ key: `mine-${item.id}`, kind: 'template', type: item.type, title: item.name, subtitle: 'Meu template', href: `/template/${item.id}`, iconName: item.icon, tint: item.color })),
        ...builtin.map((item): GridItem => ({ key: `${item.type}-${item.name}`, kind: 'template', type: item.type, title: item.name, subtitle: item.description, href: `/template/builtin-${item.type}` })),
      ];
  // Completa a última linha para os cards manterem a mesma largura.
  const fillers = items.length % cols === 0 ? 0 : cols - (items.length % cols);
  const data: GridItem[] = [...items, ...Array.from({ length: fillers }, (_, index): GridItem => ({ key: `filler-${index}`, kind: 'filler' }))];

  return (
    <Screen maxWidth={maxWidth}>
      <AppHeader title="Templates" inset={padding} />
      <FlatList
        key={`grid-${cols}`}
        testID="templates-grid"
        data={data}
        numColumns={cols}
        keyExtractor={(item) => item.key}
        columnWrapperStyle={{ gap: GAP, alignItems: 'stretch' }}
        contentContainerStyle={{ paddingHorizontal: padding, paddingBottom: 24, gap: GAP }}
        ListHeaderComponent={
          <View style={{ marginBottom: 2 }}>
            <SegmentedControl
              value={tab}
              onChange={setTab}
              options={[
                { value: 'basic', label: 'Básicos' },
                { value: 'advanced', label: 'Avançados' },
              ]}
            />
            {loading ? (
              <View style={{ marginTop: 14 }}>
                <Skeleton />
                <Skeleton />
                <Skeleton />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) =>
          item.kind === 'filler' ? (
            <View style={{ flex: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          ) : (
            <TemplateCard
              variant="grid"
              compact={compact}
              index={index}
              type={item.type}
              title={item.title}
              subtitle={item.subtitle}
              iconName={item.iconName}
              tint={item.tint}
              onPress={() => push(item.href)}
            />
          )
        }
      />
    </Screen>
  );
}
