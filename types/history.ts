import type { ContentType } from '@/theme/colors';
import type { NfcPayload } from '@/types/nfc';

export type OperationKind = 'READ' | 'WRITE' | 'ERASE' | 'DIAGNOSE';
export type OperationStatus = 'SUCCESS' | 'FAILED';

export interface Operation {
  id: string;
  tagId: string | null;
  operation: OperationKind;
  status: OperationStatus;
  contentType: ContentType | null;
  payload: NfcPayload | null;
  errorMessage: string | null;
  integrityPercent: number | null;
  durationMs: number | null;
  createdAt: string;
  synced: boolean;
  tagType: string | null;
  tagCapacity: number | null;
  tagHash: string | null;
  title: string;
  displayTitle: string;
  displayValue: string;
}

export type HistoryFilter = 'all' | 'read' | 'write';
