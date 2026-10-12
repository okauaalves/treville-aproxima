import { Text, View } from 'react-native';

import type { ScanDay } from '@/lib/plaquinhaLogic';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

const BAR_AREA = 96;

/** Barras empilhadas por dia: QR (azul) embaixo, NFC (verde) em cima, proporcionais ao maior dia. */
export function StackedScanChart({ days, max, height = 140 }: { days: ScanDay[]; max: number; height?: number }) {
  const { colors, fs } = useTheme();
  const qrColor = colors.primary;
  const nfcColor = colors.success;
  return (
    <View testID="grafico-7-dias">
      <View
        accessible
        accessibilityLabel={`Scans nos últimos 7 dias: ${days.map((day) => `${day.label} ${day.count} (${day.qr} QR, ${day.nfc} NFC)`).join(', ')}`}
        style={{ flexDirection: 'row', alignItems: 'flex-end', height: height + 20, gap: 8 }}
      >
        {days.map((day, index) => {
          const scale = max > 0 ? height / max : 0;
          const qrHeight = Math.round(day.qr * scale);
          const nfcHeight = Math.round(day.nfc * scale);
          const today = index === days.length - 1;
          return (
            <View key={day.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Text style={[{ color: today ? colors.primary : colors.textSecondary, fontSize: fs(11), marginBottom: 4 }, inter('bold')]}>{day.count}</Text>
              <View style={{ width: '100%', maxWidth: 34, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.border, minHeight: 4 }}>
                {nfcHeight > 0 ? <View style={{ height: nfcHeight, backgroundColor: nfcColor }} /> : null}
                {qrHeight > 0 ? <View style={{ height: qrHeight, backgroundColor: qrColor }} /> : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {days.map((day, index) => (
          <Text key={day.key} style={[{ flex: 1, textAlign: 'center', color: index === days.length - 1 ? colors.primary : colors.textMuted, fontSize: fs(11) }, inter(index === days.length - 1 ? 'bold' : 'medium')]}>
            {day.label}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 }}>
        {[
          { label: 'QR Code', color: qrColor },
          { label: 'NFC', color: nfcColor },
        ].map((item) => (
          <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: item.color }} />
            <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('semibold')]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Barras dos últimos 7 dias feitas com View (altura proporcional ao maior dia). */
export function ScanChart({ days, max }: { days: ScanDay[]; max: number }) {
  const { colors, fs } = useTheme();
  const total = days.reduce((sum, day) => sum + day.count, 0);
  return (
    <View accessible accessibilityLabel={`Scans nos últimos 7 dias: ${days.map((day) => `${day.label} ${day.count}`).join(', ')}`} accessibilityHint={`${total} no total`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_AREA + 18, gap: 8 }}>
        {days.map((day, index) => {
          const height = max > 0 ? Math.max(4, Math.round((day.count / max) * BAR_AREA)) : 4;
          const today = index === days.length - 1;
          return (
            <View key={day.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Text style={[{ color: colors.textSecondary, fontSize: fs(11), marginBottom: 4 }, inter('semibold')]}>{day.count}</Text>
              <View style={{ width: '100%', maxWidth: 28, height, borderRadius: 6, backgroundColor: day.count > 0 ? (today ? colors.primary : colors.primaryLight) : colors.border }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {days.map((day, index) => (
          <Text key={day.key} style={[{ flex: 1, textAlign: 'center', color: index === days.length - 1 ? colors.primary : colors.textMuted, fontSize: fs(11) }, inter(index === days.length - 1 ? 'bold' : 'medium')]}>
            {day.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
