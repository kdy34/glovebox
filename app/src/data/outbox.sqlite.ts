// SQLite-backed OutboxStore for runtime use. Requires expo-sqlite.
// Tests use an in-memory store instead.
import * as SQLite from 'expo-sqlite';
import type { OutboxEntry, OutboxStatus, OutboxStore } from './outbox';

const DB_NAME = 'glovebox_outbox.db';
const SCHEMA_VERSION = 3;

let _db: SQLite.SQLiteDatabase | null = null;

function db(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync(DB_NAME);
    migrate(_db);
  }
  return _db;
}

const CREATE_CURRENT = `
  CREATE TABLE outbox (
    id TEXT PRIMARY KEY,
    "table" TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('upsert','update','delete','rpc')),
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','synced','dead')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    rev INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX outbox_status_created ON outbox(status, created_at);
`;

// Copies rows from the renamed old table into the current schema.
// v1 had no backoff columns and a 'failed' status that was never retried — revive those rows.
const COPY_FROM_V1 = `
  INSERT INTO outbox (id, "table", operation, payload, created_at, status, attempts, next_attempt_at, last_error, rev)
  SELECT id, "table", operation, payload, created_at,
         CASE WHEN status = 'synced' THEN 'synced' ELSE 'pending' END,
         0, 0, NULL, 1
    FROM outbox_old;
`;
// v2 only lacks 'update' in the operation CHECK (T099); rows copy as they are.
const COPY_FROM_V2 = `
  INSERT INTO outbox (id, "table", operation, payload, created_at, status, attempts, next_attempt_at, last_error, rev)
  SELECT id, "table", operation, payload, created_at, status, attempts, next_attempt_at, last_error, rev
    FROM outbox_old;
`;

function migrate(d: SQLite.SQLiteDatabase): void {
  const row = d.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  d.withTransactionSync(() => {
    const hasTable = d.getFirstSync<{ n: number }>(
      `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'outbox'`,
    )?.n;
    if (hasTable) {
      // SQLite can't alter a CHECK constraint, so rebuild the table.
      d.execSync(`ALTER TABLE outbox RENAME TO outbox_old; DROP INDEX IF EXISTS outbox_status_created;`);
      d.execSync(CREATE_CURRENT);
      d.execSync(version >= 2 ? COPY_FROM_V2 : COPY_FROM_V1);
      d.execSync(`DROP TABLE outbox_old;`);
    } else {
      d.execSync(CREATE_CURRENT);
    }
    d.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

/** Opens and migrates the outbox database. Safe to call more than once. */
export function initOutboxDb(): void {
  db();
}

interface Row {
  id: string;
  table: string;
  operation: string;
  payload: string;
  created_at: number;
  status: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  rev: number;
}

function toEntry(r: Row): OutboxEntry {
  return {
    id: r.id,
    table: r.table,
    operation: r.operation as OutboxEntry['operation'],
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    created_at: r.created_at,
    status: r.status as OutboxStatus,
    attempts: r.attempts,
    next_attempt_at: r.next_attempt_at,
    last_error: r.last_error,
    rev: r.rev,
  };
}

export const sqliteOutboxStore: OutboxStore = {
  async get(id) {
    const r = db().getFirstSync<Row>(`SELECT * FROM outbox WHERE id = ?`, id);
    return r ? toEntry(r) : null;
  },

  async put(e) {
    db().runSync(
      `INSERT OR REPLACE INTO outbox
         (id, "table", operation, payload, created_at, status, attempts, next_attempt_at, last_error, rev)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      e.id,
      e.table,
      e.operation,
      JSON.stringify(e.payload),
      e.created_at,
      e.status,
      e.attempts,
      e.next_attempt_at,
      e.last_error,
      e.rev,
    );
  },

  async remove(id) {
    db().runSync(`DELETE FROM outbox WHERE id = ?`, id);
  },

  async list(status) {
    return db().getAllSync<Row>(`SELECT * FROM outbox WHERE status = ? ORDER BY created_at ASC`, status).map(toEntry);
  },
};
