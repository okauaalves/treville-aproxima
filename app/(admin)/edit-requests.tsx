import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ban, CircleCheck, Clock, KeyRound, MessageSquareText, ShieldCheck, ShieldOff, TimerOff, X, type LucideProps } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { CONTENT_WIDTH } from '@/components/layout/ContentContainer';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { approveEditRequest, denyEditRequest, getAllEditRequests, revokeEditAccess, type AdminEditRequest } from '@/lib/adminAccess';
import { expiresAtFor, EXPIRY_OPTIONS, formatDatePtBr, isExpired, type ExpiryChoice } from '@/lib/editAccessLogic';
import { formatDateTimePtBr } from '@/lib/plaquinhaLogic';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

type TabKey = 'pending' | 'approved' | 'closed';
type TabDef = { key: TabKey; label: string; icon: ComponentType<LucideProps> };

const TABS: TabDef[] = [
  { key: 'pending', label: 'Pendentes', icon: Clock },
  { key: 'approved', label: 'Aprovados', icon: CircleCheck },
  { key: 'closed', label: 'Negados/Revogados', icon: Ban },
];

function tabOf(item: AdminEditRequest): TabKey {
  return item.status === 'pending' ? 'pending' : item.status === 'approved' ? 'approved' : 'closed';
}

function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function EditRequestsScreen() {
  const { colors, fs } = useTheme();
  const { isPhone } = useBreakpoint();
  const [items, setItems] = useState<AdminEditRequest[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('pending');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [approving, setApproving] = useState<AdminEditRequest | null>(null);
  const [expiry, setExpiry] = useState<ExpiryChoice>('none');

  const tint = useMemo(
    () => ({
      pending: { fg: colors.warning, bg: colors.warningBg },
      approved: { fg: colors.success, bg: colors.successBg },
      closed: { fg: colors.error, bg: colors.errorBg },
    }),
    [colors],
  );

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await getAllEditRequests());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar as solicitações.');
      setItems((current) => current ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function act(item: AdminEditRequest, action: 'approve' | 'deny' | 'revoke') {
    setBusy(`${item.id}:${action}`);
    try {
      const now = new Date().toISOString();
      if (action === 'approve') {
        const expiresAt = expiresAtFor(expiry);
        await approveEditRequest(item.id, expiresAt);
        setItems((current) => (current ?? []).map((row) => (row.id === item.id ? { ...row, status: 'approved', reviewedAt: now, expiresAt } : row)));
        setApproving(null);
        useToastStore.getState().show(`Edição de "${item.linkName}" liberada para ${item.userEmail}.`, 'success');
      } else if (action === 'deny') {
        await denyEditRequest(item.id);
        setItems((current) => (current ?? []).map((row) => (row.id === item.id ? { ...row, status: 'denied', reviewedAt: now, expiresAt: null } : row)));
        useToastStore.getState().show(`Solicitação de ${item.userEmail} negada.`, 'warning');
      } else {
        await revokeEditAccess(item.id);
        setItems((current) => (current ?? []).map((row) => (row.id === item.id ? { ...row, status: 'revoked', reviewedAt: now } : row)));
        useToastStore.getState().show(`Acesso de ${item.userEmail} a "${item.linkName}" revogado.`, 'warning');
      }
    } catch (caught) {
      useToastStore.getState().show(caught instanceof Error ? caught.message : 'Não foi possível salvar.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const counts = useMemo(() => {
    const result: Record<TabKey, number> = { pending: 0, approved: 0, closed: 0 };
    for (const item of items ?? []) {
      result[tabOf(item)] += 1;
    }
    return result;
  }, [items]);
  const visible = (items ?? []).filter((item) => tabOf(item) === tab);
  const empty = { pending: 'Nenhuma solicitação pendente.', approved: 'Nenhum acesso de edição aprovado.', closed: 'Nada negado ou revogado.' }[tab];

  return (
    <Screen maxWidth={CONTENT_WIDTH.admin}>
      <AppHeader title="Solicitações de edição" back />
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const selected = key === tab;
          const color = tint[key].fg;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={`${label} (${counts[key]})`}
              accessibilityState={{ selected }}
              onPress={() => setTab(key)}
              style={{
                flex: 1,
                minHeight: isPhone ? 56 : 44,
                flexDirection: isPhone ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: isPhone ? 2 : 6,
                paddingHorizontal: 6,
                paddingVertical: isPhone ? 6 : 0,
                borderRadius: isPhone ? radius.md : radius.pill,
                borderWidth: 1.5,
                borderColor: selected ? color : colors.border,
                backgroundColor: selected ? tint[key].bg : colors.surface,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon color={selected ? color : colors.textSecondary} size={16} />
                {isPhone ? <Text style={[{ color: selected ? color : colors.textMuted, fontSize: fs(12) }, inter('bold')]}>{counts[key]}</Text> : null}
              </View>
              <Text numberOfLines={1} style={[{ color: selected ? color : colors.textSecondary, fontSize: fs(isPhone ? 12 : 13) }, inter(selected ? 'bold' : 'semibold')]}>
                {isPhone && key === 'closed' ? 'Negados' : label}
              </Text>
              {isPhone ? null : <Text style={[{ color: selected ? color : colors.textMuted, fontSize: fs(12) }, inter('bold')]}>{counts[key]}</Text>}
            </Pressable>
          );
        })}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        {items === null ? (
          <>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={[{ color: colors.error }, inter('medium')]}>{error}</Text> : null}
        {items !== null && visible.length === 0 && !error ? (
          <Text style={[{ color: colors.textSecondary, fontSize: fs(14), textAlign: 'center', marginTop: 24 }, inter('regular')]}>{empty}</Text>
        ) : null}
        {visible.map((item) => {
          const expired = item.status === 'approved' && isExpired(item.expiresAt);
          return (
            <Card key={item.id} padding={16}>
              <View testID="edit-request-admin-card" style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} accessibilityIgnoresInvertColors />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryGlow, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={[{ color: colors.primary, fontSize: fs(16) }, inter('bold')]}>{initials(item.userName)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>{item.userName}</Text>
                    <Text numberOfLines={1} ellipsizeMode="middle" style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{item.userEmail}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.backgroundSecondary }}>
                  <KeyRound color={colors.primary} size={18} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>{item.linkName || item.linkId}</Text>
                    <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('medium')]}>
                      {item.linkId} · pedido em {formatDateTimePtBr(item.requestedAt)}
                    </Text>
                  </View>
                </View>
                {item.reason ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <MessageSquareText color={colors.textSecondary} size={16} style={{ marginTop: 2 }} />
                    <Text style={[{ flex: 1, color: colors.textSecondary, fontSize: fs(14), lineHeight: fs(20) }, inter('regular')]}>{item.reason}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {item.status === 'approved' && item.reviewedAt ? (
                    <Badge label={`Aprovado em ${formatDatePtBr(item.reviewedAt)}`} color={tint.approved.fg} bg={tint.approved.bg} icon={<ShieldCheck color={tint.approved.fg} size={14} />} />
                  ) : null}
                  {item.status === 'approved' && item.expiresAt ? (
                    expired ? (
                      <Badge label="Expirado" color={colors.textSecondary} bg={colors.backgroundSecondary} icon={<TimerOff color={colors.textSecondary} size={14} />} />
                    ) : (
                      <Badge label={`Até ${formatDatePtBr(item.expiresAt)}`} color={colors.primary} bg={colors.primaryGlow} icon={<Clock color={colors.primary} size={14} />} />
                    )
                  ) : null}
                  {item.status === 'denied' ? <Badge label="Negado" color={tint.closed.fg} bg={tint.closed.bg} icon={<X color={tint.closed.fg} size={14} />} /> : null}
                  {item.status === 'revoked' ? <Badge label="Revogado" color={tint.closed.fg} bg={tint.closed.bg} icon={<ShieldOff color={tint.closed.fg} size={14} />} /> : null}
                </View>
                {item.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        label="Aprovar"
                        tone="success"
                        fullWidth
                        disabled={busy !== null}
                        accessibilityLabel={`Aprovar ${item.userEmail} em ${item.linkName}`}
                        icon={<CircleCheck color={colors.onSuccess} size={18} />}
                        onPress={() => {
                          setExpiry('none');
                          setApproving(item);
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        label="Negar"
                        tone="danger"
                        fullWidth
                        disabled={busy !== null}
                        loading={busy === `${item.id}:deny`}
                        accessibilityLabel={`Negar ${item.userEmail} em ${item.linkName}`}
                        icon={<Ban color={colors.onDanger} size={18} />}
                        onPress={() => void act(item, 'deny')}
                      />
                    </View>
                  </View>
                ) : null}
                {item.status === 'approved' && !expired ? (
                  <PrimaryButton
                    label="Revogar acesso"
                    variant="ghost"
                    tone="danger"
                    fullWidth
                    disabled={busy !== null}
                    loading={busy === `${item.id}:revoke`}
                    accessibilityLabel={`Revogar acesso de ${item.userEmail} a ${item.linkName}`}
                    icon={<ShieldOff color={colors.danger} size={18} />}
                    onPress={() => void act(item, 'revoke')}
                  />
                ) : null}
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <Modal visible={approving !== null} title="Aprovar edição" onClose={() => (busy ? undefined : setApproving(null))}>
        {approving ? (
          <View testID="aprovar-prazo">
            <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginBottom: 12, lineHeight: fs(20) }, inter('regular')]}>
              {`${approving.userEmail} poderá mudar o destino e gravar a tag de "${approving.linkName}". Por quanto tempo?`}
            </Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {EXPIRY_OPTIONS.map((option) => {
                const selected = option.value === expiry;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setExpiry(option.value)}
                    style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primaryGlow : colors.surface }}
                  >
                    <Text style={[{ color: selected ? colors.primary : colors.textSecondary, fontSize: fs(14) }, inter(selected ? 'bold' : 'semibold')]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginBottom: 12 }, inter('regular')]}>
              {expiry === 'none' ? 'Vale até você revogar.' : `Expira sozinho em ${formatDatePtBr(expiresAtFor(expiry))}.`}
            </Text>
            <PrimaryButton label="Aprovar" tone="success" fullWidth loading={busy === `${approving.id}:approve`} icon={<CircleCheck color={colors.onSuccess} size={18} />} onPress={() => void act(approving, 'approve')} />
            <PrimaryButton label="Cancelar" variant="ghost" fullWidth style={{ marginTop: 8 }} onPress={() => setApproving(null)} />
          </View>
        ) : null}
      </Modal>
    </Screen>
  );
}

function Badge({ label, color, bg, icon }: { label: string; color: string; bg: string; icon: ReactNode }) {
  const { fs } = useTheme();
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      {icon}
      <Text style={[{ color, fontSize: fs(12) }, inter('bold')]}>{label}</Text>
    </View>
  );
}
