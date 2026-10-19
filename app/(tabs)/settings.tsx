import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronRight, ExternalLink, LogOut, MessageCircle, QrCode, ShieldCheck } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONTENT_WIDTH } from '@/components/layout/ContentContainer';
import { Screen } from '@/components/layout/Screen';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { usePendingAccessCount } from '@/hooks/usePendingAccessCount';
import { AppHeader } from '@/components/layout/AppHeader';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { CountBadge } from '@/components/ui/CountBadge';
import { Modal } from '@/components/ui/Modal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Toggle } from '@/components/ui/Toggle';
import { APP_NAME, APP_TAGLINE } from '@/constants/config';
import { getOperations } from '@/core/offline/database';
import {
  checkQrForeground,
  labelForQrHex,
  QR_BACKGROUND_COLOR,
  QR_PALETTE,
} from '@/lib/qrColors';
import { push, replace } from '@/lib/navigation';
import { isSupabaseConfigured } from '@/lib/supabase';
import { ProfileAvatar } from '@/components/perfil/ProfileIcons';
import { getProfile } from '@/lib/perfil';
import { findProfilePlaquinha, getProfilePageUrl, plaquinhasAvailable } from '@/lib/plaquinhas';
import { useToastStore } from '@/stores/toastStore';
import { DEFAULT_THEME_COLOR } from '@/supabase/functions/_shared/profilePage';
import { useAuthStore } from '@/stores/authStore';
import { useQrColorStore } from '@/stores/qrColorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ContentTypeColors, type ThemePreference } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import type { TextScale } from '@/theme/typography';
import type { ReadMode } from '@/core/offline/settingsParse';

const WHATSAPP_LINK = "https://wa.me/55XXXXXXXXXXX";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

const MODES: { value: ReadMode; label: string }[] = [
  { value: 'standard', label: 'Padrão' },
  { value: 'advanced', label: 'Avançado' },
  { value: 'technical', label: 'Técnico' },
];

const SCALES: TextScale[] = ['A', 'A+', 'A++'];

export default function SettingsScreen() {
  const { colors, fs, isDark, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTabletUp, horizontalPadding } = useBreakpoint();
  const padding = isTabletUp ? 32 : horizontalPadding;
  const language = useSettingsStore((state) => state.language);
  const sound = useSettingsStore((state) => state.soundEnabled);
  const vibration = useSettingsStore((state) => state.vibrationEnabled);
  const readMode = useSettingsStore((state) => state.readMode);
  const reduce = useSettingsStore((state) => state.reduceAnimations);
  const retention = useSettingsStore((state) => state.historyRetentionDays);
  const textScale = useSettingsStore((state) => state.textScale);
  const [themeOpen, setThemeOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [qrColorOpen, setQrColorOpen] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const user = useAuthStore((state) => state.user);
  const qrForeground = useQrColorStore((state) => state.foreground);
  const { isAdmin, pending: pendingAdmin } = usePendingAccessCount();
  const themeLabel = THEMES.find((item) => item.value === preference)?.label ?? 'Claro';
  const modeLabel = MODES.find((item) => item.value === readMode)?.label ?? 'Padrão';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen maxWidth={isTabletUp ? CONTENT_WIDTH.settings : null}>
      <AppHeader title="Configurações" inset={padding} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: padding, paddingBottom: Math.max(insets.bottom, 28) }}>
        <Section title="Conta">
          <Row label="Conta" value={user?.email ?? (isSupabaseConfigured ? 'Sessão' : 'Modo local')} onPress={() => push('/account')} />
          <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
            <PrimaryButton label="Sair da conta" tone="danger" icon={<LogOut color={colors.onDanger} size={18} />} fullWidth onPress={() => setConfirmExit(true)} />
          </View>
        </Section>
        <MeuPerfilSection />
        <Section title="Aparência">
          <Row label="Tema" value={themeLabel} onPress={() => setThemeOpen(true)} />
          <Row label="Idioma" value={language === 'pt-BR' ? 'Português (Brasil)' : language} onPress={() => setLanguageOpen(true)} first={false} />
          <Row
            testID="settings-qr-color"
            label="Cor do QR Code"
            value={labelForQrHex(qrForeground)}
            first={false}
            icon={
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  backgroundColor: qrForeground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            }
            onPress={() => setQrColorOpen(true)}
          />
        </Section>
        <Section title="NFC">
          <Row label="Modo de leitura" value={modeLabel} onPress={() => setModeOpen(true)} />
          <ToggleRow label="Avisos sonoros" value={sound} onChange={(value) => void useSettingsStore.getState().setSoundEnabled(value)} />
          <ToggleRow label="Vibração" value={vibration} onChange={(value) => void useSettingsStore.getState().setVibrationEnabled(value)} />
        </Section>
        <Section title="Sobre">
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: fs(14), paddingHorizontal: 14, paddingTop: 12 }}>{APP_NAME}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: fs(14), paddingHorizontal: 14, paddingTop: 2 }}>{APP_TAGLINE}</Text>
          <Row label="Versão" value={version} first={false} />
          <Row label="Termos de uso" value="" onPress={() => push('/terms')} first={false} />
          <Row
            testID="settings-fale-conosco"
            label="Fale conosco"
            value="WhatsApp"
            first={false}
            icon={<MessageCircle color={ContentTypeColors.WHATSAPP[isDark ? 'dark' : 'light']} size={18} />}
            onPress={() => {
              Linking.openURL(WHATSAPP_LINK).catch(() => useToastStore.getState().show('Não foi possível abrir o WhatsApp.', 'error'));
            }}
          />
        </Section>
        {isAdmin ? (
          <Section title="Administração">
            <Row
              testID="settings-painel-admin"
              label="Painel Admin"
              value=""
              icon={<ShieldCheck color={colors.primary} size={18} />}
              badge={pendingAdmin}
              accessibilityLabel={pendingAdmin > 0 ? `Painel Admin: ${pendingAdmin} pendentes` : 'Painel Admin'}
              onPress={() => push('/admin')}
            />
          </Section>
        ) : null}
        <Section title="Dados">
          <Row label="Retenção do histórico" value={`${retention} dias`} onPress={() => void useSettingsStore.getState().setHistoryRetentionDays(retention === 30 ? 90 : retention === 90 ? 365 : 30)} />
          <Row
            label="Exportar histórico"
            value=""
            first={false}
            onPress={() => {
              void getOperations({ limit: 100 }).then((items) => Share.share({ message: JSON.stringify(items) }));
            }}
          />
          <Row label="Privacidade" value="" onPress={() => setPrivacy((value) => !value)} first={false} />
          {privacy ? <Text style={{ color: colors.textSecondary, paddingHorizontal: 14, paddingBottom: 12 }}>O UID da tag não é salvo. O app guarda só um hash e funciona sem internet.</Text> : null}
          <Row label="Licenças" value="" onPress={() => push('/licenses')} first={false} />
        </Section>
        <Section title="Acessibilidade">
          <ToggleRow label="Reduzir animações" value={reduce} onChange={(value) => void useSettingsStore.getState().setReduceAnimations(value)} first />
          <Row label="Tamanho do texto" value={textScale} onPress={() => void useSettingsStore.getState().setTextScale(SCALES[(SCALES.indexOf(textScale) + 1) % SCALES.length] ?? 'A')} first={false} />
        </Section>
      </ScrollView>
      <Modal visible={confirmExit} title="Sair da conta" onClose={() => setConfirmExit(false)}>
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Encerrar a sessão neste aparelho? O histórico salvo aqui continua no celular.</Text>
        <PrimaryButton
          label="Sair da conta"
          tone="danger"
          fullWidth
          loading={signingOut}
          onPress={() => {
            setSigningOut(true);
            void useAuthStore
              .getState()
              .signOut()
              .finally(() => {
                setSigningOut(false);
                setConfirmExit(false);
                replace('/(auth)/login');
              });
          }}
        />
        <PrimaryButton label="Cancelar" variant="ghost" fullWidth style={{ marginTop: 8 }} disabled={signingOut} onPress={() => setConfirmExit(false)} />
      </Modal>
      <BottomSheet visible={themeOpen} onClose={() => setThemeOpen(false)} accessibilityLabel="Fechar tema">
        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(18), marginBottom: 8 }}>Tema</Text>
        {THEMES.map((item) => (
          <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => { setPreference(item.value); setThemeOpen(false); }} style={{ paddingVertical: 14 }}>
            <Text style={{ color: preference === item.value ? colors.primary : colors.textPrimary, fontWeight: '600' }}>{item.label}</Text>
          </Pressable>
        ))}
      </BottomSheet>
      <BottomSheet visible={languageOpen} onClose={() => setLanguageOpen(false)} accessibilityLabel="Fechar idioma">
        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(18), marginBottom: 8 }}>Idioma</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Português (Brasil)" onPress={() => { void useSettingsStore.getState().setLanguage('pt-BR'); setLanguageOpen(false); }} style={{ paddingVertical: 14 }}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Português (Brasil)</Text>
        </Pressable>
      </BottomSheet>
      <BottomSheet visible={modeOpen} onClose={() => setModeOpen(false)} accessibilityLabel="Fechar modo de leitura">
        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(18), marginBottom: 8 }}>Modo de leitura</Text>
        {MODES.map((item) => (
          <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => { void useSettingsStore.getState().setReadMode(item.value); setModeOpen(false); }} style={{ paddingVertical: 14 }}>
            <Text style={{ color: readMode === item.value ? colors.primary : colors.textPrimary, fontWeight: '600' }}>{item.label}</Text>
          </Pressable>
        ))}
      </BottomSheet>
      <QrColorSheet visible={qrColorOpen} onClose={() => setQrColorOpen(false)} />
    </Screen>
  );
}

function QrColorSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, fs } = useTheme();
  const foreground = useQrColorStore((state) => state.foreground);
  const [draft, setDraft] = useState(foreground);
  const [hexInput, setHexInput] = useState(foreground);
  const [warning, setWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft(foreground);
      setHexInput(foreground);
      setWarning(null);
    }
  }, [visible, foreground]);

  function selectPreset(hex: string) {
    const check = checkQrForeground(hex);
    if (!check.ok) {
      setWarning(check.error);
      return;
    }
    setDraft(check.hex);
    setHexInput(check.hex);
    setWarning(null);
  }

  function onHexChange(value: string) {
    setHexInput(value);
    const check = checkQrForeground(value);
    if (!check.ok) {
      setWarning(check.error.includes('formato') ? null : check.error);
      return;
    }
    setDraft(check.hex);
    setWarning(null);
  }

  async function save() {
    const check = checkQrForeground(hexInput.trim() || draft);
    if (!check.ok) {
      setWarning(check.error);
      return;
    }
    setSaving(true);
    const result = await useQrColorStore.getState().setForeground(check.hex);
    setSaving(false);
    if (!result.ok) {
      setWarning(result.error);
      return;
    }
    useToastStore.getState().show('Cor do QR Code salva.', 'success');
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="Fechar cor do QR Code">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <QrCode color={colors.primary} size={20} />
        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(18), flex: 1 }}>Cor do QR Code</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: fs(13), marginBottom: 14 }}>
        Só a cor dos módulos muda. O fundo permanece branco para leitura confiável.
      </Text>
      <View
        style={{
          alignSelf: 'center',
          padding: 10,
          borderRadius: 12,
          backgroundColor: QR_BACKGROUND_COLOR,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 16,
        }}
      >
        <View style={{ width: 72, height: 72, backgroundColor: draft }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {QR_PALETTE.map((item) => {
          const selected = draft.toUpperCase() === item.hex.toUpperCase();
          return (
            <Pressable
              key={item.id}
              testID={`qr-color-preset-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => selectPreset(item.hex)}
              style={{
                width: '30%',
                minWidth: 96,
                flexGrow: 1,
                paddingVertical: 10,
                paddingHorizontal: 8,
                borderRadius: 10,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.primary : colors.border,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: item.hex, borderWidth: 1, borderColor: '#E2E8F0' }} />
              <Text style={{ color: colors.textPrimary, fontWeight: selected ? '700' : '600', fontSize: fs(12) }}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: fs(13), marginBottom: 6 }}>Cor personalizada (#RRGGBB)</Text>
      <TextInput
        testID="qr-color-hex-input"
        value={hexInput}
        onChangeText={onHexChange}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="#000000"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Cor hexadecimal do QR Code"
        style={{
          borderWidth: 1,
          borderColor: warning ? colors.error : colors.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 12,
          color: colors.textPrimary,
          fontSize: fs(15),
          marginBottom: 8,
        }}
      />
      {warning ? (
        <Text testID="qr-color-warning" accessibilityRole="alert" style={{ color: colors.error, fontSize: fs(13), marginBottom: 10 }}>
          {warning}
        </Text>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: fs(12), marginBottom: 10 }}>
          Contraste mínimo 4.5:1 sobre fundo branco. Cores claras demais são bloqueadas.
        </Text>
      )}
      <PrimaryButton label="Salvar" fullWidth loading={saving} disabled={!checkQrForeground(hexInput.trim() || draft).ok} onPress={() => void save()} />
      <PrimaryButton label="Cancelar" variant="ghost" fullWidth style={{ marginTop: 8 }} disabled={saving} onPress={onClose} />
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ marginBottom: 18 }}>
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(16), marginBottom: 8 }}>{title}</Text>
      <Card padding={0}>{children}</Card>
    </View>
  );
}

type RowProps = { label: string; value: string; onPress?: () => void; first?: boolean; icon?: ReactNode; badge?: number; testID?: string; accessibilityLabel?: string };

function Row({ label, value, onPress, first = true, icon, badge = 0, testID, accessibilityLabel }: RowProps) {
  const { colors, fs } = useTheme();
  const body = (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border, gap: 8 }}>
      {icon}
      <Text style={{ flex: 1, color: colors.textPrimary, fontWeight: '600', fontSize: fs(14) }}>{label}</Text>
      {value ? <Text numberOfLines={1} style={{ color: colors.textSecondary, marginRight: 6, fontSize: fs(14), flexShrink: 1, maxWidth: '55%' }}>{value}</Text> : null}
      {badge > 0 ? <CountBadge count={badge} /> : null}
      {onPress ? <ChevronRight color={colors.textMuted} size={16} /> : null}
    </View>
  );
  if (!onPress) {
    return body;
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress}>
      {body}
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange, first = false }: { label: string; value: boolean; onChange: (value: boolean) => void; first?: boolean }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Text style={{ flex: 1, color: colors.textPrimary, fontWeight: '600', fontSize: fs(14) }}>{label}</Text>
      <Toggle value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

function MeuPerfilSection() {
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const available = plaquinhasAvailable() && !!user;
  const [summary, setSummary] = useState<{ name: string; avatar: string | null; color: string } | null>(null);
  const fallback = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Seu perfil';

  useFocusEffect(
    useCallback(() => {
      if (!available) {
        return;
      }
      let alive = true;
      getProfile()
        .then((profile) => {
          if (alive) {
            setSummary({ name: profile.display_name || profile.full_name || fallback, avatar: profile.avatar_url, color: profile.theme_color || DEFAULT_THEME_COLOR });
          }
        })
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [available, fallback]),
  );

  async function openPage() {
    if (!user) {
      return;
    }
    try {
      const withProfile = await findProfilePlaquinha();
      if (!withProfile) {
        useToastStore.getState().show('Nenhuma plaquinha está com a página de perfil ativa. Ative em Plaquinhas, no botão Perfil do card.', 'info');
        return;
      }
      await Linking.openURL(getProfilePageUrl(withProfile.id));
    } catch (failure) {
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível abrir sua página.', 'error');
    }
  }

  if (!available) {
    return (
      <Section title="Meu Perfil Digital">
        <Row label="Perfil digital" value="Precisa de conta conectada" />
      </Section>
    );
  }
  const name = summary?.name ?? fallback;
  return (
    <Section title="Meu Perfil Digital">
      <Row label="Editar perfil" value={name} icon={<ProfileAvatar uri={summary?.avatar ?? null} name={name} color={summary?.color ?? DEFAULT_THEME_COLOR} size={28} />} onPress={() => push('/perfil/editar')} />
      <Row label="Ver minha página" value="" first={false} icon={<ExternalLink color={colors.primary} size={18} />} onPress={() => void openPage()} />
    </Section>
  );
}