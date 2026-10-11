import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { downloadCsv } from '@/lib/downloadCsv';
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
};

const DEPLOY_HINT = 'Função admin não implantada. Rode: npx supabase functions deploy admin && npx supabase secrets set ADMIN_EMAIL=previaemailofc@gmail.com';

async function describeInvokeError(error: { name?: string; message: string; context?: unknown }): Promise<string> {
  const context = error.context as { status?: number; json?: () => Promise<unknown> } | undefined;
  const status = context?.status;
  if (status === 404) {
    return DEPLOY_HINT;
  }
  if (status === 401) {
    return 'Sessão expirada. Saia e entre novamente.';
  }
  if (status === 403) {
    return 'Esta conta não tem permissão de administrador.';
  }
  if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') {
    return `Não foi possível contatar a função admin. ${DEPLOY_HINT}`;
  }
  if (context?.json) {
    const body = (await context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) {
      return body.error;
    }
  }
  return error.message;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase não configurado. Preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data: payload, error: invokeError } = await supabase.functions.invoke('admin', { body: { action: 'stats' } });
    if (invokeError) {
      setError(await describeInvokeError(invokeError));
      setLoading(false);
      return;
    }
    setData(payload as Overview);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
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
      setError(await describeInvokeError(invokeError));
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
      setError(await describeInvokeError(invokeError));
      return;
    }
    const deleted = typeof payload?.deleted === 'number' ? payload.deleted : 0;
    useToastStore.getState().show(`${deleted} ${deleted === 1 ? 'operação apagada' : 'operações apagadas'}.`, 'success');
    await load();
  }

  const max = Math.max(1, ...(data?.operationsByType.map((item) => item.count) ?? [1]));

  return (
    <Screen>
      <AppHeader title="Painel Admin — Tréville Aproxima" back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}>
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

function Metric({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <Card style={{ width: '47%' }}>
      <Text style={[{ color: colors.textSecondary }, inter('medium')]}>{label}</Text>
      <Text style={[{ color: colors.textPrimary, fontSize: 28, marginTop: 4 }, inter('extrabold')]}>{value}</Text>
    </Card>
  );
}
