import { HISTORY_MAX_AGE_DAYS, HISTORY_MAX_ROWS, PRUNE_OPERATIONS_SQL, pruneCutoff, pruneParams, pruneRows } from '@/core/offline/retention';
import { MIGRATIONS } from '@/core/offline/migrations';

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const DAY = 86_400_000;

type Row = { id: string; created_at: string; synced: number };

function row(id: string, ageMs: number, synced = 0): Row {
  return { id, created_at: new Date(NOW - ageMs).toISOString(), synced };
}

/** Executa o SQL real num SQLite em memória (node:sqlite). */
function runSql(rows: Row[], keepUnsynced: boolean, maxRows = HISTORY_MAX_ROWS): string[] {
  type Statement = { run: (...params: unknown[]) => unknown; all: () => unknown[] };
  type Sqlite = { exec: (sql: string) => void; prepare: (sql: string) => Statement; close: () => void };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => Sqlite };
  const db = new DatabaseSync(':memory:');
  for (const statement of MIGRATIONS.find((migration) => migration.version === 1)!.statements.filter((sql) => !sql.startsWith('PRAGMA'))) {
    db.exec(statement);
  }
  const insert = db.prepare("INSERT INTO operations (id, operation, status, created_at, synced) VALUES (?, 'READ', 'SUCCESS', ?, ?)");
  rows.forEach((item) => insert.run(item.id, item.created_at, item.synced));
  db.prepare(PRUNE_OPERATIONS_SQL).run(...pruneParams({ now: NOW, keepUnsynced, maxRows }));
  const left = db.prepare('SELECT id FROM operations ORDER BY id').all() as { id: string }[];
  db.close();
  return left.map((item) => item.id);
}

describe('limpeza do histórico local', () => {
  it('usa 30 dias e 500 linhas; created_at é ISO e compara como texto', () => {
    expect(HISTORY_MAX_AGE_DAYS).toBe(30);
    expect(HISTORY_MAX_ROWS).toBe(500);
    expect(pruneCutoff(NOW, 30)).toBe('2026-09-13T12:00:00.000Z');
    expect(row('a', 31 * DAY).created_at < pruneCutoff(NOW, 30)).toBe(true);
    expect(row('b', 29 * DAY).created_at < pruneCutoff(NOW, 30)).toBe(false);
  });

  it('SQLite: apaga > 30 dias, mantém as mais recentes e respeita o limite de linhas', () => {
    const rows = [row('old', 31 * DAY), row('edge', 30 * DAY - 1000), row('new1', DAY), row('new2', 2 * DAY), row('new3', 3 * DAY)];
    expect(runSql(rows, false)).toEqual(['edge', 'new1', 'new2', 'new3']);
    expect(runSql(rows, false, 2)).toEqual(['new1', 'new2']);
  });

  it('SQLite: com envio ao Supabase ligado não apaga o que ainda não foi sincronizado', () => {
    const rows = [row('old-synced', 40 * DAY, 1), row('old-pending', 40 * DAY, 0), row('new', DAY, 1)];
    expect(runSql(rows, true)).toEqual(['new', 'old-pending']);
    expect(runSql(rows, false)).toEqual(['new']);
  });

  it('SQLite: 600 operações recentes viram 500', () => {
    const rows = Array.from({ length: 600 }, (_, index) => row(`op${String(index).padStart(3, '0')}`, index * 60_000));
    const left = runSql(rows, false);
    expect(left).toHaveLength(500);
    expect(left).toContain('op000');
    expect(left).not.toContain('op599');
  });

  it('web (IndexedDB) segue a mesma regra do SQL', () => {
    const rows = [row('old', 31 * DAY), row('edge', 30 * DAY - 1000), row('new1', DAY), row('new2', 2 * DAY), row('pending', 50 * DAY, 0)];
    expect(pruneRows(rows, { now: NOW }).map((item) => item.id)).toEqual(['edge', 'new1', 'new2']);
    expect(pruneRows(rows, { now: NOW, keepUnsynced: true }).map((item) => item.id).sort()).toEqual(['edge', 'new1', 'new2', 'old', 'pending']);
    expect(pruneRows(rows, { now: NOW, maxRows: 1 }).map((item) => item.id)).toEqual(['new1']);
  });

  it('índices de created_at DESC e content_type existem na migração versionada', () => {
    const all = MIGRATIONS.flatMap((migration) => migration.statements).join('\n');
    expect(all).toContain('idx_operations_created_at ON operations(created_at DESC)');
    expect(all).toContain('idx_operations_content_type ON operations(content_type)');
  });
});
