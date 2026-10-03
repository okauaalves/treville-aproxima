import { Pressable, Text, View } from 'react-native';

import type { ThemePreference } from './colors';
import { useTheme } from './ThemeContext';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema' },
];

export function ThemeModePicker() {
  const { preference, setPreference } = useTheme();

  return (
    <View className="flex-row gap-2">
      {OPTIONS.map((option) => {
        const selected = preference === option.value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => setPreference(option.value)}
            className={
              selected
                ? 'flex-1 items-center rounded-xl border border-primary bg-primary px-3 py-3'
                : 'flex-1 items-center rounded-xl border border-border bg-surface px-3 py-3'
            }
          >
            <Text
              className={
                selected
                  ? 'text-sm font-semibold text-on-primary'
                  : 'text-sm font-semibold text-foreground'
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
