import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Copy, Eye, Plus } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { LinkEditorItem } from '@/components/perfil/LinkEditorItem';
import { ProfileLinkIcon } from '@/components/perfil/ProfileIcons';
import { ProfilePagePreview } from '@/components/perfil/ProfilePagePreview';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/states';
import { Toggle } from '@/components/ui/Toggle';
import { getProfile, getProfileLinks, LINK_PRESETS, moveItem, normalizeLinkUrl, saveProfileLinks, toggleProfilePage, validateProfileLinks, type Profile, type ProfileLink } from '@/lib/perfil';
import { getLinkUrl, getPlaquinha, plaquinhasAvailable, type RedirectLink } from '@/lib/plaquinhas';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { PROFILE_LINKS_MAX, renderProfilePage, sanitizeProfile } from '@/supabase/functions/_shared/profilePage';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

type Draft = ProfileLink & { key: string };

export default function ProfileLinksScreen() {
  const { colors, fs } = useTheme();
  const insets = useSafeAreaInsets();
  const { plaquinhaId } = useLocalSearchParams<{ plaquinhaId: string }>();
  const user = useAuthStore((state) => state.user);
  const available = plaquinhasAvailable() && !!user;
  const keySeed = useRef(0);
  const [link, setLink] = useState<RedirectLink | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<{ index: number; message: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const withKeys = useCallback((list: ProfileLink[]): Draft[] => list.map((item) => ({ ...item, key: item.id ?? `new-${(keySeed.current += 1)}` })), []);

  const load = useCallback(async () => {
    if (!available || !plaquinhaId) {
      setLoading(false);
      return;
    }
    try {
      const found = await getPlaquinha(plaquinhaId);
      if (!found) {
        setError('Essa plaquinha não existe ou não é sua.');
        return;
      }
      const [savedLinks, savedProfile] = await Promise.all([getProfileLinks(plaquinhaId), getProfile()]);
      setLink(found);
      setProfile(savedProfile);
      setItems(withKeys(savedLinks));
      setDirty(false);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar os links.');
    } finally {
      setLoading(false);
    }
  }, [available, plaquinhaId, withKeys]);

  useFocusEffect(
    useCallback(() => {
      if (!dirty) {
        void load();
      }
    }, [load, dirty]),
  );

  function update(next: Draft[]) {
    setItems(next);
    setDirty(true);
    setItemError(null);
  }

  async function setProfileEnabled(next: boolean) {
    if (!link) {
      return;
    }
    setToggling(true);
    setLink({ ...link, profile_enabled: next });
    try {
      await toggleProfilePage(link.id, next);
      useToastStore.getState().show(next ? 'Página de perfil ativada. Quem escanear vê seus links.' : 'Página desativada. O scan vai direto ao destino.', 'success');
    } catch (failure) {
      setLink({ ...link });
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível mudar a página.', 'error');
    } finally {
      setToggling(false);
    }
  }

  async function save() {
    if (!link) {
      return;
    }
    const check = validateProfileLinks(items);
    if (!check.ok) {
      setItemError({ index: check.index, message: check.error });
      useToastStore.getState().show(`Confira o link ${check.index + 1}.`, 'warning');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveProfileLinks(link.id, items);
      setItems(withKeys(saved));
      setDirty(false);
      useToastStore.getState().show('Links salvos.', 'success');
    } catch (failure) {
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível salvar os links.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const previewHtml = useMemo(() => {
    if (!link) {
      return '';
    }
    const data = sanitizeProfile(
      {
        displayName: profile?.display_name,
        fallbackName: link.name,
        bio: profile?.bio,
        avatarUrl: profile?.avatar_url,
        themeColor: profile?.theme_color,
        links: items.map((item) => ({ title: item.title, url: normalizeLinkUrl(item.icon, item.url), icon: item.icon, is_active: item.is_active })),
      },
      process.env.EXPO_PUBLIC_SUPABASE_URL,
    );
    return renderProfilePage(data, { preview: true });
  }, [items, link, profile]);

  async function copyLink() {
    if (!link) {
      return;
    }
    await Clipboard.setStringAsync(getLinkUrl(link.id));
    useToastStore.getState().show(link.profile_enabled ? 'Link do perfil copiado.' : 'Link copiado. Ative a página para ele abrir o perfil.', 'success');
  }

  const enabled = link?.profile_enabled === true;

  return (
    <Screen>
      <AppHeader title="Links do perfil" back />
      {!available ? (
        <View style={{ paddingHorizontal: 20 }}>
          <ErrorState title="Perfil precisa de conta e conexão" message="Entre com sua conta para editar os links." />
        </View>
      ) : loading ? (
        <View style={{ paddingHorizontal: 20 }} accessibilityLabel="Carregando links">
          <Skeleton height={96} />
          <Skeleton height={180} />
          <Skeleton height={180} />
        </View>
      ) : error || !link ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <ErrorState title="Links indisponíveis" message={error ?? 'Plaquinha não encontrada.'} />
          <PrimaryButton label="Tentar de novo" variant="secondary" onPress={() => { setLoading(true); void load(); }} />
        </View>
      ) : (
        <>
          <ScrollView testID="perfil-links" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            <Text numberOfLines={1} style={[{ color: colors.textSecondary, fontSize: fs(13), marginBottom: 10 }, inter('semibold')]}>
              Plaquinha: {link.name}
            </Text>
            <Card padding={16} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>Página de perfil ativada</Text>
                  <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginTop: 2, lineHeight: fs(18) }, inter('regular')]}>
                    {enabled ? 'Quem escanear vê sua mini página com os links abaixo.' : 'Desligada: quem escanear vai direto ao destino da plaquinha.'}
                  </Text>
                </View>
                <Toggle value={enabled} onValueChange={(value) => { if (!toggling) void setProfileEnabled(value); }} accessibilityLabel="Página de perfil ativada" />
              </View>
            </Card>

            {items.length === 0 ? (
              <Card padding={18} style={{ marginBottom: 12 }}>
                <Text style={[{ color: colors.textSecondary, fontSize: fs(14), textAlign: 'center' }, inter('regular')]}>Nenhum link ainda. Toque em Adicionar link.</Text>
              </Card>
            ) : (
              items.map((item, index) => (
                <LinkEditorItem
                  key={item.key}
                  link={item}
                  index={index}
                  total={items.length}
                  error={itemError?.index === index ? itemError.message : undefined}
                  onChange={(patch) => update(items.map((current, position) => (position === index ? { ...current, ...patch } : current)))}
                  onMove={(direction) => update(moveItem(items, index, index + direction))}
                  onRemove={() => update(items.filter((_, position) => position !== index))}
                />
              ))
            )}

            <View style={{ gap: 10, marginTop: 4 }}>
              <PrimaryButton
                label="Adicionar link"
                variant="secondary"
                fullWidth
                disabled={items.length >= PROFILE_LINKS_MAX}
                icon={<Plus color={colors.primary} size={20} />}
                onPress={() => setAdding(true)}
              />
              <PrimaryButton label="Ver como ficará" variant="secondary" fullWidth icon={<Eye color={colors.primary} size={20} />} onPress={() => setPreviewing(true)} />
              <PrimaryButton label="Copiar link do perfil" variant="ghost" fullWidth icon={<Copy color={colors.primary} size={20} />} onPress={() => void copyLink()} />
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
            <PrimaryButton label={dirty ? 'Salvar links' : 'Links salvos'} fullWidth loading={saving} disabled={!dirty} onPress={() => void save()} />
          </View>
        </>
      )}

      <BottomSheet visible={adding} onClose={() => setAdding(false)} accessibilityLabel="Fechar atalhos de link">
        <View testID="adicionar-link">
          <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(20), marginBottom: 12 }, inter('extrabold')]}>
            Adicionar link
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {LINK_PRESETS.map((preset) => (
              <Pressable
                key={preset.icon}
                accessibilityRole="button"
                accessibilityLabel={preset.label}
                onPress={() => {
                  update([...items, ...withKeys([{ id: null, title: preset.title, url: '', icon: preset.icon, is_active: true }])]);
                  setAdding(false);
                }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.primaryGlow : colors.surface })}
              >
                <ProfileLinkIcon icon={preset.icon} color={colors.primary} />
                <Text style={[{ color: colors.textPrimary, fontSize: fs(14) }, inter('semibold')]}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </BottomSheet>

      <BottomSheet visible={previewing} onClose={() => setPreviewing(false)} accessibilityLabel="Fechar prévia">
        <View testID="previa-perfil" style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(20) }, inter('extrabold')]}>
            Como vai ficar
          </Text>
          {previewing ? <ProfilePagePreview html={previewHtml} height={560} /> : null}
          <PrimaryButton label="Fechar" variant="secondary" fullWidth onPress={() => setPreviewing(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
