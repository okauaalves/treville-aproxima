import { Text } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
export function StatusBadge({ label, color }: { label: string; color: string }) {
  const { fs } = useTheme();
  return <Text style={{ color, fontSize: fs(12), fontWeight: '700' }}>{label}</Text>;
}
