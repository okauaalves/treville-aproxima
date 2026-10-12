import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { IdCard, Nfc, QrCode } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';

import { DestinationFields, DestinationIcon } from '@/components/plaquinha/DestinoForm';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { sanitizeText } from '@/core/validation/securityValidator';
import {
  buildDestination,
  CREATE_DESTINATION_TYPES,
  createPlaquinha,
  DESTINATION_LABELS,
  EMPTY_DESTINATION,
  generateLinkId,
  getLinkUrl,
  getProfilePageUrl,
  PLAQUINHA_NAME_MAX,
  type DestinationForm,
  type DestinationType,
} from '@/lib/plaquinhas';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

type Step = 1 | 2 | 3 | 4;
const STEPS: Step[] = [1, 2, 3, 4];
const STEP_TITLES: Record<Step, string> = { 1: 'Nome', 2: 'Tipo de destino', 3: 'Destino', 4: 'Prévia' };
const NAME_EXAMPLES = ['Cartão de visita', 'Mesa 5', 'Cardápio'];

export interface CreatedPlaquinha {
  id: string;
  writeNow: boolean;
  profile: boolean;
}

function TypeTile({ type, selected, onPress }: { type: DestinationType; selected: boolean; onPress: () => void }) {
  const { colors, fs } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={DESTINATION_LABELS[type]}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '23%',
        flexGrow: 1,
        minHeight: 92,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 4,
        paddingVertical: 10,
        borderRadius: radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primaryGlow : pressed ? colors.backgroundSecondary : colors.surface,
      })}
    >
      <DestinationIcon type={type} size={40} />
      <Text numberOfLines={2} style={[{ color: selected ? colors.primary : colors.textPrimary, fontSize: fs(12), textAlign: 'center' }, inter(selected ? 'bold' : 'semibold')]}>
        {DESTINATION_LABELS[type]}
      </Text>
    </Pressable>
  );
}

export function CriarPlaquinhaModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (created: CreatedPlaquinha) => void }) {
  const { colors, fs } = useTheme();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [form, setForm] = useState<DestinationForm>({ ...EMPTY_DESTINATION, type: 'whatsapp' });
  const [formError, setFormError] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [previewId, setPreviewId] = useState('');
  const [busy, setBusy] = useState<'create' | 'write' | null>(null);
  const profile = form.type === 'profile';

  function reset() {
    setStep(1);
    setName('');
    setNameError(null);
    setForm({ ...EMPTY_DESTINATION, type: 'whatsapp' });
    setFormError(null);
    setDestination('');
    setBusy(null);
  }

  function close() {
    if (busy) {
      return;
    }
    reset();
    onClose();
  }

  function nextFromName() {
    if (!sanitizeText(name)) {
      setNameError('Dê um nome para a plaquinha.');
      return;
    }
    setNameError(null);
    setStep(2);
  }

  function nextFromDestination() {
    const id = generateLinkId();
    if (profile) {
      setFormError(null);
      setPreviewId(id);
      setDestination(getProfilePageUrl(id));
      setStep(4);
      return;
    }
    const check = buildDestination(form);
    if (!check.ok) {
      setFormError(check.error);
      return;
    }
    setFormError(null);
    setDestination(check.url);
    setPreviewId(id);
    setStep(4);
  }

  async function create(writeNow: boolean) {
    setBusy(writeNow ? 'write' : 'create');
    try {
      const id = await createPlaquinha({ name, destinationUrl: destination, destinationType: form.type, preferredId: previewId });
      useToastStore.getState().show(profile ? 'Plaquinha criada. Agora adicione seus links.' : 'Plaquinha criada.', 'success');
      reset();
      onCreated({ id, writeNow, profile });
    } catch (error) {
      useToastStore.getState().show(error instanceof Error ? error.message : 'Não foi possível criar a plaquinha.', 'error');
      setBusy(null);
    }
  }

  const fullUrl = previewId ? getLinkUrl(previewId) : '';

  return (
    <BottomSheet visible={visible} onClose={close} accessibilityLabel="Fechar criação de plaquinha">
      <View testID="criar-plaquinha" style={{ flexShrink: 1 }}>
        <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(20) }, inter('extrabold')]}>
          Nova plaquinha
        </Text>
        <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginTop: 2, marginBottom: 12 }, inter('medium')]}>
          Passo {step} de 4 · {STEP_TITLES[step]}
        </Text>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={`Passo ${step} de 4`} style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
          {STEPS.map((item) => (
            <View key={item} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: item <= step ? colors.primary : colors.border }} />
          ))}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
          {step === 1 ? (
            <View>
              <Input
                label="Nome da plaquinha"
                value={name}
                onChangeText={(value) => setName(value.slice(0, PLAQUINHA_NAME_MAX))}
                maxLength={PLAQUINHA_NAME_MAX}
                placeholder="Ex: Cartão de visita"
                error={nameError ?? undefined}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={nextFromName}
              />
              <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginTop: -8, marginBottom: 12, textAlign: 'right' }, inter('medium')]}>
                {name.length}/{PLAQUINHA_NAME_MAX}
              </Text>
              <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginBottom: 8 }, inter('semibold')]}>Exemplos</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {NAME_EXAMPLES.map((example) => (
                  <Pressable
                    key={example}
                    accessibilityRole="button"
                    accessibilityLabel={`Usar o nome ${example}`}
                    onPress={() => {
                      setName(example);
                      setNameError(null);
                    }}
                    style={({ pressed }) => ({
                      minHeight: 40,
                      justifyContent: 'center',
                      paddingHorizontal: 14,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.primaryGlow : colors.surface,
                    })}
                  >
                    <Text style={[{ color: colors.primary, fontSize: fs(13) }, inter('semibold')]}>{example}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View testID="tipo-destino" accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CREATE_DESTINATION_TYPES.map((type) => (
                <TypeTile
                  key={type}
                  type={type}
                  selected={form.type === type}
                  onPress={() => {
                    setForm({ ...form, type });
                    setFormError(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          {step === 3 ? (
            profile ? (
              <View style={{ gap: 12, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.surface }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <DestinationIcon type="profile" size={44} />
                  <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>Uma página com todos os seus links</Text>
                </View>
                <Text style={[{ color: colors.textSecondary, fontSize: fs(14), lineHeight: fs(21) }, inter('regular')]}>
                  Quem escanear vê sua foto, nome, bio e botões para WhatsApp, Instagram, site e o que mais você quiser.
                </Text>
                <Text style={[{ color: colors.textSecondary, fontSize: fs(14), lineHeight: fs(21) }, inter('regular')]}>
                  Depois de criar, você vai direto para a tela de links. O primeiro link vira o destino reserva caso desligue a página.
                </Text>
              </View>
            ) : (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <DestinationIcon type={form.type} size={36} />
                  <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]}>{DESTINATION_LABELS[form.type]}</Text>
                </View>
                <DestinationFields value={form} onChange={setForm} error={formError} />
              </View>
            )
          ) : null}

          {step === 4 ? (
            <View style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.surface }}>
                <View accessible accessibilityRole="image" accessibilityLabel={`QR Code de ${fullUrl}`} style={{ padding: 6, borderRadius: 10, backgroundColor: '#FFFFFF' }}>
                  <QRCode value={fullUrl} size={96} color="#1E40AF" backgroundColor="white" />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('semibold')]}>URL que vai no QR e na tag</Text>
                  <Text testID="url-completa" selectable style={[{ color: colors.primary, fontSize: fs(12) }, inter('bold')]}>
                    {fullUrl}
                  </Text>
                  <Text style={[{ color: colors.textMuted, fontSize: fs(11) }, inter('regular')]}>Esse endereço nunca muda. Você troca só o destino.</Text>
                </View>
              </View>
              <View style={{ gap: 10, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.surface }}>
                <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]} numberOfLines={1}>
                  {sanitizeText(name)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <DestinationIcon type={form.type} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('semibold')]}>{DESTINATION_LABELS[form.type]}</Text>
                    <Text numberOfLines={2} style={[{ color: colors.textPrimary, fontSize: fs(13) }, inter('regular')]}>
                      {profile ? 'Mini página de perfil com seus links' : destination}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={{ gap: 10, marginTop: 14 }}>
          {step === 1 ? <PrimaryButton label="Próximo" fullWidth onPress={nextFromName} /> : null}
          {step === 2 || step === 3 ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Voltar" variant="secondary" fullWidth onPress={() => setStep(step === 2 ? 1 : 2)} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Próximo" fullWidth onPress={step === 2 ? () => setStep(3) : nextFromDestination} />
              </View>
            </View>
          ) : null}
          {step === 4 ? (
            <>
              <PrimaryButton
                label="Criar apenas QR"
                icon={profile ? <IdCard color={colors.onPrimary} size={20} /> : <QrCode color={colors.onPrimary} size={20} />}
                fullWidth
                loading={busy === 'create'}
                disabled={busy !== null}
                onPress={() => void create(false)}
              />
              <PrimaryButton label="Criar e gravar na tag NFC" tone="success" icon={<Nfc color={colors.onSuccess} size={20} />} fullWidth loading={busy === 'write'} disabled={busy !== null} onPress={() => void create(true)} />
              <PrimaryButton label="Voltar" variant="ghost" fullWidth disabled={busy !== null} onPress={() => setStep(3)} />
            </>
          ) : null}
        </View>
      </View>
    </BottomSheet>
  );
}
