import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Nfc, Power, Share2 } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { EditarDestinoModal } from '@/components/plaquinha/EditarDestinoModal';
import { DestinationIcon } from '@/components/plaquinha/DestinoForm';
import { Pill } from '@/components/plaquinha/Pill';
import { ScanChart } from '@/components/plaquinha/ScanChart';
import { WebhookSection } from '@/components/plaquinha/WebhookSection';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/states';
import { push, replace } from '@/lib/navigation';
import { gravarPlaquinhaNaTag } from '@/lib/plaquinhaNfc';
import {
  aggregateScans,
  DESTINATION_LABELS,
  getLinkUrl,
  getPlaquinha,
  getScanStats,
  isDestinationType,
  plaquinhasAvailable,
  shortDisplayUrl,
  togglePlaquinha,
  type RedirectLink,
  type ScanLog,
} from '@/lib/plaquinhas';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const QR_COLOR = '#1E40AF';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, fs } = useTheme();
  return (
    <Card padding={16} style={{ marginTop: 14 }}>
      <Text accessibilityRole="header" style={[{ color: colors.textMuted, fontSize: fs(12), letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }, inter('bold')]}>
        {title}
      </Text>
      {children}
    </Card>
  );
}

function Stat({ label, value, big }: { label: string; value: number; big?: boolean }) {
  const { colors, fs } = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1 }}>
      <Text style={[{ color: big ? colors.primary : colors.textPrimary, fontSize: fs(big ? 34 : 22) }, inter('extrabold')]}>{value}</Text>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('medium')]}>{label}</Text>
    </View>
  );
}

async function shareOnWeb(dataUri: string | null, name: string, url: string): Promise<string> {
  if (dataUri && typeof document !== 'undefined') {
    const anchor = document.createElement('a');
    anchor.href = dataUri;
    anchor.download = `plaquinha-${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'qr'}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return 'QR Code baixado em PNG.';
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    await navigator.share({ title: name, url });
    return 'Link compartilhado.';
  }
  await navigator.clipboard?.writeText(url);
  return 'Link copiado.';
}

export default function PlaquinhaQrScreen() {
  const { colors, fs } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const available = plaquinhasAvailable() && !!user;
  const shotRef = useRef<View>(null);
  const [link, setLink] = useState<RedirectLink | null>(null);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'share' | 'toggle' | null>(null);
  const stats = useMemo(() => aggregateScans(logs, new Date()), [logs]);

  const load = useCallback(async () => {
    if (!available || !id) {
      setLoading(false);
      return;
    }
    try {
      const found = await getPlaquinha(id);
      setLink(found);
      setError(found ? null : 'Essa plaquinha não existe ou não é sua.');
      if (found) {
        setLogs(await getScanStats(id).catch(() => []));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar a plaquinha.');
    } finally {
      setLoading(false);
    }
  }, [available, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function share() {
    if (!link) {
      return;
    }
    setBusy('share');
    const url = getLinkUrl(link.id);
    try {
      if (Platform.OS === 'web') {
        const dataUri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'data-uri' }).catch(() => null);
        useToastStore.getState().show(await shareOnWeb(dataUri, link.name, url), 'success');
        return;
      }
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        useToastStore.getState().show('Compartilhamento indisponível neste aparelho.', 'warning');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `QR Code — ${link.name}`, UTI: 'public.png' });
    } catch (failure) {
      if (!(failure instanceof Error && failure.name === 'AbortError')) {
        useToastStore.getState().show('Não foi possível compartilhar o QR Code.', 'error');
      }
    } finally {
      setBusy(null);
    }
  }

  async function toggle() {
    if (!link) {
      return;
    }
    const next = !link.is_active;
    setBusy('toggle');
    try {
      await togglePlaquinha(link.id, next);
      setLink({ ...link, is_active: next });
      useToastStore.getState().show(next ? 'Plaquinha ativada.' : 'Plaquinha desativada. Quem escanear verá um aviso.', 'success');
    } catch (failure) {
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível mudar o status.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const title = link ? `QR Code — ${link.name}` : 'QR Code';
  const type = link && isDestinationType(link.destination_type) ? link.destination_type : 'url';

  return (
    <Screen>
      <AppHeader title={title} back />
      {!available ? (
        <View style={{ paddingHorizontal: 20 }}>
          <ErrorState title="Plaquinhas precisam de conta e conexão" message="Entre com sua conta (Supabase configurado) para ver esta plaquinha." />
        </View>
      ) : loading ? (
        <View style={{ paddingHorizontal: 20 }} accessibilityLabel="Carregando plaquinha">
          <Skeleton height={300} />
          <Skeleton height={120} />
          <Skeleton height={180} />
        </View>
      ) : error || !link ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <ErrorState title="Plaquinha indisponível" message={error ?? 'Essa plaquinha não existe.'} />
          <PrimaryButton label="Voltar" variant="secondary" onPress={() => replace('/(tabs)/plaquinhas')} />
        </View>
      ) : (
        <ScrollView testID="plaquinha-qr" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          <Card padding={20}>
            <View style={{ alignItems: 'center' }}>
              <View
                ref={shotRef}
                collapsable={false}
                accessible
                accessibilityRole="image"
                accessibilityLabel={`QR Code da plaquinha ${link.name}`}
                style={{ backgroundColor: 'white', padding: 16, borderRadius: radius.lg, alignItems: 'center' }}
              >
                <QRCode value={getLinkUrl(link.id)} size={220} color={QR_COLOR} backgroundColor="white" ecl="M" />
                <Text numberOfLines={1} style={[{ color: QR_COLOR, fontSize: 14, marginTop: 10, maxWidth: 220 }, inter('bold')]}>{link.name}</Text>
              </View>
              <Text selectable style={[{ color: colors.textSecondary, fontSize: fs(12), marginTop: 10 }, inter('medium')]}>
                {shortDisplayUrl(getLinkUrl(link.id))}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                <Pill label={link.is_active ? 'Ativo' : 'Inativo'} tone={link.is_active ? 'success' : 'muted'} />
                <Pill label={link.nfc_synced ? 'NFC sincronizado' : 'NFC não gravado'} tone={link.nfc_synced ? 'primary' : 'warning'} />
              </View>
            </View>
          </Card>

          <Section title="Destino atual">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <DestinationIcon type={type} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>{DESTINATION_LABELS[type]}</Text>
                <Pressable accessibilityRole="link" accessibilityLabel={`Abrir ${link.destination_url}`} onPress={() => void Linking.openURL(link.destination_url).catch(() => undefined)}>
                  <Text numberOfLines={2} style={[{ color: colors.primary, fontSize: fs(13), textDecorationLine: 'underline' }, inter('medium')]}>
                    {link.destination_url}
                  </Text>
                </Pressable>
              </View>
            </View>
            <PrimaryButton label="Mudar destino" variant="secondary" fullWidth style={{ marginTop: 14 }} onPress={() => setEditing(true)} />
          </Section>

          <Section title="Estatísticas">
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
              <Stat label="scans no total" value={link.scan_count} big />
              <Stat label="por QR" value={stats.qr} />
              <Stat label="por NFC" value={stats.nfc} />
            </View>
            {stats.sample >= 100 ? (
              <Text style={[{ color: colors.textMuted, fontSize: fs(11), marginTop: 6 }, inter('regular')]}>QR e NFC contam os últimos 100 scans.</Text>
            ) : null}
            <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginTop: 16, marginBottom: 8 }, inter('semibold')]}>Últimos 7 dias</Text>
            <ScanChart days={stats.days} max={stats.maxPerDay} />
          </Section>

          <Section title="Página de perfil">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {link.profile_enabled ? <Pill label="Perfil ativo" tone="violet" /> : <Pill label="Link direto" tone="primary" />}
              <Text style={[{ flex: 1, color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>
                {link.profile_enabled ? 'O scan abre sua mini página de links.' : 'O scan vai direto ao destino.'}
              </Text>
            </View>
            <PrimaryButton label="Editar perfil" variant="secondary" fullWidth style={{ marginTop: 12 }} onPress={() => push(`/perfil/links/${link.id}`)} />
          </Section>

          <WebhookSection key={`${link.id}:${link.webhook_url ?? ''}`} link={link} onSaved={(webhookUrl) => setLink({ ...link, webhook_url: webhookUrl })} />

          <View style={{ gap: 10, marginTop: 18 }}>
            <PrimaryButton label="Compartilhar QR" fullWidth loading={busy === 'share'} icon={<Share2 color={colors.onPrimary} size={20} />} onPress={() => void share()} />
            <PrimaryButton label="Gravar na tag NFC" variant="secondary" fullWidth icon={<Nfc color={colors.primary} size={20} />} onPress={() => void gravarPlaquinhaNaTag(link.id)} />
            <PrimaryButton
              label={link.is_active ? 'Desativar' : 'Ativar'}
              variant="ghost"
              tone={link.is_active ? 'danger' : undefined}
              fullWidth
              loading={busy === 'toggle'}
              icon={<Power color={link.is_active ? colors.danger : colors.primary} size={20} />}
              onPress={() => void toggle()}
            />
          </View>
        </ScrollView>
      )}
      <EditarDestinoModal
        link={editing ? link : null}
        onClose={() => setEditing(false)}
        onSaved={(updated) => {
          setLink(updated);
          setEditing(false);
        }}
      />
    </Screen>
  );
}
