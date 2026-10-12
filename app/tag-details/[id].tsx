import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';
import { Cpu, ExternalLink, Share2, Workflow } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { ReadOnlyBadge } from '@/components/nfc/ReadOnlyBadge';
import { RfidNotice } from '@/components/nfc/RfidNotice';
import { ShareSheet } from '@/components/nfc/ShareSheet';
import { useTagTools } from '@/components/nfc/TagTools';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Card } from '@/components/ui/Card';
import { TypeBadge } from '@/components/ui/TypeBadge';
import { CONTENT_TYPE_META } from '@/constants/nfcTypes';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import { nfcManager } from '@/core/nfc/NfcManager';
import { getPendingRead, setPendingRead } from '@/core/nfc/pendingRead';
import { formatUid } from '@/core/nfc/TagAnalyzer';
import { buildTechnicalReport, buildTechnicalSnapshot, chipLabel, recordsFromSnapshot, summarizeRecords } from '@/core/nfc/technical';
import { assessNfc } from '@/core/nfc/readiness';
import { getOperationById } from '@/core/offline/database';
import { operationLabel, statusLabel } from '@/core/offline/mappers';
import { useUidHash } from '@/hooks/useUidHash';
import { openNfcFlow } from '@/lib/nfcEntry';
import { push } from '@/lib/navigation';
import { useNfcStore } from '@/stores/nfcStore';
import type { ContentType } from '@/theme/colors';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { Operation } from '@/types/history';
import { emptyWriteOptions, type NfcTag, type ParsedRecord, type WritePayload } from '@/types/nfc';

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
  if (payload.androidPackage) {
    rows.push({ label: 'App Android', value: payload.androidPackage });
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
  if (payload.mimeType) {
    rows.push({ label: 'Tipo MIME', value: payload.mimeType });
  }
  if (payload.text && payload.contentType !== 'CUSTOM') {
    rows.push({ label: 'Texto', value: payload.text });
  }
  if (payload.text && payload.contentType === 'CUSTOM' && !payload.cardTitle) {
    rows.push({ label: 'Conteúdo', value: payload.text });
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

function formatDuration(ms: number | null): string {
  if (ms === null) {
    return '—';
  }
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export default function TagDetailsScreen() {
  const { colors, fs } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const storeTag = useNfcStore((state) => state.currentTag);
  const live = id === 'current' || !id;
  const pending = getPendingRead();
  const [liveTag, setLiveTag] = useState<NfcTag | null>(pending?.tag ?? storeTag);
  const [liveRecords, setLiveRecords] = useState<ParsedRecord[]>(pending?.records ?? []);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [sharing, setSharing] = useState(false);
  const uidHash = useUidHash(live ? liveTag?.uid : null);

  useEffect(() => {
    if (live) {
      return;
    }
    void getOperationById(id).then(setOperation);
  }, [id, live]);

  const payload = (live ? liveRecords[0]?.data : operation?.payload) ?? null;
  const contentType = (live ? liveRecords[0]?.contentType : operation?.contentType) ?? payload?.contentType ?? 'TEXT';
  const meta = CONTENT_TYPE_META[contentType] ?? CONTENT_TYPE_META.TEXT;
  const raw = live ? liveRecords[0]?.rawValue ?? '' : operation?.displayValue ?? '';
  const snapshot = useMemo(
    () => (live ? (liveTag ? buildTechnicalSnapshot(liveTag, Platform.OS, nfcManager.isSimulation()) : null) : operation?.technical ?? null),
    [live, liveTag, operation],
  );
  const tagType = snapshot ? chipLabel(snapshot) : operation?.tagType ?? '—';
  const capacity = live ? liveTag?.capacity ?? 0 : operation?.tagCapacity ?? 0;
  const uid = live ? formatUid(liveTag?.uid) : '';
  const savedPayloads = !live && operation?.payloads && operation.payloads.length > 1 ? operation.payloads : null;
  const recordCount = live ? liveRecords.length : savedPayloads?.length ?? 1;
  const rows = live && liveRecords.length > 1
    ? liveRecords.map((record, index) => ({ label: `Registro ${index + 1} · ${record.displayTitle}`, value: record.displayValue || record.rawValue }))
    : savedPayloads
      ? savedPayloads.map((item, index) => ({ label: `Registro ${index + 1} · ${CONTENT_TYPE_META[item.contentType]?.name ?? item.contentType}`, value: fieldsOf(item)[0]?.value ?? '—' }))
      : fieldsOf(payload);
  const href = linkOf(payload, raw);
  const sourceRecords = useMemo(() => (live ? liveTag?.ndefRecords ?? [] : snapshot ? recordsFromSnapshot(snapshot) : []), [live, liveTag, snapshot]);
  const summary = summarizeRecords(sourceRecords);
  const isRfid = live && liveTag !== null && !liveTag.capabilities.supportsNdef;
  const readOnly = Boolean(snapshot?.capabilities.supportsNdef && !snapshot.writable);
  const report = snapshot ? buildTechnicalReport(snapshot, { uid: live ? uid : null, uidHash: live ? null : operation?.tagHash ?? null, generatedAt: new Date().toLocaleString('pt-BR') }) : null;
  const contentText = rows.map((row) => `${row.label}: ${row.value}`).join('\n') || summary;

  const tools = useTagTools({
    tag: live ? liveTag : null,
    records: sourceRecords,
    uidHash: live ? uidHash : operation?.tagHash ?? null,
    summary,
    live,
    onTagChanged: (tag) => {
      const records = ndefEngine.parseContent(tag.ndefRecords);
      setLiveTag(tag);
      setLiveRecords(records);
      setPendingRead(tag, records);
      useNfcStore.getState().setCurrentTag(tag);
    },
  });

  function edit() {
    const body = JSON.stringify(payload ?? { contentType });
    void openNfcFlow('write', { contentType, prefill: body }, 'replace');
  }

  async function rewrite() {
    const list = operation?.payloads ?? (operation?.payload ? [operation.payload] : null);
    if (!list) {
      void openNfcFlow('write', {}, 'replace');
      return;
    }
    const assessment = await assessNfc();
    if (!assessment.ready) {
      void openNfcFlow('write', {}, 'push');
      return;
    }
    useNfcStore.getState().setPendingPayloads(list);
    useNfcStore.getState().setWriteOptions({ ...emptyWriteOptions });
    push('/write/progress');
  }

  const technicalHref = live ? '/tag-details/technical?source=current' : `/tag-details/technical?op=${encodeURIComponent(id)}`;

  return (
    <Screen>
      <AppHeader title={live ? 'Conteúdo da tag' : 'Detalhe do histórico'} back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 14 }}>
        {isRfid && liveTag ? (
          <RfidNotice uid={uid} technologies={liveTag.technologies} />
        ) : (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <TypeBadge type={contentType} size={52} iconName={payload?.cardIcon} tint={payload?.cardColor} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(18) }}>{live && liveRecords.length === 0 ? 'Tag vazia' : meta.name}</Text>
                <Text style={{ color: colors.textSecondary }}>{recordCount > 1 ? `${recordCount} registros` : KIND[contentType] ?? 'Conteúdo'}</Text>
              </View>
            </View>
            {readOnly ? <View style={{ marginBottom: 10 }}><ReadOnlyBadge /></View> : null}
            {rows.map((row) => (
              <View key={row.label} style={{ marginBottom: 10 }}>
                <Text style={{ color: colors.textSecondary, fontSize: fs(12) }}>{row.label}</Text>
                <Text selectable style={{ color: colors.textPrimary, fontWeight: '600', marginTop: 2 }}>{row.value}</Text>
              </View>
            ))}
            {live && liveRecords.length === 0 ? <Text style={{ color: colors.textSecondary, marginBottom: 6 }}>A tag não tem registros NDEF. Ela está pronta para receber conteúdo.</Text> : null}
            {href ? <PrimaryButton label="Testar link" variant="secondary" icon={<ExternalLink color={colors.primary} size={16} />} onPress={() => void Linking.openURL(href)} /> : null}
          </Card>
        )}

        {!live && operation ? (
          <>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('extrabold')]}>Operação</Text>
            <Card padding={0}>
              {[
                ['Tipo', operationLabel(operation.operation)],
                ['Resultado', statusLabel(operation.status)],
                ['Data', new Date(operation.createdAt).toLocaleString('pt-BR')],
                ['Duração', formatDuration(operation.durationMs)],
                ['Integridade', operation.integrityPercent !== null ? `${operation.integrityPercent}%` : '—'],
                ['Hash do UID', operation.tagHash ? `${operation.tagHash.slice(0, 16)}…` : '—'],
                ...(operation.errorMessage ? [['Erro', operation.errorMessage]] : []),
              ].map(([label, value], index) => (
                <InfoRow key={label} label={label ?? ''} value={value ?? ''} first={index === 0} error={label === 'Erro' || (label === 'Resultado' && operation.status !== 'SUCCESS')} />
              ))}
            </Card>
          </>
        ) : null}

        <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('extrabold')]}>Informações técnicas</Text>
        <Card padding={0}>
          {[
            ['Tipo', isRfid ? 'RFID (sem NDEF)' : 'NDEF'],
            ['Tag', tagType],
            ['Capacidade', capacity ? `${capacity} bytes` : '—'],
            ['UID', live ? uid || '—' : 'protegido'],
          ].map(([label, value], index) => (
            <InfoRow key={label} label={label ?? ''} value={value ?? ''} first={index === 0} />
          ))}
        </Card>
        {snapshot ? <PrimaryButton label="Ver dados técnicos" variant="secondary" fullWidth icon={<Cpu color={colors.primary} size={18} />} onPress={() => push(technicalHref)} /> : null}

        <PrimaryButton label="Compartilhar" variant="secondary" fullWidth icon={<Share2 color={colors.primary} size={18} />} onPress={() => setSharing(true)} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {payload ? (
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Editar" variant="secondary" onPress={edit} />
            </View>
          ) : null}
          {live || operation?.operation === 'WRITE' ? (
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Regravar" onPress={() => void (live ? openNfcFlow('write', {}, 'replace') : rewrite())} />
            </View>
          ) : null}
        </View>
        {live ? <PrimaryButton label="Criar automação" variant="secondary" fullWidth icon={<Workflow color={colors.primary} size={18} />} onPress={() => push('/automation')} /> : null}

        {sourceRecords.length > 0 || live ? (
          <>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('extrabold')]}>Ferramentas da tag</Text>
            {tools.actions}
          </>
        ) : null}
      </ScrollView>
      {tools.overlays}
      <ShareSheet
        visible={sharing}
        contentText={contentText}
        report={report}
        url={href && /^https?:/i.test(href) ? href : null}
        onClone={sourceRecords.length > 0 ? () => tools.open('clone') : null}
        onClose={() => setSharing(false)}
      />
    </Screen>
  );
}

function InfoRow({ label, value, first, error = false }: { label: string; value: string; first: boolean; error?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Text style={{ color: colors.textSecondary }}>{label}</Text>
      <Text selectable style={{ flexShrink: 1, textAlign: 'right', color: error ? colors.error : colors.textPrimary, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
