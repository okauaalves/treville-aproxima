import { Platform } from 'react-native';

import { isWebNfcSupported } from '@/core/nfc/webNfc';
import { isExpoGo } from '@/core/platform/expoGo';

const native = !isExpoGo() && (Platform.OS === 'ios' || Platform.OS === 'android');
const webNfc = Platform.OS === 'web' && isWebNfcSupported();

export const platformCapabilities = {
  canWriteNdef: native || webNfc,
  canReadNdef: native || webNfc,
  canFormatTag: Platform.OS === 'android' && !isExpoGo(),
  canLockTag: Platform.OS === 'android' && !isExpoGo(),
  canPasswordProtect: Platform.OS === 'android' && !isExpoGo(),
  canReadRawCommands: Platform.OS === 'android' && !isExpoGo(),
  canScanBackground: false,
  canReadMifareClassic: Platform.OS === 'android' && !isExpoGo(),
  canReadIsoDep: Platform.OS === 'android' && !isExpoGo(),
  requiresUserGesture: Platform.OS === 'ios',
  isExpoGo: isExpoGo(),
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
