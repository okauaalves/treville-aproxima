import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { DestinoForm } from '@/components/plaquinha/DestinoForm';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { buildDestination, parseDestination, updateDestino, type DestinationForm, type RedirectLink } from '@/lib/plaquinhas';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

type Props = { link: RedirectLink | null; onClose: () => void; onSaved: (link: RedirectLink) => void };

/** Troca só o destino. A URL curta (QR e tag) continua a mesma, então não regrava nada. */
export function EditarDestinoModal({ link, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <BottomSheet visible={link !== null} onClose={() => (busy ? undefined : onClose())} accessibilityLabel="Fechar edição de destino">
      {link ? <EditarDestinoBody key={`${link.id}:${link.updated_at}`} link={link} onClose={onClose} onSaved={onSaved} busy={busy} setBusy={setBusy} /> : null}
    </BottomSheet>
  );
}

function EditarDestinoBody({
  link,
  onClose,
  onSaved,
  busy,
  setBusy,
}: {
  link: RedirectLink;
  onClose: () => void;
  onSaved: (link: RedirectLink) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const { colors, fs } = useTheme();
  const [form, setForm] = useState<DestinationForm>(() => parseDestination(link.destination_url, link.destination_type));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const check = buildDestination(form);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    try {
      await updateDestino(link.id, check.url, form.type);
      useToastStore.getState().show('Destino atualizado! Todos os scans já vão pro novo destino.', 'success');
      onSaved({ ...link, destination_url: check.url, destination_type: form.type, updated_at: new Date().toISOString() });
    } catch (failure) {
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível salvar o destino.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View testID="editar-destino" style={{ flexShrink: 1 }}>
      <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(20) }, inter('extrabold')]}>
        Mudar destino
      </Text>
      <Text numberOfLines={1} style={[{ color: colors.textSecondary, fontSize: fs(13), marginTop: 2 }, inter('medium')]}>
        {link.name}
      </Text>
      <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginTop: 6, marginBottom: 14 }, inter('regular')]}>
        O QR Code e a tag continuam iguais. Não precisa gravar de novo.
      </Text>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
        <DestinoForm value={form} onChange={setForm} error={error} />
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Cancelar" variant="secondary" fullWidth disabled={busy} onPress={onClose} />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Salvar" fullWidth loading={busy} onPress={() => void save()} />
        </View>
      </View>
    </View>
  );
}
