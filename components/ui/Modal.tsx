import type { ReactNode } from 'react';
import { Modal as NativeModal, Pressable, Text, View } from 'react-native';

import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

export function Modal({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { colors, fs } = useTheme();
  return (
    <NativeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay }} />
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
          <Text style={[{ color: colors.textPrimary, fontSize: fs(18), marginBottom: 8 }, inter('bold')]}>{title}</Text>
          {children}
        </View>
      </View>
    </NativeModal>
  );
}
