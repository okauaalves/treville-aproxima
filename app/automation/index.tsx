import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { AppWindow, ExternalLink, Info, Link, MessageCircle, Phone, Wifi } from 'lucide-react-native';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Select } from '@/components/ui/Select';
import { APP_PRESETS, AUTOMATION_INFO, buildAutomationPayload, type AutomationKind } from '@/core/nfc/automation';
import { nfcManager } from '@/core/nfc/NfcManager';
import { assessNfc } from '@/core/nfc/readiness';
import { isTaskerInstalled, openShortcuts, openTaskerOrStore } from '@/lib/tasker';
import { push } from '@/lib/navigation';
import { useNfcStore } from '@/stores/nfcStore';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import { emptyWriteOptions, type WifiSecurity } from '@/types/nfc';

const KINDS: { kind: AutomationKind; label: string; Icon: typeof Link }[] = [
  { kind: 'app', label: 'Abrir app', Icon: AppWindow },
  { kind: 'url', label: 'Abrir URL', Icon: Link },
  { kind: 'call', label: 'Ligar', Icon: Phone },
  { kind: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { kind: 'wifi', label: 'Wi-Fi', Icon: Wifi },
];

export default function AutomationScreen() {
  const { colors, fs } = useTheme();
  const [kind, setKind] = useState<AutomationKind>('app');
  const [preset, setPreset] = useState<string>(APP_PRESETS[0]?.id ?? 'custom');
  const [androidPackage, setAndroidPackage] = useState(APP_PRESETS[0]?.androidPackage ?? '');
  const [appUri, setAppUri] = useState(APP_PRESETS[0]?.iosUri ?? '');
  const [url, setUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [security, setSecurity] = useState<WifiSecurity>('WPA2');
  const [tasker, setTasker] = useState(false);
  const info = AUTOMATION_INFO[kind];

  useEffect(() => {
    void isTaskerInstalled().then(setTasker);
  }, []);

  function choosePreset(id: string) {
    setPreset(id);
    const found = APP_PRESETS.find((item) => item.id === id);
    setAndroidPackage(found?.androidPackage ?? '');
    setAppUri(found?.iosUri ?? '');
  }

  async function write() {
    const built = buildAutomationPayload({ kind, androidPackage, appUri, url, phone, message, ssid, password, security });
    if (!built.payload) {
      useToastStore.getState().show(built.error ?? 'Revise os campos.', 'error');
      return;
    }
    const assessment = await assessNfc();
    if (!assessment.ready && !(assessment.testMode && nfcManager.isSimulation())) {
      push(`/nfc-unavailable?intent=write&reason=${assessment.reason ?? 'unsupported'}`);
      return;
    }
    useNfcStore.getState().setPendingPayload(built.payload);
    useNfcStore.getState().setWriteOptions({ ...emptyWriteOptions });
    push('/write/progress');
  }

  async function tasks() {
    const outcome = await openTaskerOrStore();
    if (outcome === 'store') {
      useToastStore.getState().show('Tasker não encontrado: abrindo a Play Store.', 'info');
    }
  }

  return (
    <Screen>
      <AppHeader title="Criar automação" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Text style={[{ color: colors.textSecondary, fontSize: fs(14) }, inter('regular')]}>
            A automação é o conteúdo gravado na tag: ao aproximar o celular, o sistema executa a ação correspondente. A gravação passa pela verificação normal.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {KINDS.map(({ kind: value, label, Icon }) => {
              const selected = value === kind;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={label}
                  onPress={() => setKind(value)}
                  style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primaryGlow : colors.surface }}
                >
                  <Icon color={selected ? colors.primary : colors.textSecondary} size={16} />
                  <Text style={[{ color: selected ? colors.primary : colors.textPrimary, fontSize: fs(14) }, inter('semibold')]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Card>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(16), marginBottom: 4 }, inter('bold')]}>{info.title}</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginBottom: 14 }, inter('regular')]}>{info.description}</Text>
            {kind === 'app' ? (
              <>
                <Select<string>
                  label="Aplicativo"
                  value={preset}
                  onChange={choosePreset}
                  options={[...APP_PRESETS.map((item) => ({ value: item.id, label: item.name })), { value: 'custom', label: 'Outro app' }]}
                />
                <Input label="Pacote Android" value={androidPackage} onChangeText={setAndroidPackage} autoCapitalize="none" placeholder="com.exemplo.app" />
                <Input label="Deep link (opcional, para iPhone)" value={appUri} onChangeText={setAppUri} autoCapitalize="none" placeholder="instagram://" />
              </>
            ) : null}
            {kind === 'url' ? <Input label="Link" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://" /> : null}
            {kind === 'call' || kind === 'whatsapp' ? <Input label="Número com DDI" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+55 11 99999-9999" /> : null}
            {kind === 'whatsapp' ? <Input label="Mensagem pronta (opcional)" value={message} onChangeText={setMessage} multiline /> : null}
            {kind === 'wifi' ? (
              <>
                <Input label="Nome da rede (SSID)" value={ssid} onChangeText={setSsid} autoCapitalize="none" />
                <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
                <Select<WifiSecurity>
                  label="Segurança"
                  value={security}
                  onChange={setSecurity}
                  options={[
                    { value: 'WPA2', label: 'WPA2' },
                    { value: 'WPA3', label: 'WPA3' },
                    { value: 'WPA', label: 'WPA' },
                    { value: 'WEP', label: 'WEP' },
                    { value: 'nopass', label: 'Sem senha' },
                  ]}
                />
              </>
            ) : null}
            <PrimaryButton label="Gravar automação na tag" fullWidth onPress={() => void write()} />
          </Card>

          <Card>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <Info color={colors.primary} size={18} />
              <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>Como funciona em cada sistema</Text>
            </View>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(13) }, inter('semibold')]}>Android</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginBottom: 8 }, inter('regular')]}>{info.android}</Text>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(13) }, inter('semibold')]}>iPhone</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{info.ios}</Text>
          </Card>

          <Card>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(15), marginBottom: 6 }, inter('bold')]}>Ações avançadas (ligar Wi-Fi, modo silencioso, rotinas)</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginBottom: 10 }, inter('regular')]}>
              Apps comuns não podem alternar Wi-Fi, Bluetooth ou modos do sistema. No Android, use o Tasker (perfil Evento &gt; NFC ou o plugin de NFC) ligado ao UID da tag. No iPhone, use o app Atalhos: Automação &gt; NFC &gt; escanear esta tag.
            </Text>
            {Platform.OS === 'android' ? (
              <PrimaryButton label={tasker ? 'Abrir no Tasker' : 'Instalar Tasker (Play Store)'} variant="secondary" fullWidth icon={<ExternalLink color={colors.primary} size={16} />} onPress={() => void tasks()} />
            ) : null}
            {Platform.OS === 'ios' ? <PrimaryButton label="Abrir Atalhos" variant="secondary" fullWidth icon={<ExternalLink color={colors.primary} size={16} />} onPress={() => void openShortcuts()} /> : null}
            {Platform.OS === 'web' ? <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('regular')]}>Tasker e Atalhos só podem ser abertos pelo app instalado no celular.</Text> : null}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
