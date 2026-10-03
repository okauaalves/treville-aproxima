import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { signOutUser } from '@/lib/authActions';
import { getOperations } from '@/core/offline/database';
import { push, replace } from '@/lib/navigation';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ThemePreference } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import type { TextScale } from '@/theme/typography';
import type { ReadMode } from '@/core/offline/settingsParse';

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
  const { colors, fs, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
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
  const [privacy, setPrivacy] = useState(false);
  const themeLabel = THEMES.find((item) => item.value === preference)?.label ?? 'Claro';
  const modeLabel = MODES.find((item) => item.value === readMode)?.label ?? 'Padrão';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <AppHeader title="Configurações" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 28) }}>
        <Section title="Aparência">
          <Row label="Tema" value={themeLabel} onPress={() => setThemeOpen(true)} />
          <Row label="Idioma" value={language === 'pt-BR' ? 'Português (Brasil)' : language} onPress={() => setLanguageOpen(true)} first={false} />
        </Section>
        <Section title="NFC">
          <Row label="Modo de leitura" value={modeLabel} onPress={() => setModeOpen(true)} />
          <ToggleRow label="Avisos sonoros" value={sound} onChange={(value) => void useSettingsStore.getState().setSoundEnabled(value)} />
          <ToggleRow label="Vibração" value={vibration} onChange={(value) => void useSettingsStore.getState().setVibrationEnabled(value)} />
        </Section>
        <Section title="Sobre">
          <Row label="Versão" value={version} />
        </Section>
        <Section title="Conta">
          <Row label="Conta" value="" onPress={() => push('/account')} />
          <Row label="Sair" value="" onPress={() => { void signOutUser().then(() => replace('/(auth)/login')); }} first={false} />
        </Section>
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
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(16), marginBottom: 8 }}>{title}</Text>
      <Card padding={0}>{children}</Card>
    </View>
  );
}

function Row({ label, value, onPress, first = true }: { label: string; value: string; onPress?: () => void; first?: boolean }) {
  const { colors } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Text style={{ flex: 1, color: colors.textPrimary, fontWeight: '600' }}>{label}</Text>
      {value ? <Text style={{ color: colors.textSecondary, marginRight: 6 }}>{value}</Text> : null}
      {onPress ? <ChevronRight color={colors.textMuted} size={16} /> : null}
    </View>
  );
  if (!onPress) {
    return body;
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {body}
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange, first = false }: { label: string; value: boolean; onChange: (value: boolean) => void; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Text style={{ flex: 1, color: colors.textPrimary, fontWeight: '600' }}>{label}</Text>
      <Toggle value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}
