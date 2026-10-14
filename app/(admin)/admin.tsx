import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ChevronRight, KeyRound, QrCode, ShieldCheck, TriangleAlert, UserCheck } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';

import { CONTENT_WIDTH } from '@/components/layout/ContentContainer';
import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card } from '@/components/ui/Card';
import { CountBadge } from '@/components/ui/CountBadge';
import { Modal } from '@/components/ui/Modal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { countPendingEditRequests } from '@/lib/adminAccess';
import { countPendingAccess, describeAdminError, MIGRATION_PENDING_HINT } from '@/lib/adminApi';
import { downloadCsv } from '@/lib/downloadCsv';
import { push } from '@/lib/navigation';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useToastStore } from '@/stores/toastStore';
import { ContentTypeColors, type ContentType } from '@/theme/colors';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

type Overview = {
  totalUsers: number;
  activeUsers7d: number;
  totalOperations: number;
  totalTemplates: number;
  users: { id: string; name: string; email: string; createdAt: string | null; lastSignInAt: string | null }[];
  operationsByType: { contentType: string; count: number }[];
  recentOperations: { id: string; email: string; contentType: string; createdAt: string; status: string }[];
  topTemplates: { id: string; name: string; useCount: number }[];
  usage?: { scansThisMonth: number; limit: number; percent: number; warning: boolean; monthStart: string } | null;
  links?: { id: string; name: string; destinationType: string; isActive: boolean; scanCount: number }[];
  admins?: { email: string; name: string }[];
  scans?: { total: number; last30d: number };
  warnings?: string[];
};

/** Função antiga pode não mandar os campos novos; nada de quebrar a tela. */
function normalizeOverview(raw: unknown): Overview {
  const value = (raw ?? {}) as Partial<Overview>;
  const list = <T,>(items: T[] | undefined): T[] => (Array.isArray(items) ? items : []);
  return {
    totalUsers: Number(value.totalUsers ?? 0),
    activeUsers7d: Number(value.activeUsers7d ?? 0),
    totalOperations: Number(value.totalOperations ?? 0),
    totalTemplates: Number(value.totalTemplates ?? 0),
    users: list(value.users),
    operationsByType: list(value.operationsByType),
    recentOperations: list(value.recentOperations),
    topTemplates: list(value.topTemplates),
    usage: value.usage ?? null,
    links: list(value.links),
    admins: list(value.admins),
    scans: value.scans,
    warnings: list(value.warnings).filter((item): item is string => typeof item === 'string'),
  };
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'nunca';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'nunca' : date.toLocaleDateString('pt-BR');
}

export default function AdminScreen() {
  const { colors, fs, isDark } = useTheme();
  const { serverMissing } = useIsAdmin();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrationPending, setMigrationPending] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);
  const [pendingEdits, setPendingEdits] = useState(0);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase não configurado. Preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setMigrationPending('');
    const { data: payload, error: invokeError } = await supabase.functions.invoke('admin', { body: { action: 'overview' } });
    if (invokeError) {
      const info = await describeAdminError(invokeError);
      if (info.migrationPending) {
        setMigrationPending(info.message);
      } else {
        setError(info.message);
      }
      setLoading(false);
      return;
    }
    setData(normalizeOverview(payload));
    setLoading(false);
  }, []);

  async function showError(invokeError: { name?: string; message: string; context?: unknown }) {
    const info = await describeAdminError(invokeError);
    if (info.migrationPending) {
      setMigrationPending(info.message);
    } else {
      setError(info.message);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void load();
      void countPendingAccess().then(setPending);
      void countPendingEditRequests().then(setPendingEdits);
    }, [load]),
  );

  async function exportCsv() {
    if (!supabase) {
      return;
    }
    setBusy(true);
    const { data: payload, error: invokeError } = await supabase.functions.invoke('admin', { body: { action: 'export' } });
    setBusy(false);
    if (invokeError) {
      await showError(invokeError);
      return;
    }
    if (!payload || typeof payload.csv !== 'string') {
      setError('A função admin não retornou o CSV.');
      return;
    }
    await downloadCsv('treville-admin.csv', payload.csv);
  }

  async function cleanup() {
    if (!supabase) {
      return;
    }
    setConfirmCleanup(false);
    setBusy(true);
    const { data: payload, error: invokeError } = await supabase.functions.invoke('admin', { body: { action: 'cleanup' } });
    setBusy(false);
    if (invokeError) {
      await showError(invokeError);
      return;
    }
    const deleted = typeof payload?.deleted === 'number' ? payload.deleted : 0;
    useToastStore.getState().show(`${deleted} ${deleted === 1 ? 'operação apagada' : 'operações apagadas'}.`, 'success');
    await load();
  }

  const max = Math.max(1, ...(data?.operationsByType.map((item) => item.count) ?? [1]));
  const warnings = data?.warnings ?? [];
  const showMigrationCard = serverMissing || !!migrationPending || warnings.length > 0;

  return (
    <Screen maxWidth={CONTENT_WIDTH.admin}>
      <AppHeader title="Painel Admin — Tréville Aproxima" back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}>
        {showMigrationCard ? (
          <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
            <View testID="admin-aviso-migracao" accessible accessibilityRole="alert" style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <TriangleAlert color={colors.warning} size={22} />
              <View style={{ flex: 1 }}>
                <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>{migrationPending || MIGRATION_PENDING_HINT}</Text>
                <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginTop: 4 }, inter('regular')]}>
                  Você entrou pelo e-mail de admin, mas as aprovações, solicitações e a lista de admins só funcionam depois das migrações e do deploy da função admin.
                </Text>
                {warnings.map((item) => (
                  <Text key={item} style={[{ color: colors.textSecondary, fontSize: fs(12), marginTop: 4 }, inter('regular')]}>• {item}</Text>
                ))}
              </View>
            </View>
          </Card>
        ) : null}
        <AdminShortcut testID="admin-atalho-acessos" title="Gerenciar acessos" subtitle="Aprovar, bloquear e convidar usuários" icon={<UserCheck color={colors.primary} size={22} />} badge={pending} onPress={() => push('/access')} />
        <AdminShortcut testID="admin-atalho-edicao" title="Solicitações de edição" subtitle="Liberar, negar e revogar edição de plaquinhas" icon={<KeyRound color={colors.primary} size={22} />} badge={pendingEdits} onPress={() => push('/edit-requests')} />
        <AdminShortcut testID="admin-atalho-admins" title="Administradores" subtitle="Adicionar e remover admins" icon={<ShieldCheck color={colors.primary} size={22} />} onPress={() => push('/admins')} />
        <AdminShortcut testID="admin-atalho-lote" title="Gerar QR Codes em lote" subtitle="Até 100 plaquinhas com PDF e CSV" icon={<QrCode color={colors.primary} size={22} />} onPress={() => push('/qr-batch')} />
        {loading ? (
          <>
            <Skeleton height={88} />
            <Skeleton height={88} />
            <Skeleton height={160} />
          </>
        ) : null}
        {!loading && error ? <Text accessibilityRole="alert" style={[{ color: colors.error }, inter('medium')]}>{error}</Text> : null}
        {!loading && data ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <Metric label="Usuários" value={data.totalUsers} />
              <Metric label="Ativos 7 dias" value={data.activeUsers7d} />
              <Metric label="Operações" value={data.totalOperations} />
              <Metric label="Templates" value={data.totalTemplates} />
            </View>
            {data.scans ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Metric label="Scans (total)" value={data.scans.total} />
                <Metric label="Scans 30 dias" value={data.scans.last30d} />
              </View>
            ) : null}
            <UsageCard usage={data.usage ?? null} />
            <Card>
              <Text style={[{ color: colors.textPrimary, marginBottom: 8 }, inter('bold')]}>Plaquinhas</Text>
              {(data.links ?? []).length === 0 ? <Text style={{ color: colors.textSecondary }}>Nenhuma plaquinha.</Text> : null}
              {(data.links ?? []).slice(0, 20).map((link) => (
                <Text key={link.id} style={[{ color: colors.textPrimary, marginTop: 6 }, inter('regular')]}>
                  {link.name || link.id} · {link.destinationType} · {link.isActive ? 'ativa' : 'inativa'} · {link.scanCount} scans
                </Text>
              ))}
            </Card>
            <Card>
              <Text style={[{ color: colors.textPrimary, marginBottom: 8 }, inter('bold')]}>Administradores</Text>
              {(data.admins ?? []).map((item) => (
                <Text key={item.email} style={[{ color: colors.textPrimary, marginTop: 6 }, inter('regular')]}>
                  {item.name ? `${item.name} · ` : ''}{item.email}
                </Text>
              ))}
            </Card>
            <Card>
              <Text style={[{ color: colors.textPrimary, marginBottom: 8 }, inter('bold')]}>Usuários</Text>
              {data.users.length === 0 ? <Text style={{ color: colors.textSecondary }}>Nenhum usuário sincronizado.</Text> : null}
              {data.users.map((user) => (
                <View key={user.id} style={{ marginTop: 8 }}>
                  <Text style={[{ color: colors.textPrimary }, inter('semibold')]}>{user.name} · {user.email}</Text>
                  <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('regular')]}>
                    Cadastro {formatDate(user.createdAt)} · Último acesso {formatDate(user.lastSignInAt)}
                  </Text>
                </View>
              ))}
            </Card>
            <Card>
              <Text style={[{ color: colors.textPrimary, marginBottom: 8 }, inter('bold')]}>Operações por tipo</Text>
              {data.operationsByType.length === 0 ? <Text style={{ color: colors.textSecondary }}>Sem operações.</Text> : null}
              {data.operationsByType.map((item) => {
                const tint = ContentTypeColors[item.contentType as ContentType];
                const color = tint ? (isDark ? tint.dark : tint.light) : colors.primary;
                return (
                  <View key={item.contentType} style={{ marginTop: 8 }}>
                    <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('medium')]}>{item.contentType} · {item.count}</Text>
                    <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.backgroundSecondary, marginTop: 4 }}>
                      <View style={{ width: `${Math.round((item.count / max) * 100)}%`, height: 10, borderRadius: 6, backgroundColor: color }} />
                    </View>
                  </View>
                );
              })}
            </Card>
            <Card>
              <Text style={[{ color: colors.textPrimary, marginBottom: 8 }, inter('bold')]}>Últimas operações</Text>
              {data.recentOperations.length === 0 ? <Text style={{ color: colors.textSecondary }}>Nenhuma.</Text> : null}
              {data.recentOperations.map((item) => (
                <Text key={item.id} style={[{ color: colors.textPrimary, marginTop: 6 }, inter('regular')]}>
                  {item.contentType} · {item.email || 'sem e-mail'} · {item.status}
                </Text>
              ))}
            </Card>
            <Card>
              <Text style={[{ color: colors.textPrimary, marginBottom: 8 }, inter('bold')]}>Templates mais usados</Text>
              {data.topTemplates.length === 0 ? <Text style={{ color: colors.textSecondary }}>Nenhum.</Text> : null}
              {data.topTemplates.map((item) => (
                <Text key={item.id} style={[{ color: colors.textPrimary, marginTop: 6 }, inter('regular')]}>{item.name} · {item.useCount}</Text>
              ))}
            </Card>
            <PrimaryButton label="Exportar dados (CSV)" variant="secondary" fullWidth loading={busy} onPress={() => void exportCsv()} />
            <PrimaryButton label="Limpar operações antigas (>90 dias)" tone="danger" fullWidth disabled={busy} onPress={() => setConfirmCleanup(true)} />
          </>
        ) : null}
      </ScrollView>
      <Modal visible={confirmCleanup} title="Limpar operações" onClose={() => setConfirmCleanup(false)}>
        <Text style={[{ color: colors.textSecondary, marginBottom: 12 }, inter('regular')]}>Apaga no servidor as operações com mais de 90 dias. Isso não desfaz.</Text>
        <PrimaryButton label="Apagar" tone="danger" fullWidth onPress={() => void cleanup()} />
      </Modal>
    </Screen>
  );
}

/** Scans do mês (contados no servidor) contra a cota de invocações do plano. Aviso acima de 70%. */
function UsageCard({ usage }: { usage: Overview['usage'] }) {
  const { colors, fs } = useTheme();
  if (!usage) {
    return (
      <Card>
        <Text style={[{ color: colors.textPrimary, marginBottom: 4 }, inter('bold')]}>Uso do mês</Text>
        <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>Sem dados de scans ainda (tabela de plaquinhas não aplicada ou função admin antiga).</Text>
      </Card>
    );
  }
  const width = `${Math.min(100, Math.max(0, usage.percent))}%` as const;
  const barColor = usage.warning ? colors.warning : colors.primary;
  return (
    <Card>
      <View testID="admin-uso-mes" accessible accessibilityLabel={`Uso do mês: ${usage.scansThisMonth} scans, ${usage.percent}% de ${usage.limit} invocações`}>
        <Text style={[{ color: colors.textPrimary, marginBottom: 4 }, inter('bold')]}>Uso do mês</Text>
        <Text style={[{ color: colors.textPrimary, fontSize: fs(26) }, inter('extrabold')]}>{usage.scansThisMonth.toLocaleString('pt-BR')} scans</Text>
        <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginTop: 2 }, inter('medium')]}>
          {usage.percent.toLocaleString('pt-BR')}% de {usage.limit.toLocaleString('pt-BR')} invocações/mês (plano Free do Supabase)
        </Text>
        <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.backgroundSecondary, marginTop: 10 }}>
          <View style={{ width, height: 10, borderRadius: 6, backgroundColor: barColor }} />
        </View>
        {usage.warning ? (
          <Text accessibilityRole="alert" style={[{ color: colors.warning, fontSize: fs(13), marginTop: 10 }, inter('bold')]}>
            Acima de 70% da cota. Considere o plano Pro ou reduzir scans repetidos.
          </Text>
        ) : null}
        <Text style={[{ color: colors.textMuted, fontSize: fs(11), marginTop: 8 }, inter('regular')]}>
          Cada scan é uma invocação da função redirect; a página de perfil usa mais uma. Fonte da cota: supabase.com/docs/guides/functions/pricing
        </Text>
      </View>
    </Card>
  );
}

function AdminShortcut({ title, subtitle, icon, badge = 0, onPress, testID }: { title: string; subtitle: string; icon: ReactNode; badge?: number; onPress: () => void; testID?: string }) {
  const { colors, fs } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={badge > 0 ? `${title}: ${badge} pendentes` : title} padding={16}>
      <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryGlow, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>{title}</Text>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{subtitle}</Text>
        </View>
        {badge > 0 ? <CountBadge count={badge} /> : null}
        <ChevronRight color={colors.textMuted} size={20} />
      </View>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <Card style={{ width: '47%' }}>
      <Text style={[{ color: colors.textSecondary }, inter('medium')]}>{label}</Text>
      <Text style={[{ color: colors.textPrimary, fontSize: 28, marginTop: 4 }, inter('extrabold')]}>{value}</Text>
    </Card>
  );
}
