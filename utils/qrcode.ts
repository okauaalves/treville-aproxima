import type { NfcPayload, WifiSecurity } from '@/types/nfc';

import { QR_BACKGROUND_COLOR, QR_FOREGROUND_DEFAULT } from '@/lib/qrColors';

export { QR_BACKGROUND_COLOR, QR_FOREGROUND_DEFAULT };

/** Default dos módulos do QR (preto). Preferência do usuário: useQrColorStore / getEffectiveQrForeground. */
export const QR_FOREGROUND_COLOR = QR_FOREGROUND_DEFAULT;

function wifiType(security: WifiSecurity | undefined): string {
  if (security === 'nopass' || !security) {
    return 'nopass';
  }
  if (security === 'WEP') {
    return 'WEP';
  }
  return 'WPA';
}

export function buildQrValue(payload: NfcPayload | null): string | null {
  if (!payload) {
    return null;
  }
  switch (payload.contentType) {
    case 'URL':
      return payload.url ?? null;
    case 'WHATSAPP': {
      const phone = (payload.phone ?? '').replace(/\D/g, '');
      const text = payload.message ? `?text=${encodeURIComponent(payload.message)}` : '';
      return phone ? `https://wa.me/${phone}${text}` : null;
    }
    case 'PHONE':
      return payload.phone ? `tel:${payload.phone}` : null;
    case 'EMAIL': {
      if (!payload.email) {
        return null;
      }
      const params = new URLSearchParams();
      if (payload.subject) {
        params.set('subject', payload.subject);
      }
      if (payload.body) {
        params.set('body', payload.body);
      }
      const query = params.toString();
      return `mailto:${payload.email}${query ? `?${query}` : ''}`;
    }
    case 'WIFI':
      return `WIFI:T:${wifiType(payload.security)};S:${payload.ssid ?? ''};P:${payload.security === 'nopass' ? '' : payload.password ?? ''};;`;
    case 'LOCATION':
      if (payload.latitude && payload.longitude) {
        return `geo:${payload.latitude},${payload.longitude}`;
      }
      return payload.address ?? null;
    case 'TEXT':
      return payload.text ?? null;
    case 'LINK_APP':
      return payload.appUri ?? null;
    case 'VCARD':
      return payload.fullName ?? null;
    default:
      return payload.text ?? payload.url ?? null;
  }
}
