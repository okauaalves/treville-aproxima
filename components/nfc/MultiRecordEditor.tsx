import { Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Select } from '@/components/ui/Select';
import { CONTENT_TYPE_META } from '@/constants/nfcTypes';
import { ndefEngine, type MultiRecordBuild } from '@/core/nfc/NdefEngine';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { WritePayload } from '@/types/nfc';

export type MultiRecordKind = 'URL' | 'TEXT' | 'PHONE' | 'EMAIL' | 'CUSTOM';

export interface MultiRecordEntry {
  key: string;
  kind: MultiRecordKind;
  value: string;
  mimeType: string;
}

const KIND_OPTIONS: { value: MultiRecordKind; label: string }[] = [
  { value: 'URL', label: 'URL' },
  { value: 'TEXT', label: 'Texto' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'CUSTOM', label: 'Custom (MIME)' },
];

const PLACEHOLDERS: Record<MultiRecordKind, string> = {
  URL: 'https://',
  TEXT: 'Texto do registro',
  PHONE: '+55 11 99999-9999',
  EMAIL: 'nome@email.com',
  CUSTOM: 'Conteúdo do registro',
};

let counter = 0;

export function newMultiRecordEntry(kind: MultiRecordKind = 'TEXT'): MultiRecordEntry {
  counter += 1;
  return { key: `record-${Date.now()}-${counter}`, kind, value: '', mimeType: 'text/plain' };
}

export function entryToPayload(entry: MultiRecordEntry): WritePayload {
  const value = entry.value.trim();
  switch (entry.kind) {
    case 'URL':
      return { contentType: 'URL', url: value };
    case 'PHONE':
      return { contentType: 'PHONE', phone: value, includeCountryCode: true };
    case 'EMAIL':
      return { contentType: 'EMAIL', email: value };
    case 'CUSTOM':
      return { contentType: 'CUSTOM', mimeType: entry.mimeType.trim(), text: entry.value };
    default:
      return { contentType: 'TEXT', text: entry.value };
  }
}

export function measureMultiRecords(payloads: WritePayload[], capacity: number): MultiRecordBuild | null {
  try {
    return ndefEngine.buildMultipleRecords(payloads, capacity);
  } catch {
    return null;
  }
}

export function MultiRecordEditor({
  base,
  entries,
  onChange,
  build,
}: {
  base: WritePayload | null;
  entries: MultiRecordEntry[];
  onChange: (entries: MultiRecordEntry[]) => void;
  build: MultiRecordBuild | null;
}) {
  const { colors, fs } = useTheme();

  function update(key: string, patch: Partial<MultiRecordEntry>) {
    onChange(entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
  }

  const capacity = build?.capacity ?? 0;
  const total = build?.totalSize ?? 0;
  const ratio = capacity > 0 ? Math.min(1, total / capacity) : 0;
  const over = build ? !build.fits : false;
  const barColor = over ? colors.error : ratio > 0.85 ? colors.warning : colors.success;

  return (
    <View style={{ gap: 12 }}>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>
        Registro 1: {base ? CONTENT_TYPE_META[base.contentType].name : '—'} (preenchido acima). Os registros abaixo são gravados em seguida, na mesma mensagem NDEF.
      </Text>
      {entries.map((entry, index) => (
        <View key={entry.key} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(14) }, inter('bold')]}>Registro {index + 2}</Text>
            <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginRight: 8 }, inter('regular')]}>
              {entry.value.trim() ? `${measureMultiRecords([entryToPayload(entry)], 0)?.messageBytes ?? 0} bytes` : ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remover registro ${index + 2}`}
              hitSlop={8}
              onPress={() => onChange(entries.filter((item) => item.key !== entry.key))}
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
            >
              <X color={colors.error} size={18} />
            </Pressable>
          </View>
          <Select<MultiRecordKind> label="Tipo" value={entry.kind} options={KIND_OPTIONS} onChange={(kind) => update(entry.key, { kind })} />
          {entry.kind === 'CUSTOM' ? <Input label="Tipo MIME" value={entry.mimeType} onChangeText={(mimeType) => update(entry.key, { mimeType })} autoCapitalize="none" placeholder="text/plain" /> : null}
          <Input
            label="Valor"
            value={entry.value}
            onChangeText={(value) => update(entry.key, { value })}
            autoCapitalize={entry.kind === 'TEXT' || entry.kind === 'CUSTOM' ? 'sentences' : 'none'}
            keyboardType={entry.kind === 'URL' ? 'url' : entry.kind === 'PHONE' ? 'phone-pad' : entry.kind === 'EMAIL' ? 'email-address' : 'default'}
            placeholder={PLACEHOLDERS[entry.kind]}
            containerStyle={{ marginBottom: 0 }}
          />
        </View>
      ))}
      <PrimaryButton label="+ Adicionar record" variant="secondary" fullWidth onPress={() => onChange([...entries, newMultiRecordEntry()])} />
      <View accessibilityLabel={`Capacidade: ${total} de ${capacity || 'desconhecido'} bytes`} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Text style={[{ color: colors.textPrimary, fontSize: fs(13) }, inter('semibold')]}>Capacidade</Text>
          <Text style={[{ flexShrink: 1, textAlign: 'right', color: over ? colors.error : colors.textSecondary, fontSize: fs(13) }, inter('semibold')]}>
            {capacity > 0 ? `${total} / ${capacity} bytes` : `${total} bytes (aproxime uma tag para saber o limite)`}
          </Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round((capacity > 0 ? ratio : 0) * 100)}%`, height: '100%', backgroundColor: barColor }} />
        </View>
        {over ? <Text style={[{ color: colors.error, fontSize: fs(12) }, inter('medium')]}>Excede a capacidade em {build?.overBy} bytes. Remova ou encurte registros.</Text> : null}
      </View>
    </View>
  );
}
