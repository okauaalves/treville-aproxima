import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

export function Toggle({ value, onValueChange, accessibilityLabel }: { value: boolean; onValueChange: (value: boolean) => void; accessibilityLabel: string }) {
  const { colors, isDark } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      style={{ width: 51, height: 31, borderRadius: 16, backgroundColor: value ? colors.primary : isDark ? '#334155' : '#E2E8F0', justifyContent: 'center', paddingHorizontal: 2 }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', backgroundColor: selected ? colors.primary : colors.surface, borderWidth: 1, borderColor: selected ? colors.primary : colors.border }}>
            <Text style={{ color: selected ? '#fff' : colors.textSecondary, fontSize: fs(13), fontWeight: '600' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
