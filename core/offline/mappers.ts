import { isContentType } from '@/constants/nfcTypes';
import type { TechnicalSnapshot } from '@/core/nfc/technical';
import type { ContentType } from '@/theme/colors';
import type { HistoryFilter, Operation, OperationKind, OperationStatus } from '@/types/history';
import type { NfcPayload } from '@/types/nfc';
import type { NfcTemplate } from '@/types/template';

export interface OperationRow {
  id: string;
  tag_id: string | null;
  operation: string;
  status: string;
  content_type: string | null;
  payload: string | null;
  error_message: string | null;
  integrity_percent: number | null;
  duration_ms: number | null;
  created_at: string;
  synced: number | null;
  tag_type: string | null;
  tag_capacity: number | null;
  tag_hash: string | null;
  display_title: string | null;
  display_value: string | null;
  tag_uid_hash: string | null;
  /** Colunas da migração 4; linhas antigas (SQLite ou IndexedDB) não têm. */
  technical?: string | null;
  payloads?: string | null;
}

export interface TemplateRow {
  id: string;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
  configuration: string;
  is_default: number | null;
  use_count: number | null;
  created_at: string;
  updated_at: string;
  synced: number | null;
  deleted_at: string | null;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  uid_hash: string | null;
  type: string;
  capacity: number | null;
  technologies: string | null;
  is_writable: number | null;
  is_locked: number | null;
  created_at: string;
}

const KINDS: OperationKind[] = ['READ', 'WRITE', 'ERASE', 'DIAGNOSE', 'CLONE', 'LOCK', 'FORMAT'];
const STATUSES: OperationStatus[] = ['SUCCESS', 'FAILED', 'PARTIAL'];

/** Operações que alteram a tag: entram no filtro "Gravadas". DIAGNOSE só em "Todas". */
export const WRITE_KINDS: OperationKind[] = ['WRITE', 'ERASE', 'CLONE', 'LOCK', 'FORMAT'];

export const OPERATION_LABELS: Record<OperationKind, string> = {
  READ: 'Leitura',
  WRITE: 'Gravação',
  CLONE: 'Clone',
  LOCK: 'Lock',
  ERASE: 'Erase',
  DIAGNOSE: 'Diagnóstico',
  FORMAT: 'Formatação',
};

export const STATUS_LABELS: Record<OperationStatus, string> = {
  SUCCESS: 'Sucesso',
  FAILED: 'Falha',
  PARTIAL: 'Parcial',
};

export function operationLabel(kind: OperationKind): string {
  return OPERATION_LABELS[kind];
}

export function statusLabel(status: OperationStatus): string {
  return STATUS_LABELS[status];
}

export function matchesHistoryFilter(filter: HistoryFilter, operation: string): boolean {
  if (filter === 'read') {
    return operation === 'READ';
  }
  if (filter === 'write') {
    return WRITE_KINDS.some((kind) => kind === operation);
  }
  return true;
}

/** Gravação com verificação incompleta (integridade entre 1 e 89%) conta como Parcial. */
export function statusFromIntegrity(passed: boolean, integrityPercent: number): OperationStatus {
  if (passed) {
    return 'SUCCESS';
  }
  return integrityPercent > 0 ? 'PARTIAL' : 'FAILED';
}

function parseTechnical(raw: string | null | undefined): TechnicalSnapshot | null {
  if (!raw) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1 || !Array.isArray((value as { records?: unknown }).records)) {
      return null;
    }
    return value as TechnicalSnapshot;
  } catch {
    return null;
  }
}

function parsePayloadList(raw: string | null | undefined): NfcPayload[] | null {
  if (!raw) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return null;
    }
    const list = value.filter((item): item is NfcPayload => Boolean(item) && typeof item === 'object' && isContentType(String((item as { contentType?: unknown }).contentType)));
    return list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

function parsePayload(raw: string | null): NfcPayload | null {
  if (!raw) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('contentType' in value)) {
      return null;
    }
    const record = value as NfcPayload;
    if (!isContentType(record.contentType)) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

function kindOf(value: string): OperationKind {
  return KINDS.find((item) => item === value) ?? 'READ';
}

function statusOf(value: string): OperationStatus {
  return STATUSES.find((item) => item === value) ?? 'FAILED';
}

function titleFor(contentType: ContentType | null, payload: NfcPayload | null, operation: OperationKind): string {
  if (payload?.contentType === 'WHATSAPP') {
    return payload.phone ? `WhatsApp ${payload.phone}` : 'WhatsApp';
  }
  if (payload?.ssid) {
    return payload.ssid;
  }
  if (payload?.fullName) {
    return payload.fullName;
  }
  if (payload?.url) {
    return payload.url;
  }
  if (payload?.text) {
    return payload.text.slice(0, 48);
  }
  if (contentType) {
    return contentType;
  }
  return operation;
}

export function mapOperationRow(row: OperationRow): Operation {
  const contentType = row.content_type && isContentType(row.content_type) ? row.content_type : null;
  const payload = parsePayload(row.payload);
  const operation = kindOf(row.operation);
  return {
    id: row.id,
    tagId: row.tag_id,
    operation,
    status: statusOf(row.status),
    contentType,
    payload,
    payloads: parsePayloadList(row.payloads),
    technical: parseTechnical(row.technical),
    errorMessage: row.error_message,
    integrityPercent: row.integrity_percent,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    synced: row.synced === 1,
    tagType: row.tag_type,
    tagCapacity: row.tag_capacity,
    tagHash: row.tag_uid_hash ?? row.tag_hash,
    title: row.display_title || titleFor(contentType, payload, operation),
    displayTitle: row.display_title || titleFor(contentType, payload, operation),
    displayValue: row.display_value || payload?.url || payload?.text || payload?.phone || '',
  };
}

export function mapTemplateRow(row: TemplateRow): NfcTemplate {
  const type = isContentType(row.type) ? row.type : 'CUSTOM';
  const configuration = parsePayload(row.configuration) ?? { contentType: type };
  return {
    id: row.id,
    name: row.name,
    type,
    icon: row.icon,
    color: row.color,
    configuration,
    isDefault: row.is_default === 1,
    useCount: row.use_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: row.synced === 1,
    deletedAt: row.deleted_at,
  };
}

export function safeStringify(value: unknown): string {
  return JSON.stringify(value);
}
