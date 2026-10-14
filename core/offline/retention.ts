export const HISTORY_MAX_AGE_DAYS = 30;
export const HISTORY_MAX_ROWS = 500;

export interface PruneOptions {
  now?: number;
  maxAgeDays?: number;
  maxRows?: number;
  /** Mantém operações com synced = 0 (só faz sentido com o envio ao Supabase ligado). */
  keepUnsynced?: boolean;
}

/** `created_at` é ISO 8601 em UTC (toISOString), então a comparação de texto segue a ordem do tempo. */
export function pruneCutoff(now: number, maxAgeDays: number): string {
  return new Date(now - maxAgeDays * 86_400_000).toISOString();
}

/**
 * Apaga o que passou de `maxAgeDays` e o que ficou além das `maxRows` mais recentes.
 * Parâmetros: cutoff ISO, maxRows, keepUnsynced (0/1).
 */
export const PRUNE_OPERATIONS_SQL = `
  DELETE FROM operations
  WHERE (? = 0 OR synced = 1)
    AND (
      created_at < ?
      OR id NOT IN (SELECT id FROM operations ORDER BY created_at DESC, id DESC LIMIT ?)
    )`;

export function pruneParams(options: PruneOptions = {}): [number, string, number] {
  const now = options.now ?? Date.now();
  return [options.keepUnsynced ? 1 : 0, pruneCutoff(now, options.maxAgeDays ?? HISTORY_MAX_AGE_DAYS), options.maxRows ?? HISTORY_MAX_ROWS];
}

/** Mesma regra do SQL, para o histórico do web (IndexedDB). Devolve as linhas que ficam. */
export function pruneRows<T extends { id: string; created_at: string; synced?: number | null }>(rows: T[], options: PruneOptions = {}): T[] {
  const [keepUnsynced, cutoff, maxRows] = pruneParams(options);
  const newest = new Set(
    [...rows]
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
      .slice(0, maxRows)
      .map((row) => row.id),
  );
  return rows.filter((row) => {
    if (keepUnsynced === 1 && row.synced !== 1) {
      return true;
    }
    return row.created_at >= cutoff && newest.has(row.id);
  });
}
