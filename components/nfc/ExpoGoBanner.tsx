import { Info } from 'lucide-react-native';
import { Platform, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { isExpoGo } from '@/core/platform/expoGo';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export function ExpoGoBanner() {
  const { colors, fs } = useTheme();
  if (!isExpoGo()) {
    return null;
  }
  const message =
    Platform.OS === 'ios'
      ? 'NFC disponível apenas no app instalado. Baixe o Tréville na App Store para usar o NFC.'
      : 'NFC disponível apenas no app instalado. Instale o APK do Tréville para usar o NFC.';
  return (
    <Card padding={14} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Info color={colors.primary} size={20} />
        <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(14) }, inter('medium')]}>{message}</Text>
      </View>
    </Card>
  );
}
