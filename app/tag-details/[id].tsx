import { useEffect, useState } from 'react';
import { Linking, ScrollView, Share, Text, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Card } from '@/components/ui/Card';
import { TypeBadge } from '@/components/ui/TypeBadge';
import { CONTENT_TYPE_META } from '@/constants/nfcTypes';
import { getOperationById } from '@/core/offline/database';
import { getPendingRead } from '@/core/nfc/pendingRead';
import { formatUid } from '@/core/nfc/TagAnalyzer';
import { openNfcFlow } from '@/lib/nfcEntry';
import { useNfcStore } from '@/stores/nfcStore';
import type { ContentType } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import type { Operation } from '@/types/history';
import type { WritePayload } from '@/types/nfc';

const KIND: Partial<Record<ContentType, string>> = {
  WHATSAPP: 'Aplicativo',
  VCARD: 'Contato',
  WIFI: 'Rede',
  URL: 'Link',
  PHONE: 'Telefone',
  EMAIL: 'E-mail',
  TEXT: 'Texto',
  LOCATION: 'Local',
  LINK_APP: 'Aplicativo',
  EVENT: 'Evento',
  CUSTOM: 'Cartão',
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return value;
}

function fieldsOf(payload: WritePayload | null): { label: string; value: string }[] {
  if (!payload) {
    return [];
  }
  const rows: { label: string; value: string }[] = [];
  if (payload.phone) {
    rows.push({ label: 'Número', value: formatPhone(payload.phone) });
  }
  if (payload.message || payload.body) {
    rows.push({ label: 'Mensagem', value: payload.message || payload.body || '' });
  }
  if (payload.url || payload.appUri) {
    rows.push({ label: 'Link', value: payload.url || payload.appUri || '' });
  }
  if (payload.email) {
    rows.push({ label: 'E-mail', value: payload.email });
  }
  if (payload.fullName) {
    rows.push({ label: 'Nome', value: payload.fullName });
  }
  if (payload.ssid) {
    rows.push({ label: 'Rede', value: payload.ssid });
  }
  if (payload.text && payload.contentType !== 'CUSTOM') {
    rows.push({ label: 'Texto', value: payload.text });
  }
  if (payload.cardTitle) {
    rows.push({ label: 'Título', value: payload.cardTitle });
  }
  for (const field of payload.cardFields ?? []) {
    if (field.label && field.value) {
      rows.push(field);
    }
  }
  return rows;
}

function linkOf(payload: WritePayload | null, raw: string): string | null {
  if (raw.startsWith('http') || raw.startsWith('tel:') || raw.startsWith('mailto:') || raw.startsWith('geo:')) {
    return raw;
  }
  if (!payload) {
    return null;
  }
  if (payload.contentType === 'WHATSAPP' && payload.phone) {
    const text = payload.message ? `?text=${encodeURIComponent(payload.message)}` : '';
    return `https://wa.me/${payload.phone.replace(/\D/g, '')}${text}`;
  }
  if (payload.url) {
    return payload.url;
  }
  if (payload.contentType === 'PHONE' && payload.phone) {
    return `tel:${payload.phone}`;
  }
  if (payload.contentType === 'EMAIL' && payload.email) {
    return `mailto:${payload.email}`;
  }
  return null;
}

export default function TagDetailsScreen() {
  const { colors, fs } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const current = useNfcStore((state) => state.currentTag);
  const pending = getPendingRead();
  const [operation, setOperation] = useState<Operation | null>(null);

  useEffect(() => {
    if (!id || id === 'current') {
      return;
    }
    void getOperationById(id).then(setOperation);
  }, [id]);

  const live = id === 'current' || !id;
  const payload = (live ? pending?.records[0]?.data : operation?.payload) ?? null;
  const contentType = (live ? pending?.records[0]?.contentType : operation?.contentType) ?? payload?.contentType ?? 'TEXT';
  const meta = CONTENT_TYPE_META[contentType] ?? CONTENT_TYPE_META.TEXT;
  const raw = live ? pending?.records[0]?.rawValue ?? '' : operation?.displayValue ?? '';
  const tagType = live ? current?.type ?? pending?.tag.type ?? 'NTAG213' : operation?.tagType ?? 'NTAG213';
  const capacity = live ? current?.capacity ?? pending?.tag.capacity ?? 0 : operation?.tagCapacity ?? 0;
  const uid = live ? formatUid(current?.uid ?? pending?.tag.uid) : 'protegido';
  const rows = fieldsOf(payload);
  const href = linkOf(payload, raw);

  function edit() {
    const body = JSON.stringify(payload ?? { contentType });
    void openNfcFlow('write', { contentType, prefill: body }, 'replace');
  }

  function rewrite() {
    void openNfcFlow('write', {}, 'replace');
  }

  return (
    <Screen>
      <AppHeader title="Conteúdo da tag" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 14 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <TypeBadge type={contentType} size={52} iconName={payload?.cardIcon} tint={payload?.cardColor} />
              <View>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(18) }}>{meta.name}</Text>
                <Text style={{ color: colors.textSecondary }}>{KIND[contentType] ?? 'Conteúdo'}</Text>
              </View>
            </View>
            {rows.map((row) => (
              <View key={row.label} style={{ marginBottom: 10 }}>
                <Text style={{ color: colors.textSecondary, fontSize: fs(12) }}>{row.label}</Text>
                <Text style={{ color: colors.textPrimary, fontWeight: '600', marginTop: 2 }}>{row.value}</Text>
              </View>
            ))}
            {href ? <PrimaryButton label="Testar link" variant="secondary" icon={<ExternalLink color={colors.primary} size={16} />} onPress={() => void Linking.openURL(href)} /> : null}
          </Card>
          <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(16) }}>Informações técnicas</Text>
          <Card padding={0}>
            {[
              ['Tipo', 'NDEF'],
              ['Tag', tagType],
              ['Capacidade', capacity ? `${capacity} bytes` : '—'],
              ['UID', uid || '—'],
            ].map(([label, value], index) => (
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <Text style={{ color: colors.textSecondary }}>{label}</Text>
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{value}</Text>
              </View>
            ))}
          </Card>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label="Compartilhar"
                variant="secondary"
                onPress={() => void Share.share({ message: rows.map((row) => `${row.label}: ${row.value}`).join('\n') || meta.name })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Editar" variant="secondary" onPress={edit} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Regravar" onPress={rewrite} />
            </View>
          </View>
      </ScrollView>
    </Screen>
  );
}
