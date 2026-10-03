export interface MigrationDb {
  getUserVersion(): Promise<number>;
  setUserVersion(version: number): Promise<void>;
  exec(sql: string): Promise<void>;
}

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init',
    statements: [
      'PRAGMA journal_mode=WAL',
      'PRAGMA foreign_keys=ON',
      `CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        uid_hash TEXT,
        type TEXT NOT NULL,
        capacity INTEGER,
        technologies TEXT,
        is_writable INTEGER DEFAULT 1,
        is_locked INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        tag_id TEXT,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        content_type TEXT,
        payload TEXT,
        error_message TEXT,
        integrity_percent INTEGER,
        duration_ms INTEGER,
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY(tag_id) REFERENCES tags(id)
      )`,
      `CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        configuration TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        use_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_operations_synced ON operations(synced)',
      'CREATE INDEX IF NOT EXISTS idx_operations_content_type ON operations(content_type)',
    ],
  },
  {
    version: 2,
    name: 'template sync columns',
    statements: [
      'ALTER TABLE templates ADD COLUMN synced INTEGER DEFAULT 0',
      'ALTER TABLE templates ADD COLUMN deleted_at TEXT',
    ],
  },
  {
    version: 3,
    name: 'denormalized operation columns',
    statements: [
      'ALTER TABLE operations ADD COLUMN display_title TEXT',
      'ALTER TABLE operations ADD COLUMN display_value TEXT',
      'ALTER TABLE operations ADD COLUMN tag_type TEXT',
      'ALTER TABLE operations ADD COLUMN tag_capacity INTEGER',
      'ALTER TABLE operations ADD COLUMN tag_uid_hash TEXT',
    ],
  },
];

export async function runMigrations(db: MigrationDb): Promise<number> {
  const current = await db.getUserVersion();
  const pending = MIGRATIONS.filter((migration) => migration.version > current).sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    for (const statement of migration.statements) {
      await db.exec(statement);
    }
    await db.setUserVersion(migration.version);
  }
  return pending.length === 0 ? current : pending[pending.length - 1].version;
}
