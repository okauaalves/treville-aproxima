import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Copy, FileText, QrCode, Share2 } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';

import { Modal } from '@/components/ui/Modal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useQrColorStore } from '@/stores/qrColorStore';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import { QR_BACKGROUND_COLOR } from '@/utils/qrcode';

async function share(message: string, title: string): Promise<void> {
  try {
    await Share.share({ message, title });
  } catch {
    useToastStore.getState().show('Compartilhamento indisponível neste ambiente.', 'warning');
  }
}

export function ShareSheet({
  visible,
  contentText,
  report,
  url,
  onClone,
  onClose,
}: {
  visible: boolean;
  contentText: string;
  report: string | null;
  url: string | null;
  onClone: (() => void) | null;
  onClose: () => void;
}) {
  const { colors, fs } = useTheme();
  const qrForeground = useQrColorStore((state) => state.foreground);
  const [showQr, setShowQr] = useState(false);

  function close() {
    setShowQr(false);
    onClose();
  }

  return (
    <Modal visible={visible} title="Compartilhar" onClose={close}>
      {showQr && url ? (
        <View style={{ alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
            <QRCode value={url} size={200} color={qrForeground} backgroundColor={QR_BACKGROUND_COLOR} ecl="M" />
          </View>
          <Text selectable numberOfLines={2} ellipsizeMode="middle" style={[{ alignSelf: 'stretch', color: colors.textSecondary, fontSize: fs(12), textAlign: 'center' }, inter('regular')]}>{url}</Text>
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        <PrimaryButton label="Conteúdo (texto)" variant="secondary" fullWidth icon={<Share2 color={colors.primary} size={18} />} onPress={() => void share(contentText, 'Conteúdo da tag')} />
        {report ? <PrimaryButton label="Relatório técnico" variant="secondary" fullWidth icon={<FileText color={colors.primary} size={18} />} onPress={() => void share(report, 'Relatório técnico NFC')} /> : null}
        {url ? <PrimaryButton label={showQr ? 'Ocultar QR Code' : 'QR Code do link'} variant="secondary" fullWidth icon={<QrCode color={colors.primary} size={18} />} onPress={() => setShowQr((value) => !value)} /> : null}
        {onClone ? (
          <PrimaryButton
            label="Gravar em outra tag"
            variant="secondary"
            fullWidth
            icon={<Copy color={colors.primary} size={18} />}
            onPress={() => {
              close();
              onClone();
            }}
          />
        ) : null}
        <PrimaryButton label="Fechar" fullWidth onPress={close} />
      </View>
    </Modal>
  );
}
