// Offline outbox: local queue for writes that need to sync to Supabase.
// Writes are stored with client-generated UUIDs; Supabase upserts are idempotent.
// The SQLite-backed store (used at runtime) is in outbox.sqlite.ts.
// The in-memory store is used for tests.

export type OutboxOperation = 'upsert' | 'delete';

export interface OutboxEntry {
  id: string;             // client UUID, matches the row's pk in Supabase
  table: string;          // Supabase table name
  operation: OutboxOperation;
  payload: Record<string, unknown>;
  created_at: number;     // ms epoch — determines flush order
  status: 'pending' | 'synced' | 'failed';
  attempts: number;
}

/** Minimal storage interface — implemented by SQLite at runtime, in-memory in tests. */
export interface OutboxStore {
  /** Returns all pending entries sorted by created_at ascending. */
  getPending(): Promise<OutboxEntry[]>;
  /** Adds or overwrites an entry (idempotent by id). */
  add(entry: OutboxEntry): Promise<void>;
  markSynced(id: string): Promise<void>;
  markFailed(id: string): Promise<void>;
}

export interface FlushResult {
  succeeded: string[];
  failed: string[];
}

export type Executor = (entries: OutboxEntry[]) => Promise<FlushResult>;

export interface Outbox {
  enqueue(entry: OutboxEntry): Promise<void>;
  flush(executor: Executor): Promise<void>;
  getPendingCount(): Promise<number>;
}

/** Creates an Outbox backed by the given store. Pure business logic — no Expo/RN imports. */
export function createOutbox(store: OutboxStore): Outbox {
  return {
    async enqueue(entry) {
      await store.add(entry);
    },

    async flush(executor) {
      const pending = await store.getPending();
      if (pending.length === 0) return;

      const result = await executor(pending);

      await Promise.all([
        ...result.succeeded.map((id) => store.markSynced(id)),
        ...result.failed.map((id) => store.markFailed(id)),
      ]);
    },

    async getPendingCount() {
      const pending = await store.getPending();
      return pending.length;
    },
  };
}
