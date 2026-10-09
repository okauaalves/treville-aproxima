import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react-native';

import { Input } from '@/components/ui/Input';
import { CARD_COLORS, CARD_ICONS } from '@/constants/cardIcons';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { CardField } from '@/types/nfc';

export function CustomCardForm({
  title,
  onTitle,
  icon,
  onIcon,
  color,
  onColor,
  fields,
  onFields,
}: {
  title: string;
  onTitle: (value: string) => void;
  icon: string;
  onIcon: (value: string) => void;
  color: string;
  onColor: (value: string) => void;
  fields: CardField[];
  onFields: (fields: CardField[]) => void;
}) {
  const { colors, fs } = useTheme();

  function update(index: number, patch: Partial<CardField>) {
    onFields(fields.map((field, item) => (item === index ? { ...field, ...patch } : field)));
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= fields.length) {
      return;
    }
    const copy = [...fields];
    const current = copy[index];
    const other = copy[next];
    if (!current || !other) {
      return;
    }
    copy[index] = other;
    copy[next] = current;
    onFields(copy);
  }

  return (
    <View style={{ gap: 8 }}>
      <Input label="Título" value={title} onChangeText={onTitle} placeholder="Nome do cartão" maxLength={80} />
      <Text style={[{ color: colors.textPrimary }, inter('bold')]}>Ícone</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CARD_ICONS.map((item) => {
          const Icon = item.icon;
          const selected = icon === item.name;
          return (
            <Pressable
              key={item.name}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => onIcon(item.name)}
              style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.surfaceElevated : colors.surface }}
            >
              <Icon color={selected ? color : colors.textSecondary} size={20} />
            </Pressable>
          );
        })}
      </View>
      <Text style={[{ color: colors.textPrimary, marginTop: 8 }, inter('bold')]}>Cor</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CARD_COLORS.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={`Cor ${item}`}
            accessibilityState={{ selected: color === item }}
            onPress={() => onColor(item)}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: item, borderWidth: color === item ? 3 : 0, borderColor: colors.textPrimary }}
          />
        ))}
      </View>
      <Text style={[{ color: colors.textPrimary, marginTop: 8, fontSize: fs(16) }, inter('bold')]}>Campos</Text>
      {fields.map((field, index) => (
        <View key={`${index}-${field.label}`} style={{ gap: 4, marginBottom: 8 }}>
          <Input label="Rótulo" value={field.label} onChangeText={(value) => update(index, { label: value })} maxLength={40} />
          <Input label="Valor" value={field.value} onChangeText={(value) => update(index, { value })} maxLength={120} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Subir campo" onPress={() => move(index, -1)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <ChevronUp color={colors.textSecondary} size={18} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Descer campo" onPress={() => move(index, 1)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <ChevronDown color={colors.textSecondary} size={18} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Remover campo" onPress={() => onFields(fields.filter((_, item) => item !== index))} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Trash2 color={colors.error} size={18} />
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel="Adicionar campo" onPress={() => onFields([...fields, { label: '', value: '' }])} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <Plus color={colors.primary} size={18} />
        <Text style={[{ color: colors.primary }, inter('bold')]}>Adicionar campo</Text>
      </Pressable>
    </View>
  );
}
