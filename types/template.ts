import type { ContentType } from '@/theme/colors';
import type { NfcPayload } from '@/types/nfc';

export interface NfcTemplate {
  id: string;
  name: string;
  type: ContentType;
  icon: string | null;
  color: string | null;
  configuration: NfcPayload;
  isDefault: boolean;
  useCount: number;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  deletedAt: string | null;
}
