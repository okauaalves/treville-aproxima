import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, ScrollView, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, ClipboardCopy, FileDown, X } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { ReadOnlyBadge } from '@/components/nfc/ReadOnlyBadge';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { EmptyState } from '@/components/ui/states';
import { nfcManager } from '@/core/nfc/NfcManager';
import { getPendingRead } from '@/core/nfc/pendingRead';
import { formatUid } from '@/core/nfc/TagAnalyzer';
import {
  buildTechnicalReport,
  buildTechnicalSnapshot,
  CAPABILITY_LABELS,
  chipLabel,
  formatBytes,
  UNAVAILABLE,
  type RecordInfo,
  type TechnicalSnapshot,
} from '@/core/nfc/technical';
import { getOperationById } from '@/core/offline/database';
import { useNfcStore } from '@/stores/nfcStore';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { Operation } from '@/types/history';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function TechnicalScreen() {
  const { colors, fs } = useTheme();
  const params = useLocalSearchParams<{ source?: string; op?: string }>();
  const opId = readParam(params.op);
  const storeTag = useNfcStore((state) => state.currentTag);
  const liveTag = opId ? null : getPendingRead()?.tag ?? storeTag;
  const [operation, setOperation] = useState<Operation | null>(null);
  const [loaded, setLoaded] = useState(!opId);

  useEffect(() => {
    if (!opId) {
      return;
    }
    void getOperationById(opId)
      .then(setOperation)
      .finally(() => setLoaded(true));
  }, [opId]);

  const snapshot: TechnicalSnapshot | null = useMemo(
    () => (liveTag ? buildTechnicalSnapshot(liveTag, Platform.OS, nfcManager.isSimulation()) : operation?.technical ?? null),
    [liveTag, operation],
  );
  const uid = liveTag ? formatUid(liveTag.uid) : null;
  const uidHash = operation?.tagHash ?? null;
  const report = snapshot ? buildTechnicalReport(snapshot, { uid, uidHash, generatedAt: new Date().toLocaleString('pt-BR') }) : '';

  async function copy() {
    try {
      await Clipboard.setStringAsync(report);
      useToastStore.getState().show('Dados técnicos copiados.', 'success');
    } catch {
      useToastStore.getState().show('Não foi possível copiar neste ambiente.', 'warning');
    }
  }

  async function exportReport() {
    try {
      await Share.share({ message: report, title: 'Relatório técnico NFC' });
    } catch {
      const copied = await Clipboard.setStringAsync(report).catch(() => false);
      useToastStore.getState().show(copied ? 'Compartilhamento indisponível aqui: relatório copiado.' : 'Compartilhamento indisponível neste ambiente.', 'warning');
    }
  }

  if (!snapshot) {
    return (
      <Screen>
        <AppHeader title="Dados técnicos" back />
        <View style={{ padding: 16 }}>
          {loaded ? <EmptyState title="Sem dados técnicos" message="Leia uma tag ou abra uma operação registrada depois desta atualização." /> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Dados técnicos" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 14 }}>
        {snapshot.simulated ? <Text style={[{ color: colors.warning, fontSize: fs(13) }, inter('semibold')]}>Modo de teste: valores de uma tag simulada.</Text> : null}
        {snapshot.capabilities.supportsNdef && !snapshot.writable ? <ReadOnlyBadge /> : null}

        <Section title="Identificação">
          <Row label="UID" value={uid || (uidHash ? `protegido (SHA-256 ${uidHash.slice(0, 16)}…)` : UNAVAILABLE)} first />
          <Row label="ATQA" value={snapshot.atqa ?? UNAVAILABLE} />
          <Row label="SAK" value={snapshot.sak ?? UNAVAILABLE} />
          <Row label="Tipo de chip" value={chipLabel(snapshot)} />
          <Row label="Tecnologias" value={snapshot.technologies.length > 0 ? snapshot.technologies.map((tech) => `${tech.label} (${tech.standard})`).join('\n') : UNAVAILABLE} />
        </Section>

        <Section title="Memória">
          <Row label="Capacidade" value={snapshot.capacity > 0 ? formatBytes(snapshot.capacity) : UNAVAILABLE} first />
          <Row label="Em uso" value={formatBytes(snapshot.used)} />
          <Row label="Livre" value={snapshot.capacity > 0 ? formatBytes(snapshot.free) : UNAVAILABLE} />
          <Row label="Páginas" value={snapshot.pages ? `${snapshot.pages.total} × ${snapshot.pages.pageSize} bytes (${snapshot.pages.user} de usuário)` : UNAVAILABLE} />
        </Section>

        <Section title="NDEF">
          <Row label="Suporta NDEF" value={snapshot.capabilities.supportsNdef ? 'Sim' : 'Não'} first />
          <Row label="Versão" value={UNAVAILABLE} />
          <Row label="Tipo" value={snapshot.ndefType ?? UNAVAILABLE} />
          <Row label="Gravável" value={snapshot.writable ? 'Sim' : 'Não'} />
          <Row label="Tamanho máximo" value={snapshot.capacity > 0 ? formatBytes(snapshot.capacity) : UNAVAILABLE} />
          <Row label="Registros" value={String(snapshot.records.length)} />
        </Section>

        {snapshot.records.map((record) => (
          <RecordCard key={record.index} record={record} />
        ))}

        <Section title="Capacidades">
          {CAPABILITY_LABELS.map(({ key, label }, index) => {
            const value = snapshot.capabilities[key];
            return (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}>
                {value ? <Check color={key === 'platformLimited' ? colors.warning : colors.success} size={18} /> : <X color={colors.textMuted} size={18} />}
                <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(14) }, inter('medium')]}>{label}</Text>
                <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{value ? 'Sim' : 'Não'}</Text>
              </View>
            );
          })}
        </Section>

        <PrimaryButton label="Copiar dados técnicos" variant="secondary" fullWidth icon={<ClipboardCopy color={colors.primary} size={18} />} onPress={() => void copy()} />
        <PrimaryButton label="Exportar relatório" fullWidth icon={<FileDown color={colors.onPrimary} size={18} />} onPress={() => void exportReport()} />
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('extrabold')]}>{title}</Text>
      <Card padding={0}>{children}</Card>
    </View>
  );
}

function Row({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  const { colors, fs } = useTheme();
  const muted = value === UNAVAILABLE;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>{label}</Text>
      <Text selectable style={[{ flexShrink: 1, textAlign: 'right', color: muted ? colors.textMuted : colors.textPrimary, fontSize: fs(14) }, inter(muted ? 'regular' : 'semibold')]}>{value}</Text>
    </View>
  );
}

function RecordCard({ record }: { record: RecordInfo }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('extrabold')]}>Registro {record.index + 1}</Text>
      <Card padding={0}>
        <Row label="TNF" value={`${record.tnf} — ${record.tnfName}`} first />
        <Row label="Type" value={record.type ? `${record.type} [${record.typeHex}]` : '(vazio)'} />
        <Row label="ID" value={record.id || '(sem id)'} />
        <Row label="Tamanho" value={`${formatBytes(record.recordSize)} (payload ${formatBytes(record.payloadSize)})`} />
        <View style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>Payload (hex)</Text>
          <Text selectable style={[{ color: colors.textPrimary, fontSize: fs(12), fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) }]}>{record.payloadHex || '(vazio)'}</Text>
        </View>
        <View style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>Texto decodificado</Text>
          <Text selectable style={[{ color: record.decoded ? colors.textPrimary : colors.textMuted, fontSize: fs(14) }, inter('medium')]}>{record.decoded ?? 'Binário, sem texto legível'}</Text>
        </View>
      </Card>
    </View>
  );
}
