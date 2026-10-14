import { useCallback, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Crown, Mail, ShieldCheck, Trash2, User, UserPlus } from 'lucide-react-native';
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
import { addAdmin, listAdmins, removeAdmin, type AdminEntry } from '@/lib/adminAccess';
import { ADMIN_NAME_MAX, canRemoveAdmin, formatDatePtBr } from '@/lib/editAccessLogic';
import { checkEmail } from '@/supabase/functions/_shared/adminAccess';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export default function AdminsScreen() {
  const { colors, fs } = useTheme();
  const selfEmail = useAuthStore((state) => state.user?.email ?? null);
  const [items, setItems] = useState<AdminEntry[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<AdminEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await listAdmins());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os administradores.');
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

  function openAdd() {
    setEmail('');
    setName('');
    setFormError('');
    setAdding(true);
  }

  async function save() {
    const checked = checkEmail(email);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    setSaving(true);
    try {
      const added = await addAdmin(checked.value, name);
      setAdding(false);
      useToastStore.getState().show(`${added} agora é administrador.`, 'success');
      void load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível adicionar.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removing) {
      return;
    }
    setBusy(true);
    try {
      await removeAdmin(removing.email);
      setItems((current) => (current ?? []).filter((item) => item.email !== removing.email));
      useToastStore.getState().show(`${removing.email} não é mais administrador.`, 'warning');
      setRemoving(null);
    } catch (caught) {
      useToastStore.getState().show(caught instanceof Error ? caught.message : 'Não foi possível remover.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const total = items?.length ?? 0;

  return (
    <Screen maxWidth={CONTENT_WIDTH.admin}>
      <AppHeader
        title="Administradores"
        back
        right={
          <IconButton accessibilityLabel="Adicionar admin" onPress={openAdd}>
            <UserPlus color={colors.primary} size={22} />
          </IconButton>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        <Text style={[{ color: colors.textSecondary, fontSize: fs(14), lineHeight: fs(20) }, inter('regular')]}>
          Admins aprovam cadastros, liberam edição de plaquinhas e geram lotes. O acesso vale quando a pessoa entra com este e-mail já confirmado.
        </Text>
        <PrimaryButton label="Adicionar admin" variant="secondary" fullWidth icon={<UserPlus color={colors.primary} size={18} />} onPress={openAdd} />
        {items === null ? (
          <>
            <Skeleton height={96} />
            <Skeleton height={96} />
          </>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={[{ color: colors.error }, inter('medium')]}>{error}</Text> : null}
        {(items ?? []).map((item) => {
          const self = item.email === (selfEmail ?? '').trim().toLowerCase();
          const check = canRemoveAdmin({ target: item.email, self: selfEmail, total });
          return (
            <Card key={item.email} padding={16}>
              <View testID="admin-card" style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryGlow, alignItems: 'center', justifyContent: 'center' }}>
                    {item.isPrimary ? <Crown color={colors.primary} size={22} /> : <User color={colors.primary} size={22} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>
                      {item.name || item.email}
                      {self ? ' (você)' : ''}
                    </Text>
                    <Text numberOfLines={1} ellipsizeMode="middle" style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{item.email}</Text>
                    {item.createdAt ? <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginTop: 2 }, inter('medium')]}>Desde {formatDatePtBr(item.createdAt)}</Text> : null}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Badge label="Admin" color={colors.success} bg={colors.successBg} icon={<ShieldCheck color={colors.success} size={14} />} />
                  {item.isPrimary ? <Badge label="Principal" color={colors.primary} bg={colors.primaryGlow} icon={<Crown color={colors.primary} size={14} />} /> : null}
                  {!item.hasAccount ? <Badge label="Ainda sem conta" color={colors.warning} bg={colors.warningBg} icon={<Mail color={colors.warning} size={14} />} /> : null}
                </View>
                {item.isPrimary ? null : (
                  <View style={{ gap: 6 }}>
                    <PrimaryButton
                      label="Remover"
                      variant="ghost"
                      fullWidth
                      disabled={!check.ok}
                      accessibilityLabel={`Remover ${item.email}`}
                      icon={<Trash2 color={check.ok ? colors.danger : colors.textMuted} size={18} />}
                      onPress={() => setRemoving(item)}
                    />
                    {!check.ok ? <Text style={[{ color: colors.textMuted, fontSize: fs(12), textAlign: 'center' }, inter('medium')]}>{check.reason}</Text> : null}
                  </View>
                )}
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <Modal visible={adding} title="Adicionar admin" onClose={() => (saving ? undefined : setAdding(false))}>
        <Input
          label="E-mail"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setFormError('');
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="nome@exemplo.com"
          leftIcon={<Mail color={colors.textSecondary} size={18} style={{ marginRight: 8 }} />}
        />
        <Input
          label="Nome"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setFormError('');
          }}
          maxLength={ADMIN_NAME_MAX}
          placeholder="Nome do administrador"
          error={formError}
          leftIcon={<User color={colors.textSecondary} size={18} style={{ marginRight: 8 }} />}
          onSubmitEditing={() => void save()}
        />
        <PrimaryButton label="Adicionar" fullWidth loading={saving} onPress={() => void save()} />
        <PrimaryButton label="Cancelar" variant="ghost" fullWidth style={{ marginTop: 8 }} onPress={() => setAdding(false)} />
      </Modal>
      <Modal visible={removing !== null} title="Remover administrador" onClose={() => (busy ? undefined : setRemoving(null))}>
        <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginBottom: 14, lineHeight: fs(20) }, inter('regular')]}>
          {removing?.email} perde o acesso ao painel. Continua com acesso normal ao app.
        </Text>
        <PrimaryButton label="Remover" tone="danger" fullWidth loading={busy} icon={<Trash2 color={colors.onDanger} size={18} />} onPress={() => void confirmRemove()} />
        <PrimaryButton label="Cancelar" variant="ghost" fullWidth style={{ marginTop: 8 }} onPress={() => setRemoving(null)} />
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
