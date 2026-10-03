import { Platform } from 'react-native';

import { platformCapabilities } from '@/core/platform/capabilities';
import type { TagEvent } from '@/core/nfc/nfcNative';
import type { TagCapabilities, TagModel } from '@/types/nfc';

export type RawTag = TagEvent & {
  isWritable?: boolean;
};

function techs(tag: RawTag): string[] {
  return tag.techTypes ?? [];
}

function hasTech(tag: RawTag, name: string): boolean {
  return techs(tag).some((tech) => tech === name || tech.endsWith(`.${name}`));
}

export class CapabilityDetector {
  detect(rawTag: RawTag, usedSpace = 0): TagCapabilities {
    const capacity = rawTag.maxSize ?? 0;
    const canWrite = this.checkCanWrite(rawTag);
    const supportsNdef = this.supportsNdef(rawTag);
    return {
      canRead: true,
      canWrite,
      canFormat: this.checkCanFormat(rawTag),
      canLock: this.checkCanLock(rawTag),
      canPasswordProtect: this.checkCanPasswordProtect(rawTag),
      supportsNdef,
      isReadOnly: supportsNdef && !canWrite,
      capacity,
      usedSpace,
      availableSpace: Math.max(0, capacity - usedSpace),
      platformLimited: Platform.OS !== 'android',
    };
  }

  supportsNdef(rawTag: RawTag): boolean {
    return hasTech(rawTag, 'Ndef') || Array.isArray(rawTag.ndefMessage);
  }

  checkCanWrite(rawTag: RawTag): boolean {
    if (Platform.OS === 'ios') {
      return rawTag.isWritable === true && platformCapabilities.canWriteNdef;
    }
    return rawTag.isWritable === true;
  }

  checkCanFormat(rawTag: RawTag): boolean {
    return Platform.OS === 'android' && hasTech(rawTag, 'NdefFormatable') && platformCapabilities.canFormatTag;
  }

  checkCanLock(rawTag: RawTag): boolean {
    if (!platformCapabilities.canLockTag || Platform.OS !== 'android') {
      return false;
    }
    const model = detectModel(rawTag);
    return model.startsWith('NTAG') || model === 'MIFARE_ULTRALIGHT' || hasTech(rawTag, 'MifareUltralight');
  }

  checkCanPasswordProtect(rawTag: RawTag): boolean {
    if (!platformCapabilities.canPasswordProtect || Platform.OS !== 'android') {
      return false;
    }
    const model = detectModel(rawTag);
    return model === 'NTAG213' || model === 'NTAG215' || model === 'NTAG216';
  }
}

export function detectModel(rawTag: RawTag): TagModel {
  if (rawTag.maxSize === 144) {
    return 'NTAG213';
  }
  if (rawTag.maxSize === 504) {
    return 'NTAG215';
  }
  if (rawTag.maxSize === 888) {
    return 'NTAG216';
  }
  if (hasTech(rawTag, 'MifareClassic')) {
    return 'MIFARE_CLASSIC';
  }
  if (hasTech(rawTag, 'MifareUltralight')) {
    return 'MIFARE_ULTRALIGHT';
  }
  return 'UNKNOWN';
}

export const capabilityDetector = new CapabilityDetector();
