import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

/** No tablet/desktop a folha fica centralizada com no máximo 640 de largura. */
export function BottomSheet({ visible, onClose, children, accessibilityLabel }: { visible: boolean; onClose: () => void; children: ReactNode; accessibilityLabel: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay }} />
        <View style={{ width: '100%', maxWidth: 640, maxHeight: '92%', alignSelf: 'center', backgroundColor: colors.surfaceElevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 16, paddingBottom: Math.max(insets.bottom, 16) }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
