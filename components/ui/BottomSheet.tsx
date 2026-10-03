import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

export function BottomSheet({ visible, onClose, children, accessibilityLabel }: { visible: boolean; onClose: () => void; children: ReactNode; accessibilityLabel: string }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay }} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 16 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />
          {children}
        </View>
      </View>
    </Modal>
  );
}
