import { Platform } from 'react-native';

import { nfcManager } from '@/core/nfc/NfcManager';
import { isExpoGo } from '@/core/platform/expoGo';
import { getNfcPermissionState } from '@/core/platform/permissions';

export type NfcBlockReason = 'expo-go' | 'unsupported' | 'disabled' | 'permission' | 'web';

export interface NfcAssessment {
  ready: boolean;
  reason: NfcBlockReason | null;
  title: string;
  message: string;
  solution: string;
  canOpenSettings: boolean;
  testMode: boolean;
}

function blocked(
  reason: NfcBlockReason,
  title: string,
  message: string,
  solution: string,
  canOpenSettings: boolean,
  testMode: boolean,
): NfcAssessment {
  return { ready: false, reason, title, message, solution, canOpenSettings, testMode };
}

const ready: NfcAssessment = {
  ready: true,
  reason: null,
  title: '',
  message: '',
  solution: '',
  canOpenSettings: false,
  testMode: false,
};

export async function assessNfc(): Promise<NfcAssessment> {
  if (isExpoGo()) {
    const ios = Platform.OS === 'ios';
    return blocked(
      'expo-go',
      'NFC indisponível no Expo Go',
      ios
        ? 'NFC disponível apenas no app instalado. Baixe o Tréville Aproxima na App Store para usar o NFC.'
        : 'NFC disponível apenas no app instalado. Instale o APK do Tréville Aproxima para usar o NFC.',
      ios ? 'O Expo Go não inclui o módulo NFC. Use o app instalado.' : 'O Expo Go não inclui o módulo NFC. Instale o APK do Tréville Aproxima.',
      false,
      __DEV__,
    );
  }

  const mode = nfcManager.getMode();
  if (mode === 'simulated') {
    return blocked(
      'web',
      'Web NFC sem suporte',
      'Este navegador não consegue ler nem gravar tags NFC.',
      'Use o Chrome no Android, em HTTPS, ou o aplicativo instalado.',
      false,
      __DEV__,
    );
  }
  if (mode === 'unavailable') {
    return blocked(
      'unsupported',
      'NFC indisponível',
      'Este aparelho não oferece NFC para o Tréville Aproxima.',
      'Use um celular com NFC pelo aplicativo instalado.',
      false,
      false,
    );
  }

  const supported = await nfcManager.isSupported();
  if (!supported) {
    return blocked(
      'unsupported',
      'NFC indisponível',
      'O hardware NFC não respondeu.',
      'Confira se o celular tem NFC e se o app foi instalado por fora do Expo Go.',
      false,
      false,
    );
  }

  const enabled = await nfcManager.isEnabled();
  if (!enabled) {
    return blocked(
      'disabled',
      'NFC desligado',
      'O rádio NFC está desativado.',
      'Ative o NFC nas configurações do celular e tente de novo.',
      Platform.OS === 'android' || Platform.OS === 'ios',
      false,
    );
  }

  const permission = getNfcPermissionState();
  if (!permission.granted) {
    return blocked(
      'permission',
      'Sem permissão de NFC',
      permission.message,
      'Conceda o acesso ao NFC quando o sistema pedir.',
      Platform.OS === 'android',
      false,
    );
  }

  return ready;
}
