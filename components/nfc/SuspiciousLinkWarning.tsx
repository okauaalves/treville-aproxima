import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { ShieldAlert, TriangleAlert } from 'lucide-react-native';

import { ConfirmDialog } from '@/components/nfc/ConfirmDialog';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { UrlSafety } from '@/core/validation/urlSafety';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

const RED = '#DC2626';

/**
 * Aviso para link lido de tag com risco. Mostra a URL completa e só abre depois de "Abrir mesmo assim"
 * e de uma segunda confirmação. Links bloqueados (javascript:, data:, file:, vbscript:) nunca abrem.
 */
export function SuspiciousLinkWarning({ url, safety, textColor }: { url: string; safety: UrlSafety; textColor?: string }) {
  const { colors, fs } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const text = textColor ?? colors.textPrimary;

  async function openAnyway() {
    setConfirming(false);
    if (safety.blocked) {
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      useToastStore.getState().show('Não foi possível abrir este link.', 'error');
    }
  }

  return (
    <View
      accessibilityRole="alert"
      testID="suspicious-link-warning"
      style={{ borderRadius: 16, borderWidth: 1.5, borderColor: RED, backgroundColor: 'rgba(220,38,38,0.12)', padding: 14, gap: 8 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ShieldAlert color={RED} size={22} />
        <Text style={[{ flex: 1, color: RED, fontSize: fs(16) }, inter('extrabold')]}>{safety.blocked ? 'Link bloqueado' : 'Link suspeito'}</Text>
      </View>
      {safety.reasons.map((reason) => (
        <Text key={reason} style={[{ color: text, fontSize: fs(13), lineHeight: fs(19) }, inter('regular')]}>
          {reason}
        </Text>
      ))}
      <Text style={[{ color: text, fontSize: fs(12), opacity: 0.8 }, inter('semibold')]}>Endereço completo:</Text>
      <Text selectable style={[{ color: text, fontSize: fs(13) }, inter('medium')]}>
        {url}
      </Text>
      {safety.blocked ? (
        <Text style={[{ color: RED, fontSize: fs(13) }, inter('bold')]}>Por segurança, este tipo de link não pode ser aberto pelo app.</Text>
      ) : (
        <PrimaryButton label="Abrir mesmo assim" variant="danger" fullWidth onPress={() => setConfirming(true)} />
      )}
      <ConfirmDialog
        visible={confirming}
        title="Abrir link suspeito?"
        message="Este link veio de uma tag NFC e pode levar a um site falso ou instalar um aplicativo. Só continue se você confia em quem gravou a tag."
        danger
        icon={<TriangleAlert color={colors.error} size={22} />}
        details={
          <Text selectable style={[{ color: colors.textPrimary, fontSize: fs(13), marginBottom: 8 }, inter('medium')]}>
            {url}
          </Text>
        }
        confirmLabel="Abrir"
        onConfirm={() => void openAnyway()}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
