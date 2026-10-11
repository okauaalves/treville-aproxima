import { Text, View, type ViewStyle } from 'react-native';

import { nfcManager } from '@/core/nfc/NfcManager';
import { useDispatchState } from '@/hooks/useTagDispatch';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

/** Só no app instalado: mostra se o reader mode está segurando as tags para o app. */
export function ReaderModeBadge({ style }: { style?: ViewStyle }) {
  const { colors, fs } = useTheme();
  const state = useDispatchState();
  if (nfcManager.getMode() !== 'native') {
    return null;
  }
  const on = state.active || state.techSession;
  return (
    <View
      accessibilityLabel={on ? 'Leitura NFC ativa no app' : 'Leitura NFC pausada'}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? colors.successBg : colors.warningBg }, style]}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? colors.success : colors.warning }} />
      <Text style={[{ color: on ? colors.success : colors.warning, fontSize: fs(13) }, inter('semibold')]}>{on ? 'Leitura NFC ativa no app' : 'Leitura NFC pausada'}</Text>
    </View>
  );
}
