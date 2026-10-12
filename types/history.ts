import type { TechnicalSnapshot } from '@/core/nfc/technical';
import type { ContentType } from '@/theme/colors';
import type { NfcPayload } from '@/types/nfc';

export type OperationKind = 'READ' | 'WRITE' | 'ERASE' | 'DIAGNOSE' | 'CLONE' | 'LOCK' | 'FORMAT';
export type OperationStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL';

export interface Operation {
  id: string;
  tagId: string | null;
  operation: OperationKind;
  status: OperationStatus;
  contentType: ContentType | null;
  payload: NfcPayload | null;
  /** Todos os registros quando a gravação teve mais de um (modo avançado). Só local. */
  payloads: NfcPayload[] | null;
  /** Dados técnicos da tag no momento da operação (sem UID em texto). Só local. */
  technical: TechnicalSnapshot | null;
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
