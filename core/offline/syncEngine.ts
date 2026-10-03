import NetInfo from '@react-native-community/netinfo';

import {
  listDirtyTemplates,
  listUnsyncedOperations,
  markOperationsSynced,
  markTemplatesSynced,
  upsertRemoteTemplate,
} from '@/core/offline/database';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

let syncInProgress = false;
const BATCH = 50;

export async function syncInBatches<T extends { id: string }>(
  fetchBatch: (limit: number) => Promise<T[]>,
  sendBatch: (items: T[]) => Promise<string[]>,
): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await fetchBatch(BATCH);
    if (batch.length === 0) {
      break;
    }
    const ids = await sendBatch(batch);
    total += ids.length;
    if (ids.length === 0) {
      break;
    }
  }
  return total;
}

async function syncOperations(userId: string): Promise<void> {
  if (!supabase) {
    return;
  }
  const client = supabase;
  await syncInBatches(
    (limit) => listUnsyncedOperations(limit),
    async (items) => {
      const rows = items.map((item) => ({
        id: item.id,
        user_id: userId,
        tag_id: item.tagId,
        operation: item.operation,
        status: item.status,
        content_type: item.contentType,
        payload: item.payload,
        error_message: item.errorMessage,
        integrity_percent: item.integrityPercent,
        duration_ms: item.durationMs,
        created_at: item.createdAt,
      }));
      const { error } = await client.from('operations').upsert(rows);
      if (error) {
        throw error;
      }
      const ids = items.map((item) => item.id);
      await markOperationsSynced(ids);
      return ids;
    },
  );
}

async function syncTemplates(userId: string): Promise<void> {
  if (!supabase) {
    return;
  }
  const client = supabase;
  const dirty = await listDirtyTemplates();
  if (dirty.length > 0) {
    const rows = dirty.map((item) => ({
      id: item.id,
      user_id: userId,
      name: item.name,
      type: item.type,
      icon: item.icon,
      color: item.color,
      configuration: item.configuration,
      use_count: item.useCount,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    }));
    const { error } = await client.from('templates').upsert(rows);
    if (!error) {
      await markTemplatesSynced(dirty.map((item) => item.id));
    }
  }
  const { data, error } = await client.from('templates').select('*').eq('user_id', userId);
  if (error || !Array.isArray(data)) {
    return;
  }
  for (const row of data) {
    const record = row as {
      id: string;
      name: string;
      type: string;
      icon: string | null;
      color: string | null;
      configuration: unknown;
      use_count: number;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    };
    const contentType = record.type;
    if (typeof contentType !== 'string') {
      continue;
    }
    await upsertRemoteTemplate({
      id: record.id,
      name: record.name,
      type: contentType as never,
      icon: record.icon,
      color: record.color,
      configuration:
        record.configuration && typeof record.configuration === 'object'
          ? (record.configuration as never)
          : { contentType: contentType as never },
      isDefault: false,
      useCount: record.use_count ?? 0,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      synced: true,
      deletedAt: record.deleted_at,
    });
  }
}

export async function syncIfOnline(): Promise<void> {
  if (syncInProgress || !isSupabaseConfigured || !supabase) {
    return;
  }
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    return;
  }
  syncInProgress = true;
  try {
    const net = await NetInfo.fetch();
    const online = net.isConnected !== false && net.isInternetReachable !== false;
    if (!online) {
      return;
    }
    await syncOperations(userId);
    await syncTemplates(userId);
  } catch (error) {
    console.warn('Falha silenciosa na sincronização', error);
  } finally {
    syncInProgress = false;
  }
}

export function startAutoSync(intervalMs = 30000): () => void {
  const timer = setInterval(() => {
    void syncIfOnline();
  }, intervalMs);
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected !== false && state.isInternetReachable !== false) {
      void syncIfOnline();
    }
  });
  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}
