import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { CloudOff, KeyRound, Plus, QrCode } from 'lucide-react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { CONTENT_WIDTH } from '@/components/layout/ContentContainer';
import { Screen } from '@/components/layout/Screen';
import { CriarPlaquinhaModal } from '@/components/plaquinha/CriarPlaquinhaModal';
import { EditarDestinoModal } from '@/components/plaquinha/EditarDestinoModal';
import { EditRequestCard } from '@/components/plaquinha/EditRequestCard';
import { PlaquinhaCard } from '@/components/plaquinha/PlaquinhaCard';
import { SolicitarAcessoModal } from '@/components/plaquinha/SolicitarAcessoModal';
import { IconButton } from '@/components/ui/IconButton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getMyEditRequests, getSharedPlaquinhas } from '@/lib/adminAccess';
import { editBadge, latestByLink, type EditBadge, type EditRequestRow } from '@/lib/editAccessLogic';
import { goToLogin, push, replace } from '@/lib/navigation';
import { gravarPlaquinhaNaTag } from '@/lib/plaquinhaNfc';
import { getPlaquinhas, isSessionError, plaquinhasAvailable, togglePlaquinha, type RedirectLink } from '@/lib/plaquinhas';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 48, gap: 10 }}>{children}</View>;
}

function BigIcon({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryGlow, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>{children}</View>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ marginTop: 12, marginBottom: 10 }}>
      <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(17) }, inter('extrabold')]}>
        {title}
      </Text>
      {subtitle ? <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginTop: 2 }, inter('regular')]}>{subtitle}</Text> : null}
    </View>
  );
}

export default function PlaquinhasScreen() {
  const { colors, fs } = useTheme();
  const user = useAuthStore((state) => state.user);
  const { isTabletUp, isBigTablet, horizontalPadding } = useBreakpoint();
  const { solicitar } = useLocalSearchParams<{ solicitar?: string }>();
  const available = plaquinhasAvailable();
  const [links, setLinks] = useState<RedirectLink[]>([]);
  const [requests, setRequests] = useState<EditRequestRow[]>([]);
  const [shared, setShared] = useState<RedirectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RedirectLink | null>(null);
  const [requestCode, setRequestCode] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNonce, setRequestNonce] = useState(0);
  const cols = isBigTablet ? 2 : 1;
  const padding = isTabletUp ? 32 : horizontalPadding;

  /** Pedidos e compartilhadas falham em silêncio (migration ainda não aplicada): a lista própria continua. */
  const loadShared = useCallback(async () => {
    try {
      const mine = await getMyEditRequests();
      setRequests(mine);
      setShared(await getSharedPlaquinhas(mine));
    } catch (failure) {
      console.warn('Falha ao carregar plaquinhas compartilhadas', failure);
      setRequests([]);
      setShared([]);
    }
  }, []);

  /** Recarrega a lista (foco, criação). Falha de consulta vira estado vazio; só sessão inválida vai ao login. */
  const load = useCallback(async () => {
    if (!available) {
      setLoading(false);
      return;
    }
    if (!user) {
      goToLogin();
      return;
    }
    try {
      const [own] = await Promise.all([getPlaquinhas(), loadShared()]);
      setLinks(own);
    } catch (failure) {
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      console.warn('Falha ao carregar plaquinhas', failure);
      setLinks([]);
    }
    setLoading(false);
  }, [available, user, loadShared]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Vindo da leitura de uma tag de plaquinha alheia: abre o pedido já com o código.
  const param = typeof solicitar === 'string' && available ? solicitar : '';
  const [seenParam, setSeenParam] = useState('');
  if (param !== seenParam) {
    setSeenParam(param);
    if (param) {
      setRequestCode(param);
      setRequestNonce((value) => value + 1);
      setRequestOpen(true);
    }
  }
  useEffect(() => {
    if (param) {
      router.setParams({ solicitar: undefined });
    }
  }, [param]);

  const latest = useMemo(() => latestByLink(requests), [requests]);
  const badges = useMemo(() => new Map<string, EditBadge>(latest.map((row) => [row.link_id, editBadge(row)])), [latest]);
  const ownIds = useMemo(() => new Set(links.map((link) => link.id)), [links]);
  const sharedIds = useMemo(() => new Set(shared.map((link) => link.id)), [shared]);
  const waiting = latest.filter((row) => !(badges.get(row.link_id)?.canEdit && sharedIds.has(row.link_id)));

  function openRequest(code: string | null = null) {
    setRequestCode(code);
    setRequestNonce((value) => value + 1);
    setRequestOpen(true);
  }

  async function toggle(link: RedirectLink, next: boolean) {
    setLinks((current) => current.map((item) => (item.id === link.id ? { ...item, is_active: next } : item)));
    try {
      await togglePlaquinha(link.id, next);
      useToastStore.getState().show(next ? 'Plaquinha ativada.' : 'Plaquinha desativada. Quem escanear verá um aviso.', 'success');
    } catch (failure) {
      setLinks((current) => current.map((item) => (item.id === link.id ? { ...item, is_active: link.is_active } : item)));
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível mudar o status.', 'error');
    }
  }

  const header = (
    <AppHeader
      title="Minhas Plaquinhas"
      inset={padding}
      right={
        available ? (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconButton accessibilityLabel="Solicitar acesso a uma plaquinha" onPress={() => openRequest()}>
              <KeyRound color={colors.primary} size={22} strokeWidth={2.2} />
            </IconButton>
            <IconButton accessibilityLabel="Criar plaquinha" onPress={() => setCreating(true)}>
              <Plus color={colors.primary} size={24} strokeWidth={2.4} />
            </IconButton>
          </View>
        ) : null
      }
    />
  );

  if (!available) {
    return (
      <Screen maxWidth={isTabletUp ? CONTENT_WIDTH.history : null}>
        {header}
        <Centered>
          <BigIcon>
            <CloudOff color={colors.primary} size={44} strokeWidth={1.8} />
          </BigIcon>
          <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(20), textAlign: 'center' }, inter('extrabold')]}>
            Plaquinhas precisam de conta e conexão
          </Text>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(15), textAlign: 'center', lineHeight: fs(22), maxWidth: 420 }, inter('regular')]}>
            Este app está em modo local, sem servidor. As plaquinhas guardam o destino online para você poder mudar depois, então precisam de uma conta conectada.
          </Text>
          <PrimaryButton label="Voltar ao início" variant="secondary" style={{ marginTop: 8, minWidth: 200 }} onPress={() => replace('/(tabs)')} />        </Centered>
      </Screen>
    );
  }

  const requestButton = (
    <PrimaryButton
      label="Solicitar acesso a uma plaquinha"
      variant="secondary"
      fullWidth
      icon={<KeyRound color={colors.primary} size={18} />}
      onPress={() => openRequest()}
    />
  );

  const gridItem = cols > 1 ? { width: '49%' as const } : { width: '100%' as const };

  const footer = (
    <View style={{ paddingBottom: 8 }}>
      {links.length === 0 ? (
        <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginBottom: 4 }, inter('regular')]}>Você ainda não criou plaquinhas.</Text>
      ) : null}
      {shared.length > 0 ? (
        <View testID="secao-compartilhadas">
          <SectionTitle title="Compartilhadas comigo" subtitle="Você pode mudar o destino e gravar a tag NFC destas plaquinhas." />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {shared.map((item, index) => (
              <View key={item.id} style={gridItem}>
                <PlaquinhaCard
                  link={item}
                  index={index}
                  access={badges.get(item.id) ?? editBadge({ status: 'approved', expires_at: null })}
                  onEdit={() => setEditing(item)}
                  onQr={() => push(`/plaquinha/qr/${item.id}`)}
                  onWrite={() => void gravarPlaquinhaNaTag(item.id)}
                  onStats={() => push(`/plaquinha/stats/${item.id}`)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {waiting.length > 0 ? (
        <View testID="secao-solicitacoes">
          <SectionTitle title="Minhas solicitações" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {waiting.map((row) => (
              <View key={row.id} style={gridItem}>
                <EditRequestCard request={row} onRequestAgain={() => openRequest(row.link_id)} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={{ marginTop: 8 }}>{requestButton}</View>
    </View>
  );

  return (
    <Screen maxWidth={isBigTablet ? CONTENT_WIDTH.home : isTabletUp ? CONTENT_WIDTH.history : null}>
      {header}
      {loading ? (
        <View testID="plaquinhas-loading" style={{ paddingHorizontal: padding, gap: 12 }} accessibilityLabel="Carregando plaquinhas">
          <Skeleton height={150} />
          <Skeleton height={150} />
          <Skeleton height={150} />
        </View>
      ) : links.length === 0 && shared.length === 0 && waiting.length === 0 ? (
        <Centered>
          <BigIcon>
            <QrCode color={colors.primary} size={48} strokeWidth={1.8} />
          </BigIcon>
          <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(20), textAlign: 'center' }, inter('extrabold')]}>
            Nenhuma plaquinha ainda
          </Text>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(15), textAlign: 'center', lineHeight: fs(22), maxWidth: 420 }, inter('regular')]}>
            Crie uma plaquinha para ter um QR Code e tag NFC com destino que você pode mudar quando quiser.
          </Text>
          <PrimaryButton label="Criar primeira plaquinha" icon={<Plus color={colors.onPrimary} size={20} />} style={{ marginTop: 8 }} onPress={() => setCreating(true)} />
          <Text style={[{ color: colors.textSecondary, fontSize: fs(14), textAlign: 'center', marginTop: 6 }, inter('regular')]}>Recebeu uma plaquinha pronta?</Text>
          <View style={{ width: '100%', maxWidth: 360 }}>{requestButton}</View>
        </Centered>
      ) : (
        <FlatList
          key={`plaquinhas-${cols}`}
          testID="plaquinhas-list"
          data={cols > 1 && links.length % cols !== 0 ? [...links, null] : links}
          numColumns={cols}
          keyExtractor={(item) => item?.id ?? 'filler'}
          columnWrapperStyle={cols > 1 ? { gap: 12 } : undefined}
          contentContainerStyle={{ paddingHorizontal: padding, paddingBottom: 24 }}
          ListFooterComponent={footer}
          renderItem={({ item, index }) => !item ? <View style={{ flex: 1 }} importantForAccessibility="no-hide-descendants" /> : (
            <View style={{ flex: 1 }}>
              <PlaquinhaCard
                link={item}
                index={index}
                onEdit={() => setEditing(item)}
                onQr={() => push(`/plaquinha/qr/${item.id}`)}
                onWrite={() => void gravarPlaquinhaNaTag(item.id)}
                onToggle={(next) => void toggle(item, next)}
                onProfile={() => push(`/perfil/links/${item.id}`)}
                onStats={() => push(`/plaquinha/stats/${item.id}`)}
              />
            </View>
          )}
        />
      )}
      {user ? (
        <CriarPlaquinhaModal
          visible={creating}
          onClose={() => setCreating(false)}
          onCreated={({ id, writeNow, profile }) => {
            setCreating(false);
            void load();
            push(profile ? `/perfil/links/${id}` : `/plaquinha/qr/${id}`);
            if (writeNow) {
              void gravarPlaquinhaNaTag(id);
            }
          }}
        />
      ) : null}
      <EditarDestinoModal
        link={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          // O banco liga a plaquinha "Sem destino" quando ela recebe o primeiro destino.
          const apply = (item: RedirectLink) => (item.id === updated.id ? { ...updated, is_active: item.destination_type === 'empty' ? true : updated.is_active } : item);
          setLinks((current) => current.map(apply));
          setShared((current) => current.map(apply));
          setEditing(null);
        }}
      />
      <SolicitarAcessoModal
        key={`solicitar-${requestNonce}`}
        visible={requestOpen}
        initialCode={requestCode}
        onClose={() => setRequestOpen(false)}
        onSent={() => {
          setRequestOpen(false);
          void loadShared();
        }}
        isOwn={(id) => ownIds.has(id)}
        activeAccess={(id) => {
          const badge = badges.get(id);
          return badge && (badge.kind === 'waiting' || (badge.kind === 'authorized' && sharedIds.has(id))) ? badge : undefined;
        }}
      />
    </Screen>
  );
}
