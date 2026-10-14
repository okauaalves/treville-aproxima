import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ban, CircleCheck, Clock, Mail, ShieldCheck, ShieldX, UserPlus, type LucideProps } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { CONTENT_WIDTH } from '@/components/layout/ContentContainer';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { inviteUser, listAccess, setAccessStatus, type AccessItem, type AccessRowStatus } from '@/lib/adminApi';
import { formatDateTimePtBr } from '@/lib/plaquinhaLogic';
import { checkEmail } from '@/supabase/functions/_shared/adminAccess';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

type TabDef = { status: AccessRowStatus; label: string; icon: ComponentType<LucideProps> };

const TABS: TabDef[] = [
  { status: 'pending', label: 'Pendentes', icon: Clock },
  { status: 'approved', label: 'Aprovados', icon: CircleCheck },
  { status: 'blocked', label: 'Bloqueados', icon: Ban },
];

function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function AccessScreen() {
  const { colors, fs } = useTheme();
  const { isPhone } = useBreakpoint();
  const selfId = useAuthStore((state) => state.user?.id ?? null);
  const [items, setItems] = useState<AccessItem[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<AccessRowStatus>('pending');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);

  const tint = useMemo(
    () => ({
      pending: { fg: colors.warning, bg: colors.warningBg },
      approved: { fg: colors.success, bg: colors.successBg },
      blocked: { fg: colors.error, bg: colors.errorBg },
    }),
    [colors],
  );

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await listAccess());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os acessos.');
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

  async function changeStatus(item: AccessItem, status: AccessRowStatus) {
    setBusy(`${item.id}:${status}`);
    try {
      await setAccessStatus(item.id, status);
      setItems((current) => (current ?? []).map((row) => (row.id === item.id ? { ...row, status, approvedAt: status === 'approved' ? new Date().toISOString() : row.approvedAt } : row)));
      useToastStore.getState().show(status === 'approved' ? `Acesso liberado para ${item.email || item.name}.` : `${item.email || item.name} foi bloqueado.`, status === 'approved' ? 'success' : 'warning');
    } catch (caught) {
      useToastStore.getState().show(caught instanceof Error ? caught.message : 'Não foi possível salvar.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function sendInvite() {
    const checked = checkEmail(inviteEmail);
    if (!checked.ok) {
      setInviteError(checked.error);
      return;
    }
    setInviting(true);
    try {
      const result = await inviteUser(checked.value);
      setInviteOpen(false);
      setInviteEmail('');
      useToastStore
        .getState()
        .show(result.invited ? `Convite enviado para ${checked.value}` : `${checked.value} já tem conta: acesso liberado.`, 'success');
      setTab('approved');
      void load();
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : 'Não foi possível enviar o convite.');
    } finally {
      setInviting(false);
    }
  }

  const counts = useMemo(() => {
    const result: Record<AccessRowStatus, number> = { pending: 0, approved: 0, blocked: 0 };
    for (const item of items ?? []) {
      result[item.status] += 1;
    }
    return result;
  }, [items]);
  const visible = (items ?? []).filter((item) => item.status === tab);
  const empty = { pending: 'Nenhum pedido pendente.', approved: 'Nenhum usuário aprovado.', blocked: 'Nenhum usuário bloqueado.' }[tab];

  return (
    <Screen maxWidth={CONTENT_WIDTH.admin}>
      <AppHeader
        title="Gerenciar acessos"
        back
        right={
          <IconButton accessibilityLabel="Convidar usuário" onPress={() => { setInviteError(''); setInviteOpen(true); }}>
            <UserPlus color={colors.primary} size={22} />
          </IconButton>
        }
      />
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {TABS.map(({ status, label, icon: Icon }) => {
          const selected = status === tab;
          const color = tint[status].fg;
          return (
            <Pressable
              key={status}
              accessibilityRole="tab"
              accessibilityLabel={`${label} (${counts[status]})`}
              accessibilityState={{ selected }}
              onPress={() => setTab(status)}
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
                backgroundColor: selected ? tint[status].bg : colors.surface,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon color={selected ? color : colors.textSecondary} size={16} />
                {isPhone ? <Text style={[{ color: selected ? color : colors.textMuted, fontSize: fs(12) }, inter('bold')]}>{counts[status]}</Text> : null}
              </View>
              <Text numberOfLines={1} style={[{ color: selected ? color : colors.textSecondary, fontSize: fs(13) }, inter(selected ? 'bold' : 'semibold')]}>
                {label}
              </Text>
              {isPhone ? null : <Text style={[{ color: selected ? color : colors.textMuted, fontSize: fs(12) }, inter('bold')]}>{counts[status]}</Text>}
            </Pressable>
          );
        })}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        <PrimaryButton label="Convidar usuário" variant="secondary" fullWidth icon={<UserPlus color={colors.primary} size={18} />} onPress={() => { setInviteError(''); setInviteOpen(true); }} />
        {items === null ? (
          <>
            <Skeleton height={112} />
            <Skeleton height={112} />
          </>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={[{ color: colors.error }, inter('medium')]}>{error}</Text> : null}
        {items !== null && visible.length === 0 && !error ? (
          <Text style={[{ color: colors.textSecondary, fontSize: fs(14), textAlign: 'center', marginTop: 24 }, inter('regular')]}>{empty}</Text>
        ) : null}
        {visible.map((item) => (
          <Card key={item.id} padding={16}>
            <View testID="access-card" style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} accessibilityIgnoresInvertColors />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryGlow, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[{ color: colors.primary, fontSize: fs(16) }, inter('bold')]}>{initials(item.name)}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>{item.name}</Text>
                  <Text numberOfLines={1} ellipsizeMode="middle" style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{item.email || 'Sem e-mail'}</Text>
                  <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginTop: 2 }, inter('medium')]}>
                    {item.status === 'approved' && item.approvedAt ? `Aprovado em ${formatDateTimePtBr(item.approvedAt)}` : `Pedido em ${formatDateTimePtBr(item.createdAt)}`}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {item.status === 'approved' ? <Badge label="Acesso liberado" color={tint.approved.fg} bg={tint.approved.bg} icon={<ShieldCheck color={tint.approved.fg} size={14} />} /> : null}
                {item.status === 'blocked' ? <Badge label="Bloqueado" color={tint.blocked.fg} bg={tint.blocked.bg} icon={<ShieldX color={tint.blocked.fg} size={14} />} /> : null}
                {item.invited && !item.userId ? <Badge label="Convite enviado" color={colors.primary} bg={colors.primaryGlow} icon={<Mail color={colors.primary} size={14} />} /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {item.status !== 'approved' ? (
                  <View style={{ flex: 1 }}>
                    <PrimaryButton label="Aprovar" tone="success" fullWidth disabled={busy !== null} loading={busy === `${item.id}:approved`} accessibilityLabel={`Aprovar ${item.email || item.name}`} icon={<CircleCheck color={colors.onSuccess} size={18} />} onPress={() => void changeStatus(item, 'approved')} />
                  </View>
                ) : null}
                {item.status !== 'blocked' && item.userId !== selfId ? (
                  <View style={{ flex: 1 }}>
                    <PrimaryButton label="Bloquear" tone="danger" fullWidth disabled={busy !== null} loading={busy === `${item.id}:blocked`} accessibilityLabel={`Bloquear ${item.email || item.name}`} icon={<Ban color={colors.onDanger} size={18} />} onPress={() => void changeStatus(item, 'blocked')} />
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
      <Modal visible={inviteOpen} title="Convidar usuário" onClose={() => setInviteOpen(false)}>
        <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginBottom: 12 }, inter('regular')]}>
          A pessoa recebe um e-mail para criar a senha e já entra com acesso aprovado.
        </Text>
        <Input
          label="E-mail"
          value={inviteEmail}
          onChangeText={(value) => {
            setInviteEmail(value);
            setInviteError('');
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="nome@exemplo.com"
          error={inviteError}
          leftIcon={<Mail color={colors.textSecondary} size={18} style={{ marginRight: 8 }} />}
          onSubmitEditing={() => void sendInvite()}
        />
        <PrimaryButton label="Enviar convite" fullWidth loading={inviting} onPress={() => void sendInvite()} />
        <PrimaryButton label="Cancelar" variant="ghost" fullWidth style={{ marginTop: 8 }} onPress={() => setInviteOpen(false)} />
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
