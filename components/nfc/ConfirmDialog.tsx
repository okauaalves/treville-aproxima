import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Modal } from '@/components/ui/Modal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export function ConfirmDialog({
  visible,
  title,
  message,
  details,
  danger = false,
  icon,
  confirmLabel,
  cancelable = true,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  details?: ReactNode;
  danger?: boolean;
  icon?: ReactNode;
  confirmLabel: string;
  cancelable?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors, fs } = useTheme();
  return (
    <Modal visible={visible} title={title} onClose={onCancel}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        {icon}
        <Text style={[{ flex: 1, color: danger ? colors.error : colors.textSecondary, fontSize: fs(14), lineHeight: fs(20) }, inter(danger ? 'bold' : 'regular')]}>{message}</Text>
      </View>
      {details}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        {cancelable ? (
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Cancelar" variant="secondary" fullWidth onPress={onCancel} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <PrimaryButton label={confirmLabel} variant={danger ? 'danger' : 'primary'} fullWidth onPress={onConfirm} />
        </View>
      </View>
    </Modal>
  );
}
