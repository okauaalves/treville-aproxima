import { isContentType } from '@/constants/nfcTypes';
import type { ContentType } from '@/theme/colors';
import type { Operation, OperationKind, OperationStatus } from '@/types/history';
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

const KINDS: OperationKind[] = ['READ', 'WRITE', 'ERASE', 'DIAGNOSE'];
const STATUSES: OperationStatus[] = ['SUCCESS', 'FAILED'];

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
