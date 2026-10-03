import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  const { colors, fs } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((item) => item.value === value);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[{ color: colors.textPrimary, fontSize: fs(14), marginBottom: 8 }, inter('bold')]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={{ minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        {current?.icon}
        <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(16) }, inter('semibold')]}>{current?.label ?? value}</Text>
        <ChevronDown color={colors.textMuted} size={18} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar lista" onPress={() => setOpen(false)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay }} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 16, maxHeight: '70%' }}>
            <Text style={[{ color: colors.textPrimary, fontSize: fs(16), marginBottom: 8 }, inter('bold')]}>{label}</Text>
            <ScrollView>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  {option.icon}
                  <Text style={[{ color: option.value === value ? colors.primary : colors.textPrimary }, inter('semibold')]}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
