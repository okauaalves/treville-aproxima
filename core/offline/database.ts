import * as Crypto from 'expo-crypto';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { SaveOperationInput, SaveTagInput, SaveTemplateInput } from '@/core/offline/contracts';
import { mapOperationRow, mapTemplateRow, safeStringify, type OperationRow, type TemplateRow } from '@/core/offline/mappers';
import { runMigrations } from '@/core/offline/migrations';
import type { ContentType } from '@/theme/colors';
import type { HistoryFilter, Operation } from '@/types/history';
import type { NfcTemplate } from '@/types/template';

let database: SQLiteDatabase | null = null;
let opening: Promise<void> | null = null;

const OPERATION_SELECT = `
  SELECT o.id, o.tag_id, o.operation, o.status, o.content_type, o.payload, o.error_message,
         o.integrity_percent, o.duration_ms, o.created_at, o.synced,
         o.display_title, o.display_value, o.tag_uid_hash,
         COALESCE(o.tag_type, t.type) AS tag_type,
         COALESCE(o.tag_capacity, t.capacity) AS tag_capacity,
         COALESCE(o.tag_uid_hash, t.uid_hash) AS tag_hash
  FROM operations o
  LEFT JOIN tags t ON t.id = o.tag_id
`;

function db(): SQLiteDatabase {
  if (!database) {
    throw new Error('Banco local não inicializado.');
  }
  return database;
}

export function generateId(): string {
  return Crypto.randomUUID();
}

export async function hashUid(uid: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, uid.trim().toUpperCase());
}

export function initDatabase(): Promise<void> {
  if (!opening) {
    opening = (async () => {
      const opened = openDatabaseSync('nfc-manager.db');
      database = opened;
      await runMigrations({
        async getUserVersion() {
          const row = await opened.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
          return row?.user_version ?? 0;
        },
        async setUserVersion(version: number) {
          await opened.execAsync(`PRAGMA user_version = ${version}`);
        },
        async exec(sql: string) {
          await opened.execAsync(sql);
        },
      });
    })().catch((error: unknown) => {
      opening = null;
      database = null;
      throw error;
    });
  }
  return opening;
}

export async function saveTag(input: SaveTagInput): Promise<string> {
  const uidHash = await hashUid(input.uid);
  const existing = await db().getFirstAsync<{ id: string }>('SELECT id FROM tags WHERE uid_hash = ?', uidHash);
  const writable = input.isWritable ? 1 : 0;
  const locked = input.isLocked ? 1 : 0;
  const technologies = safeStringify(input.technologies);
  if (existing) {
    await db().runAsync(
      'UPDATE tags SET type = ?, capacity = ?, technologies = ?, is_writable = ?, is_locked = ? WHERE id = ?',
      input.type,
      input.capacity,
      technologies,
      writable,
      locked,
      existing.id,
    );
    return existing.id;
  }
  const id = generateId();
  await db().runAsync(
    'INSERT INTO tags (id, uid_hash, type, capacity, technologies, is_writable, is_locked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    uidHash,
    input.type,
    input.capacity,
    technologies,
    writable,
    locked,
    new Date().toISOString(),
  );
  return id;
}

export async function saveOperation(input: SaveOperationInput): Promise<string> {
  const id = generateId();
  let tagId = input.tagId ?? null;
  let tagHash: string | null = null;
  if (input.tagUid) {
    tagHash = await hashUid(input.tagUid);
    if (!tagId) {
      tagId = await saveTag({
        uid: input.tagUid,
        type: input.tagType ?? 'UNKNOWN',
        capacity: input.tagCapacity ?? 0,
        technologies: [],
        isWritable: true,
        isLocked: false,
      });
    }
  }
  await db().runAsync(
    `INSERT INTO operations (
      id, tag_id, operation, status, content_type, payload, error_message, integrity_percent, duration_ms, created_at, synced,
      display_title, display_value, tag_type, tag_capacity, tag_uid_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    id,
    tagId,
    input.operation,
    input.status,
    input.contentType ?? null,
    input.payload ? safeStringify(input.payload) : null,
    input.errorMessage ?? null,
    input.integrityPercent ?? null,
    input.durationMs ?? null,
    new Date().toISOString(),
    input.displayTitle ?? null,
    input.displayValue ?? null,
    input.tagType ?? null,
    input.tagCapacity ?? null,
    tagHash,
  );
  return id;
}

export async function clearOperations(): Promise<void> {
  await clearAllOperations();
}

export async function incrementTemplateUse(id: string): Promise<void> {
  await incrementTemplateUseCount(id);
}

function filterSql(filter: HistoryFilter): string {
  if (filter === 'read') {
    return "AND o.operation = 'READ'";
  }
  // 'write' inclui WRITE e ERASE: as duas gravam na tag. DIAGNOSE fica só em 'all'.
  if (filter === 'write') {
    return "AND o.operation IN ('WRITE', 'ERASE')";
  }
  return '';
}

export async function getOperations(options?: { filter?: HistoryFilter; limit?: number; offset?: number }): Promise<Operation[]> {
  const filter = options?.filter ?? 'all';
  const limit = options?.limit ?? 30;
  const offset = options?.offset ?? 0;
  const rows = await db().getAllAsync<OperationRow>(
    `${OPERATION_SELECT} WHERE 1 = 1 ${filterSql(filter)} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    limit,
    offset,
  );
  return rows.map(mapOperationRow);
}

export async function getOperationById(id: string): Promise<Operation | null> {
  const row = await db().getFirstAsync<OperationRow>(`${OPERATION_SELECT} WHERE o.id = ?`, id);
  return row ? mapOperationRow(row) : null;
}

export async function deleteOperation(id: string): Promise<void> {
  await db().runAsync('DELETE FROM operations WHERE id = ?', id);
}

export async function clearAllOperations(): Promise<void> {
  await db().runAsync('DELETE FROM operations');
}

export async function getTemplates(type?: ContentType): Promise<NfcTemplate[]> {
  const rows = type
    ? await db().getAllAsync<TemplateRow>(
        'SELECT * FROM templates WHERE deleted_at IS NULL AND type = ? ORDER BY updated_at DESC',
        type,
      )
    : await db().getAllAsync<TemplateRow>('SELECT * FROM templates WHERE deleted_at IS NULL ORDER BY updated_at DESC');
  return rows.map(mapTemplateRow);
}

export async function saveTemplate(input: SaveTemplateInput): Promise<string> {
  const now = new Date().toISOString();
  if (input.id) {
    await db().runAsync(
      'UPDATE templates SET name = ?, type = ?, icon = ?, color = ?, configuration = ?, updated_at = ?, synced = 0 WHERE id = ?',
      input.name,
      input.type,
      input.icon ?? null,
      input.color ?? null,
      safeStringify(input.configuration),
      now,
      input.id,
    );
    return input.id;
  }
  const id = generateId();
  await db().runAsync(
    `INSERT INTO templates (id, name, type, icon, color, configuration, is_default, use_count, created_at, updated_at, synced, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, NULL)`,
    id,
    input.name,
    input.type,
    input.icon ?? null,
    input.color ?? null,
    safeStringify(input.configuration),
    now,
    now,
  );
  return id;
}

export async function incrementTemplateUseCount(id: string): Promise<void> {
  await db().runAsync('UPDATE templates SET use_count = use_count + 1, updated_at = ?, synced = 0 WHERE id = ?', new Date().toISOString(), id);
}

export async function deleteTemplate(id: string): Promise<void> {
  await db().runAsync(
    'UPDATE templates SET deleted_at = ?, synced = 0, updated_at = ? WHERE id = ? AND is_default = 0',
    new Date().toISOString(),
    new Date().toISOString(),
    id,
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await db().getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db().runAsync(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    key,
    value,
    new Date().toISOString(),
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db().getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function applyHistoryRetention(days: number): Promise<void> {
  if (days <= 0) {
    return;
  }
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  await db().runAsync('DELETE FROM operations WHERE created_at < ?', cutoff);
}

export async function listUnsyncedOperations(limit: number): Promise<Operation[]> {
  const rows = await db().getAllAsync<OperationRow>(
    `${OPERATION_SELECT} WHERE o.synced = 0 ORDER BY o.created_at ASC LIMIT ?`,
    limit,
  );
  return rows.map(mapOperationRow);
}

export async function markOperationsSynced(ids: string[]): Promise<void> {
  for (const id of ids) {
    await db().runAsync('UPDATE operations SET synced = 1 WHERE id = ?', id);
  }
}

export async function listDirtyTemplates(): Promise<NfcTemplate[]> {
  const rows = await db().getAllAsync<TemplateRow>('SELECT * FROM templates WHERE synced = 0 AND is_default = 0');
  return rows.map(mapTemplateRow);
}

export async function markTemplatesSynced(ids: string[]): Promise<void> {
  for (const id of ids) {
    await db().runAsync('UPDATE templates SET synced = 1 WHERE id = ?', id);
  }
}

export async function upsertRemoteTemplate(template: NfcTemplate): Promise<void> {
  const existing = await db().getFirstAsync<TemplateRow>('SELECT * FROM templates WHERE id = ?', template.id);
  if (existing && existing.updated_at > template.updatedAt) {
    return;
  }
  const now = template.updatedAt;
  if (existing) {
    await db().runAsync(
      'UPDATE templates SET name=?, type=?, icon=?, color=?, configuration=?, use_count=?, updated_at=?, synced=1, deleted_at=? WHERE id=?',
      template.name,
      template.type,
      template.icon,
      template.color,
      safeStringify(template.configuration),
      template.useCount,
      now,
      template.deletedAt,
      template.id,
    );
    return;
  }
  await db().runAsync(
    `INSERT INTO templates (id, name, type, icon, color, configuration, is_default, use_count, created_at, updated_at, synced, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?)`,
    template.id,
    template.name,
    template.type,
    template.icon,
    template.color,
    safeStringify(template.configuration),
    template.useCount,
    template.createdAt,
    now,
    template.deletedAt,
  );
}
