import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { useTheme } from '@/theme/ThemeContext';
import type { DiagnosticReportData } from '@/core/nfc/DiagnosticEngine';

export function DiagnosticReport({ report }: { report: DiagnosticReportData }) {
  const { colors, fs } = useTheme();
  return (
    <Card>
      <Text style={{ color: report.canBeUsed ? colors.success : colors.error, fontWeight: '700', fontSize: fs(16), marginBottom: 12 }}>{report.canBeUsed ? 'TAG FUNCIONAL' : 'PROBLEMA ENCONTRADO'}</Text>
      {report.checks.map((check) => (
        <View key={check.id} style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{check.label}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: fs(12) }}>{check.detail}</Text>
        </View>
      ))}
    </Card>
  );
}

export function TagInfo({ title, value }: { title: string; value: string }) {
  const { colors, fs } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: fs(12) }}>{title}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: fs(13), fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

export function ProcessTimeline({ items }: { items: string[] }) {
  const { colors } = useTheme();
  return (
    <View>
      {items.map((item) => (
        <Text key={item} style={{ color: colors.textSecondary, marginBottom: 6 }}>• {item}</Text>
      ))}
    </View>
  );
}
