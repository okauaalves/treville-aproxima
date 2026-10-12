import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { CloudOff, Plus, QrCode } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { CONTENT_WIDTH } from '@/components/layout/ContentContainer';
import { Screen } from '@/components/layout/Screen';
import { CriarPlaquinhaModal } from '@/components/plaquinha/CriarPlaquinhaModal';
import { EditarDestinoModal } from '@/components/plaquinha/EditarDestinoModal';
import { PlaquinhaCard } from '@/components/plaquinha/PlaquinhaCard';
import { IconButton } from '@/components/ui/IconButton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/states';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { push, replace } from '@/lib/navigation';
import { gravarPlaquinhaNaTag } from '@/lib/plaquinhaNfc';
import { getPlaquinhas, plaquinhasAvailable, togglePlaquinha, type RedirectLink } from '@/lib/plaquinhas';
import { isSupabaseConfigured } from '@/lib/supabase';
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

export default function PlaquinhasScreen() {
  const { colors, fs } = useTheme();
  const user = useAuthStore((state) => state.user);
  const { isTabletUp, isBigTablet, horizontalPadding } = useBreakpoint();
  const available = plaquinhasAvailable() && !!user;
  const [links, setLinks] = useState<RedirectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RedirectLink | null>(null);
  const cols = isBigTablet ? 2 : 1;
  const padding = isTabletUp ? 32 : horizontalPadding;

  const load = useCallback(async () => {
    if (!available || !user) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setLinks(await getPlaquinhas(user.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as plaquinhas.');
    } finally {
      setLoading(false);
    }
  }, [available, user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggle(link: RedirectLink, next: boolean) {
    setLinks((current) => current.map((item) => (item.id === link.id ? { ...item, is_active: next } : item)));
    try {
      await togglePlaquinha(link.id, next);
      useToastStore.getState().show(next ? 'Plaquinha ativada.' : 'Plaquinha desativada. Quem escanear verá um aviso.', 'success');
    } catch (failure) {
      setLinks((current) => current.map((item) => (item.id === link.id ? { ...item, is_active: link.is_active } : item)));
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível mudar o status.', 'error');
    }
  }

  const header = (
    <AppHeader
      title="Minhas Plaquinhas"
      inset={padding}
      right={
        available && !error ? (
          <IconButton accessibilityLabel="Criar plaquinha" onPress={() => setCreating(true)}>
            <Plus color={colors.primary} size={24} strokeWidth={2.4} />
          </IconButton>
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
            {isSupabaseConfigured
              ? 'Entre na sua conta para criar plaquinhas com QR Code e tag NFC de destino editável.'
              : 'Este app está em modo local, sem servidor. As plaquinhas guardam o destino online para você poder mudar depois, então precisam de uma conta conectada.'}
          </Text>
          {isSupabaseConfigured ? (
            <PrimaryButton label="Entrar" style={{ marginTop: 8, minWidth: 200 }} onPress={() => void useAuthStore.getState().signOut().then(() => replace('/(auth)/login'))} />
          ) : (
            <PrimaryButton label="Voltar ao início" variant="secondary" style={{ marginTop: 8, minWidth: 200 }} onPress={() => replace('/(tabs)')} />
          )}
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen maxWidth={isBigTablet ? CONTENT_WIDTH.home : isTabletUp ? CONTENT_WIDTH.history : null}>
      {header}
      {loading ? (
        <View testID="plaquinhas-loading" style={{ paddingHorizontal: padding, gap: 12 }} accessibilityLabel="Carregando plaquinhas">
          <Skeleton height={150} />
          <Skeleton height={150} />
          <Skeleton height={150} />
        </View>
      ) : error ? (
        <Centered>
          <ErrorState title="Não deu para carregar" message={error} />
          <PrimaryButton label="Tentar de novo" variant="secondary" onPress={() => { setLoading(true); void load(); }} />
        </Centered>
      ) : links.length === 0 ? (
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
              />
            </View>
          )}
        />
      )}
      {user ? (
        <CriarPlaquinhaModal
          visible={creating}
          userId={user.id}
          onClose={() => setCreating(false)}
          onCreated={(id, writeNow) => {
            setCreating(false);
            void load();
            if (writeNow) {
              void gravarPlaquinhaNaTag(id);
            } else {
              push(`/plaquinha/qr/${id}`);
            }
          }}
        />
      ) : null}
      <EditarDestinoModal
        link={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setLinks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          setEditing(null);
        }}
      />
    </Screen>
  );
}
