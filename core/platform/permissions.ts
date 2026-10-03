import { Platform } from 'react-native';

import { isWebNfcSupported, webNfcUnavailableReason } from '@/core/nfc/webNfc';
import { platformCapabilities } from '@/core/platform/capabilities';

export interface NfcPermissionState {
  granted: boolean;
  canAsk: boolean;
  message: string;
}

export function getNfcPermissionState(): NfcPermissionState {
  if (Platform.OS === 'web') {
    if (isWebNfcSupported()) {
      return {
        granted: true,
        canAsk: true,
        message: 'O Chrome pede permissão ao aproximar a tag.',
      };
    }
    if (__DEV__) {
      return {
        granted: true,
        canAsk: false,
        message: 'Modo de teste: o NFC deste navegador é simulado.',
      };
    }
    return {
      granted: false,
      canAsk: false,
      message: webNfcUnavailableReason(),
    };
  }
  if (!platformCapabilities.canReadNdef) {
    return {
      granted: false,
      canAsk: false,
      message: 'Este dispositivo não possui NFC.',
    };
  }
  return {
    granted: true,
    canAsk: false,
    message: 'A permissão de NFC é declarada no aplicativo.',
  };
}
