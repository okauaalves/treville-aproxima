import { Platform } from 'react-native';

import { isWebNfcSupported } from '@/core/nfc/webNfc';

const webNfc = Platform.OS === 'web' && (isWebNfcSupported() || __DEV__);

export const platformCapabilities = {
  canWriteNdef: Platform.OS === 'ios' || Platform.OS === 'android' || webNfc,
  canReadNdef: Platform.OS === 'ios' || Platform.OS === 'android' || webNfc,
  canFormatTag: Platform.OS === 'android',
  canLockTag: Platform.OS === 'android',
  canPasswordProtect: Platform.OS === 'android',
  canReadRawCommands: Platform.OS === 'android',
  canScanBackground: false,
  canReadMifareClassic: Platform.OS === 'android',
  canReadIsoDep: Platform.OS === 'android',
  requiresUserGesture: Platform.OS === 'ios',
};

export function getUnavailableMessage(feature: string): string {
  if (Platform.OS === 'ios') {
    return `${feature} não está disponível no iPhone.`;
  }
  if (Platform.OS === 'android') {
    return `${feature} não está disponível no Android.`;
  }
  return `${feature} não está disponível neste ambiente.`;
}
