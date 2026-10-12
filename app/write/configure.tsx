import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { ExpoGoBanner } from '@/components/nfc/ExpoGoBanner';
import { CustomCardForm } from '@/components/nfc/CustomCardForm';
import { entryToPayload, measureMultiRecords, MultiRecordEditor, newMultiRecordEntry, type MultiRecordEntry } from '@/components/nfc/MultiRecordEditor';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { TypeBadge } from '@/components/ui/TypeBadge';
import { CONTENT_TYPE_META, isContentType } from '@/constants/nfcTypes';
import { payloadValidator } from '@/core/validation/payloadValidator';
import { saveTemplate } from '@/core/offline/database';
import { replace } from '@/lib/navigation';
import { buildSocialUrl, detectSocialUrl, extractSocialUsername, SOCIAL_LABEL, validateSocialUsername, type SocialNetwork } from '@/lib/socialHandle';
import { useNfcStore } from '@/stores/nfcStore';
import { inter } from '@/theme/fonts';
import { useToastStore } from '@/stores/toastStore';
import type { ContentType } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import type { CardField, WifiSecurity, WritePayload } from '@/types/nfc';

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function prettyPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return value;
}

function parsePrefill(raw: string): Partial<WritePayload> | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as Partial<WritePayload>;
  } catch {
    return null;
  }
}

const TYPES = Object.keys(CONTENT_TYPE_META) as ContentType[];

type UrlMode = 'site' | SocialNetwork;

const URL_MODES: { value: UrlMode; label: string }[] = [
  { value: 'site', label: 'Site' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
];

export default function ConfigureScreen() {
  const { colors, fs, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const advancedProgress = useSharedValue(0);
  const params = useLocalSearchParams<{ contentType?: string | string[]; prefill?: string | string[] }>();
  const requested = readParam(params.contentType);
  const prefill = useMemo(() => parsePrefill(readParam(params.prefill)), [params.prefill]);
  const resolvedType = isContentType(requested) ? requested : prefill?.contentType && isContentType(prefill.contentType) ? prefill.contentType : null;
  const [contentType, setContentType] = useState<ContentType | null>(resolvedType);
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [phone, setPhone] = useState(prettyPhone(prefill?.phone ?? ''));
  const [message, setMessage] = useState(prefill?.message ?? '');
  const [url, setUrl] = useState(prefill?.url ?? prefill?.appUri ?? '');
  const [socialPrefill] = useState(() => (resolvedType === 'URL' && prefill?.url ? detectSocialUrl(prefill.url) : null));
  const [urlMode, setUrlMode] = useState<UrlMode>(socialPrefill?.network ?? 'site');
  const [socialUser, setSocialUser] = useState(socialPrefill?.username ?? '');
  const [text, setText] = useState(prefill?.text ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [subject, setSubject] = useState(prefill?.subject ?? '');
  const [body, setBody] = useState(prefill?.body ?? '');
  const [fullName, setFullName] = useState(prefill?.fullName ?? '');
  const [company, setCompany] = useState(prefill?.company ?? '');
  const [jobTitle, setJobTitle] = useState(prefill?.jobTitle ?? '');
  const [website, setWebsite] = useState(prefill?.website ?? '');
  const [address, setAddress] = useState(prefill?.address ?? '');
  const [ssid, setSsid] = useState(prefill?.ssid ?? '');
  const [password, setPassword] = useState(prefill?.password ?? '');
  const [security, setSecurity] = useState<WifiSecurity>(prefill?.security ?? 'WPA2');
  const [latitude, setLatitude] = useState(prefill?.latitude ?? '');
  const [longitude, setLongitude] = useState(prefill?.longitude ?? '');
  const [eventTitle, setEventTitle] = useState(prefill?.eventTitle ?? '');
  const [cardTitle, setCardTitle] = useState(prefill?.cardTitle ?? '');
  const [cardIcon, setCardIcon] = useState(prefill?.cardIcon ?? 'IdCard');
  const [cardColor, setCardColor] = useState(prefill?.cardColor ?? '#3B82F6');
  const [cardFields, setCardFields] = useState<CardField[]>(prefill?.cardFields?.length ? prefill.cardFields : [{ label: '', value: '' }]);
  const [lockAfterWrite, setLock] = useState(false);
  const [generateQr, setQr] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [multi, setMulti] = useState(false);
  const [extraRecords, setExtraRecords] = useState<MultiRecordEntry[]>(() => [newMultiRecordEntry()]);
  const meta = contentType ? CONTENT_TYPE_META[contentType] : null;
  useEffect(() => {
    if (!contentType) {
      replace('/write');
    }
  }, [contentType]);
  useEffect(() => {
    advancedProgress.value = withTiming(advanced ? 1 : 0, { duration: reduceAnimations ? 80 : 240 });
  }, [advanced, advancedProgress, reduceAnimations]);
  const advancedStyle = useAnimatedStyle(() => ({
    opacity: advancedProgress.value,
    maxHeight: advancedProgress.value * 320,
    overflow: 'hidden',
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${advancedProgress.value * 90}deg` }],
  }));

  function buildPayload(): WritePayload | null {
    if (!contentType) {
      return null;
    }
    const social = contentType === 'URL' && urlMode !== 'site' ? urlMode : null;
    return {
      contentType,
      phone,
      message,
      url: contentType === 'LINK_APP' ? undefined : social ? buildSocialUrl(social, extractSocialUsername(social, socialUser)) : url,
      appUri: contentType === 'LINK_APP' ? url : undefined,
      text,
      email,
      subject,
      body,
      fullName,
      company,
      jobTitle,
      website,
      address,
      ssid,
      password,
      security,
      latitude,
      longitude,
      eventTitle,
      cardTitle,
      cardIcon,
      cardColor,
      cardFields,
      includeCountryCode: true,
    };
  }

  function tagRoom(): number {
    const tag = useNfcStore.getState().currentTag;
    return tag ? Math.max(tag.capacity || 0, tag.availableSpace || 0) : 0;
  }

  function continueMulti(payload: WritePayload) {
    const payloads = [payload, ...extraRecords.map(entryToPayload)];
    for (const [index, item] of payloads.entries()) {
      const check = payloadValidator.validate(item);
      if (!check.ok) {
        useToastStore.getState().show(`Registro ${index + 1}: ${check.error ?? 'revise os campos.'}`, 'error');
        return;
      }
    }
    const build = measureMultiRecords(payloads, tagRoom());
    if (!build || !build.fits) {
      useToastStore.getState().show(build ? `Os registros somam ${build.totalSize} bytes e a tag comporta ${build.capacity}.` : 'Não foi possível montar os registros.', 'error');
      return;
    }
    useNfcStore.getState().setPendingPayloads(payloads);
    useNfcStore.getState().setWriteOptions({ lockAfterWrite, generateQr: false, saveAsTemplate: false, templateName: '' });
    replace('/write/progress');
  }

  function continueWrite() {
    if (contentType === 'URL' && urlMode !== 'site') {
      const social = validateSocialUsername(urlMode, socialUser);
      if (!social.ok) {
        useToastStore.getState().show(social.error, 'error');
        return;
      }
    }
    const payload = buildPayload();
    if (!payload) {
      return;
    }
    const validation = payloadValidator.validate(payload);
    if (!validation.ok) {
      useToastStore.getState().show(validation.error ?? 'Revise os campos.', 'error');
      return;
    }
    if (multi) {
      continueMulti(payload);
      return;
    }
    const tag = useNfcStore.getState().currentTag;
    const bytes = validation.estimatedBytes ?? 0;
    // Gravação substitui o NDEF inteiro, então o limite é a capacidade da tag.
    const room = tag ? Math.max(tag.capacity || 0, tag.availableSpace || 0) : 0;
    if (tag && room > 0 && bytes > room) {
      useToastStore.getState().show(`A tag comporta cerca de ${room} bytes e este conteúdo usa ${bytes}.`, 'error');
      return;
    }
    useNfcStore.getState().setPendingPayload(payload);
    useNfcStore.getState().setWriteOptions({
      lockAfterWrite,
      generateQr,
      saveAsTemplate: templateName.trim().length > 0,
      templateName: templateName.trim(),
    });
    replace('/write/progress');
  }

  async function saveCardTemplate() {
    const payload = buildPayload();
    if (!payload) {
      return;
    }
    const validation = payloadValidator.validate(payload);
    if (!validation.ok) {
      useToastStore.getState().show(validation.error ?? 'Revise os campos.', 'error');
      return;
    }
    await saveTemplate({
      name: cardTitle.trim() || 'Cartão personalizado',
      type: 'CUSTOM',
      icon: cardIcon,
      color: cardColor,
      configuration: payload,
    });
    useToastStore.getState().show('Template salvo.', 'success');
  }

  const basePayload = multi ? buildPayload() : null;
  const multiBuild = basePayload ? measureMultiRecords([basePayload, ...extraRecords.map(entryToPayload)], tagRoom()) : null;

  if (!contentType || !meta) {
    return (
      <Screen>
        <AppHeader title="Configurar tag" back />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Configurar tag" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        <ExpoGoBanner />
        <Text style={{ color: colors.textPrimary, fontWeight: '700', marginBottom: 8 }}>Tipo de conteúdo</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Tipo de conteúdo" onPress={() => setOpen(true)} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <TypeBadge type={contentType} size={32} iconName={contentType === 'CUSTOM' ? cardIcon : undefined} tint={contentType === 'CUSTOM' ? cardColor : undefined} />
          <Text style={{ flex: 1, color: colors.textPrimary, fontWeight: '600' }}>{meta.name}</Text>
          <ChevronDown color={colors.textMuted} size={18} />
        </Pressable>

        {contentType === 'WHATSAPP' || contentType === 'PHONE' || contentType === 'VCARD' ? (
          <Input label="Número" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+55 99 99999-9999" />
        ) : null}
        {contentType === 'WHATSAPP' ? <Input label="Mensagem (opcional)" value={message} onChangeText={setMessage} placeholder="Olá! Gostaria de saber mais informações." multiline /> : null}
        {contentType === 'URL' ? (
          <View accessibilityRole="radiogroup" accessibilityLabel="Destino do link" style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {URL_MODES.map((mode) => {
              const selected = urlMode === mode.value;
              return (
                <Pressable
                  key={mode.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={mode.label}
                  onPress={() => setUrlMode(mode.value)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }}
                >
                  <Text style={[{ color: selected ? '#FFFFFF' : colors.textPrimary, fontSize: fs(14) }, inter('semibold')]}>{mode.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {contentType === 'LINK_APP' || (contentType === 'URL' && urlMode === 'site') ? <Input label="Link" value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="https://" /> : null}
        {contentType === 'URL' && urlMode !== 'site' ? (
          <>
            <Input
              label={`Usuário do ${SOCIAL_LABEL[urlMode]}`}
              value={socialUser}
              onChangeText={(value) => setSocialUser(extractSocialUsername(urlMode, value))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="seuperfil"
              accessibilityLabel={`Usuário do ${SOCIAL_LABEL[urlMode]}`}
              leftIcon={<Text style={[{ color: colors.textSecondary, fontSize: fs(16), marginRight: 2 }, inter('semibold')]}>@</Text>}
              containerStyle={{ marginBottom: 6 }}
            />
            <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginBottom: 14 }, inter('regular')]} numberOfLines={1}>
              {socialUser ? buildSocialUrl(urlMode, socialUser) : 'O link do perfil é gerado automaticamente.'}
            </Text>
          </>
        ) : null}
        {contentType === 'EMAIL' ? (
          <>
            <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="nome@email.com" />
            <Input label="Assunto" value={subject} onChangeText={setSubject} />
            <Input label="Mensagem (opcional)" value={body} onChangeText={setBody} multiline />
          </>
        ) : null}
        {contentType === 'VCARD' ? (
          <>
            <Input label="Nome" value={fullName} onChangeText={setFullName} placeholder="Nome completo" />
            <Input label="Empresa" value={company} onChangeText={setCompany} />
            <Input label="Cargo" value={jobTitle} onChangeText={setJobTitle} />
            <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Input label="Site" value={website} onChangeText={setWebsite} autoCapitalize="none" placeholder="https://" />
            <Input label="Endereço" value={address} onChangeText={setAddress} />
          </>
        ) : null}
        {contentType === 'WIFI' ? (
          <>
            <Input label="Nome da rede" value={ssid} onChangeText={setSsid} placeholder="Minha rede" />
            <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry />
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
        {contentType === 'LOCATION' ? (
          <>
            <Input label="Latitude" value={latitude} onChangeText={setLatitude} keyboardType="decimal-pad" />
            <Input label="Longitude" value={longitude} onChangeText={setLongitude} keyboardType="decimal-pad" />
          </>
        ) : null}
        {contentType === 'TEXT' ? <Input label="Texto" value={text} onChangeText={setText} multiline maxLength={400} /> : null}
        {contentType === 'CUSTOM' ? (
          <>
            <CustomCardForm title={cardTitle} onTitle={setCardTitle} icon={cardIcon} onIcon={setCardIcon} color={cardColor} onColor={setCardColor} fields={cardFields} onFields={setCardFields} />
            <PrimaryButton label="Salvar como template" variant="secondary" fullWidth style={{ marginTop: 8, marginBottom: 12 }} onPress={() => void saveCardTemplate()} />
          </>
        ) : null}
        {contentType === 'EVENT' ? <Input label="Título do evento" value={eventTitle} onChangeText={setEventTitle} /> : null}

        <Card style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: multi ? 12 : 0 }}>
            <Text style={{ flex: 1, color: colors.textPrimary, fontWeight: '700' }}>Modo avançado — múltiplos registros</Text>
            <Toggle value={multi} onValueChange={setMulti} accessibilityLabel="Modo avançado — múltiplos registros" />
          </View>
          {multi ? <MultiRecordEditor base={basePayload} entries={extraRecords} onChange={setExtraRecords} build={multiBuild} /> : null}
        </Card>

        <Card padding={0} style={{ marginBottom: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Opções avançadas" onPress={() => setAdvanced((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
            <Text style={{ flex: 1, color: colors.textPrimary, fontWeight: '700' }}>Opções avançadas</Text>
            <Animated.View style={chevronStyle}>
              <ChevronRight color={colors.textMuted} size={18} />
            </Animated.View>
          </Pressable>
          <Animated.View style={advancedStyle}>
            <View style={{ gap: 12, paddingHorizontal: 14, paddingBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, color: colors.textPrimary }}>Travar tag após gravar</Text>
                <Toggle value={lockAfterWrite} onValueChange={setLock} accessibilityLabel="Travar tag após gravar" />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, color: colors.textPrimary }}>Gerar QR Code</Text>
                <Toggle value={generateQr} onValueChange={setQr} accessibilityLabel="Gerar QR Code" />
              </View>
              <Input label="Salvar como template" value={templateName} onChangeText={setTemplateName} placeholder="Nome do template" />
            </View>
          </Animated.View>
        </Card>
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }}>
        <PrimaryButton label="Continuar" fullWidth onPress={continueWrite} />
      </View>
      </KeyboardAvoidingView>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar tipos" onPress={() => setOpen(false)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay }} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '70%' }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: fs(16), marginBottom: 8 }}>Tipo de conteúdo</Text>
            <ScrollView>
              {TYPES.map((type) => (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityLabel={CONTENT_TYPE_META[type].name}
                  onPress={() => {
                    setContentType(type);
                    setOpen(false);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}
                >
                  <TypeBadge type={type} size={32} />
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{CONTENT_TYPE_META[type].name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
