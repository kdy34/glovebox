// SQLite-backed OutboxStore for runtime use. Requires expo-sqlite.
// Tests use the in-memory store from outbox.ts instead.
import * as SQLite from 'expo-sqlite';
import type { OutboxEntry, OutboxStore } from './outbox';

const DB_NAME = 'glovebox_outbox.db';

let _db: SQLite.SQLiteDatabase | null = null;

function db(): SQLite.SQLiteDatabase {
  if (!_db) _db = SQLite.openDatabaseSync(DB_NAME);
  return _db;
}

export function initOutboxDb(): void {
  db().execSync(`
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      "table" TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','synced','failed')),
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS outbox_status_created ON outbox(status, created_at);
  `);
}

export const sqliteOutboxStore: OutboxStore = {
  async getPending(): Promise<OutboxEntry[]> {
    const rows = db().getAllSync<{
      id: string; table: string; operation: string; payload: string;
      created_at: number; status: string; attempts: number;
    }>(
      `SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC`,
    );
    return rows.map((r) => ({
      id: r.id,
      table: r.table,
      operation: r.operation as OutboxEntry['operation'],
      payload: JSON.parse(r.payload) as Record<string, unknown>,
      created_at: r.created_at,
      status: r.status as OutboxEntry['status'],
      attempts: r.attempts,
    }));
  },

  async add(entry: OutboxEntry): Promise<void> {
    db().runSync(
      `INSERT OR REPLACE INTO outbox (id, "table", operation, payload, created_at, status, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      entry.id, entry.table, entry.operation,
      JSON.stringify(entry.payload), entry.created_at, entry.status, entry.attempts,
    );
  },

  async markSynced(id: string): Promise<void> {
    db().runSync(`UPDATE outbox SET status = 'synced' WHERE id = ?`, id);
  },

  async markFailed(id: string): Promise<void> {
    db().runSync(
      `UPDATE outbox SET status = 'failed', attempts = attempts + 1 WHERE id = ?`,
      id,
    );
  },
};
