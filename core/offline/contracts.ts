import type { ContentType } from '@/theme/colors';
import type { HistoryFilter, Operation, OperationKind, OperationStatus } from '@/types/history';
import type { NfcPayload } from '@/types/nfc';
import type { NfcTemplate } from '@/types/template';

export interface SaveTagInput {
  uid: string;
  type: string;
  capacity: number;
  technologies: string[];
  isWritable: boolean;
  isLocked: boolean;
}

export interface SaveOperationInput {
  tagId?: string | null;
  tagUid?: string;
  operation: OperationKind;
  status: OperationStatus;
  contentType?: ContentType | null;
  payload?: NfcPayload | null;
  errorMessage?: string | null;
  integrityPercent?: number | null;
  durationMs?: number | null;
  displayTitle?: string;
  displayValue?: string;
  tagType?: string | null;
  tagCapacity?: number | null;
}

export interface SaveTemplateInput {
  id?: string;
  name: string;
  type: ContentType;
  icon?: string | null;
  color?: string | null;
  configuration: NfcPayload;
}

export interface DatabaseApi {
  initDatabase(): Promise<void>;
  saveTag(input: SaveTagInput): Promise<string>;
  saveOperation(input: SaveOperationInput): Promise<string>;
  getOperations(options?: { filter?: HistoryFilter; limit?: number; offset?: number }): Promise<Operation[]>;
  getOperationById(id: string): Promise<Operation | null>;
  deleteOperation(id: string): Promise<void>;
  clearAllOperations(): Promise<void>;
  getTemplates(type?: ContentType): Promise<NfcTemplate[]>;
  saveTemplate(input: SaveTemplateInput): Promise<string>;
  incrementTemplateUseCount(id: string): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  getAllSettings(): Promise<Record<string, string>>;
  applyHistoryRetention(days: number): Promise<void>;
  listUnsyncedOperations(limit: number): Promise<Operation[]>;
  markOperationsSynced(ids: string[]): Promise<void>;
  listDirtyTemplates(): Promise<NfcTemplate[]>;
  markTemplatesSynced(ids: string[]): Promise<void>;
  upsertRemoteTemplate(template: NfcTemplate): Promise<void>;
}
