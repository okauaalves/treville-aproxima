import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { Check, ImagePlus, Sparkles, Trash2, Upload } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/layout/AppHeader';
import { CONTENT_WIDTH } from '@/components/layout/ContentContainer';
import { Screen } from '@/components/layout/Screen';
import { BrandPagePreview } from '@/components/pagina/BrandPagePreview';
import { LinkEditorCard } from '@/components/pagina/LinkEditorCard';
import { PlaquinhaVinculoCard } from '@/components/pagina/PlaquinhaVinculoCard';
import { PublishReadyScreen } from '@/components/pagina/PublishReadyScreen';
import { ThemePicker } from '@/components/pagina/ThemePicker';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useBrandPageDraft } from '@/hooks/useBrandPageDraft';
import { applyRawToDraft, mergeLinkDrafts, validateLinkDrafts, type BrandLinkDraft } from '@/lib/brandLinkLogic';
import {
  createBrandPageWithPalette,
  getBrandPage,
  getPublicUrl,
  listBrandLinks,
  publishBrandPage,
  updateBrandPage,
  upsertBrandLinks,
  uploadBrandAsset,
  type BrandPage,
} from '@/lib/brandPages';
import { accentForBorders, extractPaletteFromImage, type BrandPalette } from '@/lib/colorExtraction';
import { goToLogin } from '@/lib/navigation';
import { isSessionError } from '@/lib/plaquinhas';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

type Step = 'loading' | 'intro' | 'upload' | 'colors' | 'links' | 'themes' | 'publish' | 'hub' | 'preview';

const AUTOSAVE_MS = 900;

export default function PaginaScreen() {
  const { colors, fs } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTabletUp, horizontalPadding } = useBreakpoint();
  const padding = isTabletUp ? 32 : horizontalPadding;
  const user = useAuthStore((state) => state.user);

  const [step, setStep] = useState<Step>('loading');
  const [page, setPage] = useState<BrandPage | null>(null);
  const [initialLinks, setInitialLinks] = useState<BrandLinkDraft[] | undefined>(undefined);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [palette, setPalette] = useState<BrandPalette | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seedKey, setSeedKey] = useState('boot');

  const {
    draft,
    previewHtml,
    themeThumbHtml,
    refreshThemeThumbs,
    setBrandName,
    setTagline,
    setAbout,
    setThemeMode,
    updateLink,
  } = useBrandPageDraft(page, initialLinks, seedKey);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setStep('intro');
      return;
    }
    if (!user) {
      goToLogin();
      return;
    }
    setStep('loading');
    try {
      const existing = await getBrandPage();
      setPage(existing);
      if (existing) {
        const rows = await listBrandLinks(existing.id);
        const merged = mergeLinkDrafts(rows);
        setInitialLinks(merged);
        setSeedKey(`${existing.id}:${existing.updated_at}:${merged.map((l) => `${l.link_type}:${l.destination_url}:${l.is_active}`).join('|')}`);
        if (existing.logo_url) {
          setStep('hub');
        } else {
          setStep('intro');
        }
      } else {
        setInitialLinks(undefined);
        setSeedKey('empty');
        setStep('intro');
      }
    } catch (failure) {
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível carregar a página.', 'error');
      setStep('intro');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const persistDraft = useCallback(
    async (options?: { advance?: Step; silent?: boolean }) => {
      if (!page) {
        return false;
      }
      const current = draftRef.current;
      const check = validateLinkDrafts(current.links);
      if (!check.ok) {
        if (!options?.silent) {
          useToastStore.getState().show(check.error, 'error');
        }
        return false;
      }
      setSaving(true);
      try {
        const updated = await updateBrandPage(page.id, {
          brand_name: current.brand_name.trim() || page.brand_name,
          tagline: current.tagline.trim() || null,
          about: current.about.trim() || null,
          theme_mode: current.theme_mode,
        });
        const rows = await upsertBrandLinks(page.id, current.links);
        setPage(updated);
        setInitialLinks(mergeLinkDrafts(rows));
        if (options?.advance) {
          setStep(options.advance);
        }
        return true;
      } catch (failure) {
        if (isSessionError(failure)) {
          goToLogin();
          return false;
        }
        useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível salvar.', 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [page],
  );

  // Autosave no editor de links (não perde dados se o app fechar).
  useEffect(() => {
    if ((step !== 'links' && step !== 'themes') || !page) {
      return;
    }
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = setTimeout(() => {
      void persistDraft({ silent: true });
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    };
  }, [draft.links, draft.brand_name, draft.tagline, draft.about, draft.theme_mode, step, page, persistDraft]);

  async function pickLogo() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setLocalUri(result.assets[0].uri);
        setPalette(null);
      }
    } catch {
      useToastStore.getState().show('Não foi possível abrir a galeria.', 'error');
    }
  }

  async function processLogo() {
    if (!localUri) {
      return;
    }
    setBusy(true);
    try {
      const logoUrl = await uploadBrandAsset(localUri);
      const extracted = await extractPaletteFromImage(localUri);
      setPalette({
        primary: accentForBorders(extracted.primary),
        secondary: accentForBorders(extracted.secondary),
        tertiary: extracted.tertiary,
      });
      setPage((prev) => (prev ? { ...prev, logo_url: logoUrl } : ({ logo_url: logoUrl } as BrandPage)));
      setStep('colors');
    } catch (failure) {
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível processar a logo.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmColors() {
    if (!palette || !page?.logo_url) {
      return;
    }
    setBusy(true);
    try {
      const created = await createBrandPageWithPalette({
        logoUrl: page.logo_url,
        primary: palette.primary,
        secondary: palette.secondary,
        tertiary: palette.tertiary,
      });
        setPage(created);
      const rows = await listBrandLinks(created.id).catch(() => []);
      const merged = mergeLinkDrafts(rows);
      setInitialLinks(merged);
      setSeedKey(`${created.id}:${created.updated_at}:new`);
      setStep('links');
    } catch (failure) {
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível criar a página.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function goThemes() {
    const ok = await persistDraft();
    if (ok) {
      refreshThemeThumbs();
      setStep('themes');
    }
  }

  async function goPublish() {
    const ok = await persistDraft();
    if (ok) {
      setStep('publish');
    }
  }

  async function handlePublish() {
    if (!page) {
      return;
    }
    setPublishing(true);
    try {
      const saved = await persistDraft({ silent: true });
      if (!saved) {
        return;
      }
      const published = await publishBrandPage(page.id);
      setPage(published);
      useToastStore.getState().show('Página publicada!', 'success');
      setStep('hub');
    } catch (failure) {
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Falha na rede. Seus dados foram preservados.', 'error');
    } finally {
      setPublishing(false);
    }
  }

  const publicUrl = useMemo(() => (page ? getPublicUrl(page) : null), [page]);
  const configuredCount = draft.links.filter((link) => link.is_active && link.destination_url.trim()).length;

  return (
    <Screen maxWidth={isTabletUp ? CONTENT_WIDTH.settings : null}>
      <AppHeader title="Minha Página" inset={padding} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: padding, paddingBottom: Math.max(insets.bottom, 32), flexGrow: 1 }}>
        {step === 'loading' ? (
          <View style={{ gap: 12, marginTop: 12 }}>
            <Skeleton height={120} />
            <Skeleton height={48} />
          </View>
        ) : null}

        {step === 'intro' ? <Intro onCreate={() => setStep('upload')} /> : null}

        {step === 'upload' ? (
          <UploadStep
            localUri={localUri}
            busy={busy}
            onPick={() => void pickLogo()}
            onReplace={() => void pickLogo()}
            onRemove={() => {
              setLocalUri(null);
              setPalette(null);
            }}
            onContinue={() => void processLogo()}
          />
        ) : null}

        {step === 'colors' && palette ? <ColorsStep palette={palette} busy={busy} onConfirm={() => void confirmColors()} /> : null}

        {step === 'links' && page ? (
          <View style={{ gap: 14, marginTop: 8 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(20) }, inter('extrabold')]}>Configure seus links</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(14), lineHeight: fs(20) }, inter('regular')]}>
              Seis canais fixos. Desativar não apaga o conteúdo.
            </Text>
            <Input label="Nome da página" value={draft.brand_name} onChangeText={setBrandName} placeholder="Sua marca" maxLength={80} />
            <Input label="Frase de efeito (opcional)" value={draft.tagline} onChangeText={setTagline} placeholder="Ex.: Conectando pessoas e oportunidades" maxLength={160} />
            <Input
              label="Sobre (opcional)"
              value={draft.about}
              onChangeText={(value) => setAbout(value.slice(0, 800))}
              placeholder="Descrição mais longa. Aparece ao tocar no logo da página pública."
              maxLength={800}
              multiline
              style={{ minHeight: 110 }}
            />
            <Text style={[{ color: draft.about.length >= 800 ? colors.warning : colors.textMuted, fontSize: fs(12), textAlign: 'right', marginTop: -8 }, inter('medium')]}>
              {draft.about.length}/800
            </Text>
            {draft.links.map((link) => (
              <LinkEditorCard
                key={link.link_type}
                draft={link}
                onChangeRaw={(raw) => {
                  const next = applyRawToDraft(link, raw);
                  updateLink(link.link_type, { raw: next.raw, destination_url: next.destination_url });
                }}
                onChangeDescription={(description) => updateLink(link.link_type, { description })}
                onToggle={(is_active) => updateLink(link.link_type, { is_active })}
              />
            ))}
            {saving ? (
              <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('medium')]}>Salvando…</Text>
            ) : null}
            <PrimaryButton label="Continuar para os temas" onPress={() => void goThemes()} disabled={busy || saving} fullWidth />
            <BrandPagePreview html={previewHtml} height={360} />
          </View>
        ) : null}

        {step === 'themes' && page ? (
          <View style={{ gap: 16, marginTop: 8 }}>
            <ThemePicker
              selected={draft.theme_mode}
              thumbHtml={themeThumbHtml}
              primaryColor={page.primary_color}
              onSelect={(mode) => {
                setThemeMode(mode);
              }}
            />
            <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>Prévia ao vivo</Text>
            <BrandPagePreview html={previewHtml} height={480} />
            <PrimaryButton label="Quase lá — revisar publicação" onPress={() => void goPublish()} disabled={saving} fullWidth />
            <SecondaryButton label="Voltar aos links" onPress={() => setStep('links')} fullWidth />
          </View>
        ) : null}

        {step === 'publish' && page ? (
          <PublishReadyScreen
            page={page}
            brandName={draft.brand_name || page.brand_name || 'Minha Página'}
            themeMode={draft.theme_mode}
            links={draft.links}
            previewHtml={previewHtml}
            publicUrl={publicUrl}
            publishing={publishing}
            onPublish={() => void handlePublish()}
            onContinueEditing={() => setStep('links')}
          />
        ) : null}

        {step === 'hub' && page ? (
          <HubStep
            page={page}
            configuredCount={configuredCount}
            publicUrl={publicUrl}
            onCustomize={() => {
              refreshThemeThumbs();
              setStep('links');
            }}
            onPreview={() => setStep('preview')}
            onEditLogo={() => setStep('upload')}
            onPageUpdated={setPage}
          />
        ) : null}

        {step === 'preview' && page ? (
          <View style={{ gap: 14, marginTop: 8 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(18) }, inter('extrabold')]}>Visualizar página</Text>
            <BrandPagePreview html={previewHtml} height={560} />
            <SecondaryButton label="Voltar" onPress={() => setStep('hub')} fullWidth />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Intro({ onCreate }: { onCreate: () => void }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 16 }}>
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: colors.primaryGlow,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Sparkles color={colors.primary} size={40} strokeWidth={2} />
      </View>
      <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(26), textAlign: 'center' }, inter('extrabold')]}>
        Minha Página
      </Text>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(15), textAlign: 'center', lineHeight: fs(22), maxWidth: 320 }, inter('regular')]}>
        Sua marca, seus contatos e suas conexões em um só lugar
      </Text>
      {!isSupabaseConfigured ? (
        <Text style={[{ color: colors.warning, fontSize: fs(13), textAlign: 'center', marginTop: 4 }, inter('medium')]}>
          Configure o Supabase para criar sua página.
        </Text>
      ) : null}
      <PrimaryButton label="Criar minha página" onPress={onCreate} disabled={!isSupabaseConfigured} fullWidth style={{ marginTop: 12, maxWidth: 360 }} />
    </View>
  );
}

function UploadStep({
  localUri,
  busy,
  onPick,
  onReplace,
  onRemove,
  onContinue,
}: {
  localUri: string | null;
  busy: boolean;
  onPick: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onContinue: () => void;
}) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ gap: 16, marginTop: 8 }}>
      <Text style={[{ color: colors.textPrimary, fontSize: fs(20) }, inter('extrabold')]}>Adicione sua logo</Text>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(14), lineHeight: fs(20) }, inter('regular')]}>
        Identificaremos as principais cores da sua marca
      </Text>

      {localUri ? (
        <Card padding={16}>
          <View style={{ alignItems: 'center', gap: 14 }}>
            <Image source={{ uri: localUri }} style={{ width: 160, height: 160, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated }} resizeMode="contain" />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <View style={{ flex: 1 }}>
                <SecondaryButton label="Substituir" icon={<Upload color={colors.textPrimary} size={16} />} onPress={onReplace} fullWidth disabled={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <SecondaryButton label="Remover" icon={<Trash2 color={colors.danger} size={16} />} onPress={onRemove} fullWidth disabled={busy} />
              </View>
            </View>
          </View>
        </Card>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Adicionar logo"
          onPress={onPick}
          style={({ pressed }) => ({
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: pressed ? colors.primary : colors.border,
            borderRadius: radius.lg,
            backgroundColor: colors.primaryGlow,
            paddingVertical: 48,
            paddingHorizontal: 20,
            alignItems: 'center',
            gap: 12,
          })}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ImagePlus color={colors.primary} size={28} />
          </View>
          <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>Adicione sua logo</Text>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(13), textAlign: 'center' }, inter('regular')]}>PNG, JPG ou WebP</Text>
        </Pressable>
      )}

      <PrimaryButton label={busy ? 'Processando…' : 'Continuar'} onPress={onContinue} disabled={!localUri || busy} loading={busy} fullWidth />
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
    </View>
  );
}

function ColorsStep({ palette, busy, onConfirm }: { palette: BrandPalette; busy: boolean; onConfirm: () => void }) {
  const { colors, fs } = useTheme();
  const chips = [palette.primary, palette.secondary, palette.tertiary];
  return (
    <View style={{ gap: 20, marginTop: 8 }}>
      <Text style={[{ color: colors.textPrimary, fontSize: fs(20) }, inter('extrabold')]}>Cores da sua marca</Text>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>
        Extraímos estas cores da logo. Confirme para configurar os links.
      </Text>
      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
        {chips.map((hex) => (
          <View key={hex} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: '100%',
                aspectRatio: 1,
                maxHeight: 96,
                borderRadius: radius.lg,
                backgroundColor: hex,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('semibold')]}>{hex}</Text>
          </View>
        ))}
      </View>
      <PrimaryButton label="Usar essas cores" icon={<Check color={colors.onPrimary} size={18} />} onPress={onConfirm} loading={busy} disabled={busy} fullWidth />
    </View>
  );
}

function HubStep({
  page,
  configuredCount,
  publicUrl,
  onCustomize,
  onPreview,
  onEditLogo,
  onPageUpdated,
}: {
  page: BrandPage;
  configuredCount: number;
  publicUrl: string | null;
  onCustomize: () => void;
  onPreview: () => void;
  onEditLogo: () => void;
  onPageUpdated: (page: BrandPage) => void;
}) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ gap: 16, marginTop: 8 }}>
      <Card padding={16}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {page.logo_url ? (
            <Image source={{ uri: page.logo_url }} style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceElevated }} resizeMode="contain" />
          ) : null}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(17) }, inter('bold')]}>{page.brand_name ?? 'Sua página'}</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>
              {page.is_published ? 'Publicada' : 'Rascunho'} · {configuredCount} canais · tema {page.theme_mode}
            </Text>
            {publicUrl ? (
              <Text style={[{ color: colors.primary, fontSize: fs(12) }, inter('semibold')]} numberOfLines={1} selectable>
                {publicUrl}
              </Text>
            ) : null}
          </View>
        </View>
        {(page.primary_color || page.secondary_color || page.text_color) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {[page.primary_color, page.secondary_color, page.text_color].filter(Boolean).map((hex) => (
              <View key={hex as string} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: hex as string, borderWidth: 1, borderColor: colors.border }} />
            ))}
          </View>
        )}
      </Card>
      {page.is_published ? <PlaquinhaVinculoCard page={page} onUpdated={onPageUpdated} /> : null}
      <PrimaryButton label="Personalizar minha página" onPress={onCustomize} fullWidth />
      <SecondaryButton label="Visualizar página" onPress={onPreview} fullWidth />
      <SecondaryButton label="Trocar logo" onPress={onEditLogo} fullWidth />
    </View>
  );
}
