import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Nfc, QrCode } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';

import { DestinationIcon, DestinoForm } from '@/components/plaquinha/DestinoForm';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import {
  buildDestination,
  createPlaquinha,
  DESTINATION_LABELS,
  EMPTY_DESTINATION,
  generateLinkId,
  getLinkUrl,
  PLAQUINHA_NAME_MAX,
  shortDisplayUrl,
  type DestinationForm,
} from '@/lib/plaquinhas';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

type Step = 1 | 2 | 3;

export function CriarPlaquinhaModal({
  visible,
  userId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (id: string, writeNow: boolean) => void;
}) {
  const { colors, fs } = useTheme();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [form, setForm] = useState<DestinationForm>(EMPTY_DESTINATION);
  const [formError, setFormError] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [previewId, setPreviewId] = useState('');
  const [busy, setBusy] = useState<'create' | 'write' | null>(null);

  function reset() {
    setStep(1);
    setName('');
    setNameError(null);
    setForm(EMPTY_DESTINATION);
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
    if (!name.trim()) {
      setNameError('Dê um nome para a plaquinha.');
      return;
    }
    setNameError(null);
    setStep(2);
  }

  function nextFromDestination() {
    const check = buildDestination(form);
    if (!check.ok) {
      setFormError(check.error);
      return;
    }
    setFormError(null);
    setDestination(check.url);
    setPreviewId(generateLinkId());
    setStep(3);
  }

  async function create(writeNow: boolean) {
    setBusy(writeNow ? 'write' : 'create');
    try {
      const id = await createPlaquinha({ name, destinationUrl: destination, destinationType: form.type, userId, preferredId: previewId });
      useToastStore.getState().show('Plaquinha criada.', 'success');
      reset();
      onCreated(id, writeNow);
    } catch (error) {
      useToastStore.getState().show(error instanceof Error ? error.message : 'Não foi possível criar a plaquinha.', 'error');
      setBusy(null);
    }
  }

  const shortUrl = previewId ? getLinkUrl(previewId) : '';

  return (
    <BottomSheet visible={visible} onClose={close} accessibilityLabel="Fechar criação de plaquinha">
      <View testID="criar-plaquinha" style={{ flexShrink: 1 }}>
        <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(20) }, inter('extrabold')]}>
          Nova plaquinha
        </Text>
        <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginTop: 2, marginBottom: 12 }, inter('medium')]}>Passo {step} de 3</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
          {[1, 2, 3].map((item) => (
            <View key={item} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: item <= step ? colors.primary : colors.border }} />
          ))}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
          {step === 1 ? (
            <Input
              label="Nome da plaquinha"
              value={name}
              onChangeText={(value) => setName(value.slice(0, PLAQUINHA_NAME_MAX))}
              maxLength={PLAQUINHA_NAME_MAX}
              placeholder="Ex: Cardápio, Portfólio, Mesa 5"
              error={nameError ?? undefined}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={nextFromName}
            />
          ) : null}
          {step === 1 ? <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginTop: -8, marginBottom: 12, textAlign: 'right' }, inter('medium')]}>{name.length}/{PLAQUINHA_NAME_MAX}</Text> : null}

          {step === 2 ? <DestinoForm value={form} onChange={setForm} error={formError} /> : null}

          {step === 3 ? (
            <View style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.surface }}>
                <View accessible accessibilityRole="image" accessibilityLabel={`QR Code de ${shortDisplayUrl(shortUrl)}`} style={{ padding: 8, borderRadius: 12, backgroundColor: '#FFFFFF' }}>
                  <QRCode value={shortUrl} size={120} color="#1E40AF" backgroundColor="white" />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('semibold')]}>URL que vai no QR e na tag</Text>
                  <Text selectable style={[{ color: colors.primary, fontSize: fs(13) }, inter('bold')]}>{shortDisplayUrl(shortUrl)}</Text>
                  <Text style={[{ color: colors.textMuted, fontSize: fs(11) }, inter('regular')]}>Esse endereço nunca muda. Você troca só o destino.</Text>
                </View>
              </View>
              <View style={{ gap: 10, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.surface }}>
                <Text style={[{ color: colors.textPrimary, fontSize: fs(16) }, inter('bold')]} numberOfLines={1}>{name.trim()}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <DestinationIcon type={form.type} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('semibold')]}>{DESTINATION_LABELS[form.type]}</Text>
                    <Text numberOfLines={2} style={[{ color: colors.textPrimary, fontSize: fs(13) }, inter('regular')]}>{destination}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={{ gap: 10, marginTop: 14 }}>
          {step === 1 ? <PrimaryButton label="Próximo" fullWidth onPress={nextFromName} /> : null}
          {step === 2 ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Voltar" variant="secondary" fullWidth onPress={() => setStep(1)} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Próximo" fullWidth onPress={nextFromDestination} />
              </View>
            </View>
          ) : null}
          {step === 3 ? (
            <>
              <PrimaryButton label="Criar plaquinha" icon={<QrCode color={colors.onPrimary} size={20} />} fullWidth loading={busy === 'create'} disabled={busy !== null} onPress={() => void create(false)} />
              <PrimaryButton label="Criar e gravar na tag NFC agora" tone="success" icon={<Nfc color={colors.onSuccess} size={20} />} fullWidth loading={busy === 'write'} disabled={busy !== null} onPress={() => void create(true)} />
              <PrimaryButton label="Voltar" variant="ghost" fullWidth disabled={busy !== null} onPress={() => setStep(2)} />
            </>
          ) : null}
        </View>
      </View>
    </BottomSheet>
  );
}
