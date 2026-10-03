import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import type { SaveOperationInput, SaveTagInput, SaveTemplateInput } from '@/core/offline/contracts';
import { mapOperationRow, mapTemplateRow, safeStringify, type OperationRow, type TagRow, type TemplateRow } from '@/core/offline/mappers';
import type { ContentType } from '@/theme/colors';
import type { HistoryFilter, Operation } from '@/types/history';
import type { NfcTemplate } from '@/types/template';

const LEGACY_KEY = 'nfc-manager.web-db';
const DB_NAME = 'tags-do-luiz';
const STORE = 'kv';
const STATE_KEY = 'state';

interface MemoryState {
  tags: TagRow[];
  operations: OperationRow[];
  templates: TemplateRow[];
  settings: Record<string, string>;
}

const empty = (): MemoryState => ({ tags: [], operations: [], templates: [], settings: {} });
let state = empty();
let opening: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Armazenamento indisponível neste ambiente.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o IndexedDB.'));
  });
}

async function readIndexedState(): Promise<MemoryState | null> {
  if (typeof indexedDB === 'undefined') {
    return null;
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(STATE_KEY);
    request.onsuccess = () => resolve((request.result as MemoryState | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Falha ao ler o histórico.'));
  });
}

async function persist(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao salvar no navegador.'));
  });
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
      const stored = await readIndexedState().catch(() => null);
      let legacy: MemoryState | null = null;
      if (!stored) {
        const rawLegacy = await AsyncStorage.getItem(LEGACY_KEY);
        if (rawLegacy) {
          try {
            legacy = JSON.parse(rawLegacy) as MemoryState;
          } catch {
            legacy = null;
          }
        }
      }
      const raw = stored ?? legacy;
      if (!raw) {
        state = empty();
        return;
      }
      state = {
        tags: raw.tags ?? [],
        operations: raw.operations ?? [],
        templates: raw.templates ?? [],
        settings: raw.settings ?? {},
      };
      if (!stored) {
        await persist();
      }
    })().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

function toOperation(row: OperationRow, tag?: TagRow): Operation {
  return mapOperationRow({
    ...row,
    tag_type: tag?.type ?? null,
    tag_capacity: tag?.capacity ?? null,
    tag_hash: tag?.uid_hash ?? null,
  });
}

export async function saveTag(input: SaveTagInput): Promise<string> {
  await initDatabase();
  const uidHash = await hashUid(input.uid);
  const existing = state.tags.find((tag) => tag.uid_hash === uidHash);
  if (existing) {
    existing.type = input.type;
    existing.capacity = input.capacity;
    existing.technologies = safeStringify(input.technologies);
    existing.is_writable = input.isWritable ? 1 : 0;
    existing.is_locked = input.isLocked ? 1 : 0;
    await persist();
    return existing.id;
  }
  const id = generateId();
  state.tags.push({
    id,
    uid_hash: uidHash,
    type: input.type,
    capacity: input.capacity,
    technologies: safeStringify(input.technologies),
    is_writable: input.isWritable ? 1 : 0,
    is_locked: input.isLocked ? 1 : 0,
    created_at: new Date().toISOString(),
  });
  await persist();
  return id;
}

export async function saveOperation(input: SaveOperationInput): Promise<string> {
  await initDatabase();
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
  state.operations.push({
    id,
    tag_id: tagId,
    operation: input.operation,
    status: input.status,
    content_type: input.contentType ?? null,
    payload: input.payload ? safeStringify(input.payload) : null,
    error_message: input.errorMessage ?? null,
    integrity_percent: input.integrityPercent ?? null,
    duration_ms: input.durationMs ?? null,
    created_at: new Date().toISOString(),
    synced: 0,
    tag_type: input.tagType ?? null,
    tag_capacity: input.tagCapacity ?? null,
    tag_hash: tagHash,
    display_title: input.displayTitle ?? null,
    display_value: input.displayValue ?? null,
    tag_uid_hash: tagHash,
  });
  await persist();
  return id;
}

function matches(filter: HistoryFilter, operation: string): boolean {
  if (filter === 'read') {
    return operation === 'READ';
  }
  if (filter === 'write') {
    return operation === 'WRITE' || operation === 'ERASE';
  }
  return true;
}

export async function getOperations(options?: { filter?: HistoryFilter; limit?: number; offset?: number }): Promise<Operation[]> {
  await initDatabase();
  const filter = options?.filter ?? 'all';
  const limit = options?.limit ?? 30;
  const offset = options?.offset ?? 0;
  return state.operations
    .filter((row) => matches(filter, row.operation))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(offset, offset + limit)
    .map((row) => toOperation(row, state.tags.find((tag) => tag.id === row.tag_id)));
}

export async function getOperationById(id: string): Promise<Operation | null> {
  await initDatabase();
  const row = state.operations.find((item) => item.id === id);
  if (!row) {
    return null;
  }
  return toOperation(row, state.tags.find((tag) => tag.id === row.tag_id));
}

export async function deleteOperation(id: string): Promise<void> {
  state.operations = state.operations.filter((item) => item.id !== id);
  await persist();
}

export async function clearAllOperations(): Promise<void> {
  state.operations = [];
  await persist();
}

export async function getTemplates(type?: ContentType): Promise<NfcTemplate[]> {
  await initDatabase();
  return state.templates
    .filter((row) => !row.deleted_at && (!type || row.type === type))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(mapTemplateRow);
}

export async function saveTemplate(input: SaveTemplateInput): Promise<string> {
  const now = new Date().toISOString();
  if (input.id) {
    const existing = state.templates.find((item) => item.id === input.id);
    if (existing) {
      existing.name = input.name;
      existing.type = input.type;
      existing.icon = input.icon ?? null;
      existing.color = input.color ?? null;
      existing.configuration = safeStringify(input.configuration);
      existing.updated_at = now;
      existing.synced = 0;
      await persist();
      return existing.id;
    }
  }
  const id = generateId();
  state.templates.push({
    id,
    name: input.name,
    type: input.type,
    icon: input.icon ?? null,
    color: input.color ?? null,
    configuration: safeStringify(input.configuration),
    is_default: 0,
    use_count: 0,
    created_at: now,
    updated_at: now,
    synced: 0,
    deleted_at: null,
  });
  await persist();
  return id;
}

export async function incrementTemplateUseCount(id: string): Promise<void> {
  const row = state.templates.find((item) => item.id === id);
  if (row) {
    row.use_count = (row.use_count ?? 0) + 1;
    row.updated_at = new Date().toISOString();
    row.synced = 0;
    await persist();
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const row = state.templates.find((item) => item.id === id && item.is_default !== 1);
  if (row) {
    const now = new Date().toISOString();
    row.deleted_at = now;
    row.updated_at = now;
    row.synced = 0;
    await persist();
  }
}

export async function getSetting(key: string): Promise<string | null> {
  await initDatabase();
  return state.settings[key] ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await initDatabase();
  state.settings[key] = value;
  await persist();
}

export async function getAllSettings(): Promise<Record<string, string>> {
  await initDatabase();
  return { ...state.settings };
}

export async function applyHistoryRetention(days: number): Promise<void> {
  if (days <= 0) {
    return;
  }
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  state.operations = state.operations.filter((row) => row.created_at >= cutoff);
  await persist();
}

export async function listUnsyncedOperations(limit: number): Promise<Operation[]> {
  return state.operations
    .filter((row) => row.synced !== 1)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, limit)
    .map((row) => toOperation(row, state.tags.find((tag) => tag.id === row.tag_id)));
}

export async function markOperationsSynced(ids: string[]): Promise<void> {
  state.operations.forEach((row) => {
    if (ids.includes(row.id)) {
      row.synced = 1;
    }
  });
  await persist();
}

export async function listDirtyTemplates(): Promise<NfcTemplate[]> {
  return state.templates.filter((row) => row.synced !== 1 && row.is_default !== 1).map(mapTemplateRow);
}

export async function markTemplatesSynced(ids: string[]): Promise<void> {
  state.templates.forEach((row) => {
    if (ids.includes(row.id)) {
      row.synced = 1;
    }
  });
  await persist();
}

export async function clearOperations(): Promise<void> {
  await clearAllOperations();
}

export async function incrementTemplateUse(id: string): Promise<void> {
  await incrementTemplateUseCount(id);
}

export async function upsertRemoteTemplate(template: NfcTemplate): Promise<void> {
  const existing = state.templates.find((item) => item.id === template.id);
  if (existing && existing.updated_at > template.updatedAt) {
    return;
  }
  const row = {
    id: template.id,
    name: template.name,
    type: template.type,
    icon: template.icon,
    color: template.color,
    configuration: safeStringify(template.configuration),
    is_default: 0,
    use_count: template.useCount,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
    synced: 1,
    deleted_at: template.deletedAt,
  };
  if (existing) {
    Object.assign(existing, row);
  } else {
    state.templates.push(row);
  }
  await persist();
}
