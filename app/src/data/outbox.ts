// Offline outbox: local queue for writes that need to sync to Supabase (FR-010).
// Writes carry client-generated UUIDs; upserts and save_record are idempotent, so a
// retry after a lost response never duplicates data.
// Pure TypeScript: the SQLite store lives in outbox.sqlite.ts, tests use an in-memory store.
//
// Flush rules (T098):
//   - entries go out strictly in created_at order; the flush stops at the first failure
//   - a failed entry stays pending: attempts++, next_attempt_at = now + base·2^(attempts-1)
//   - after maxAttempts failures it becomes 'dead' — kept for the user to review, never dropped
//   - dead entries no longer block the queue
//   - entries belong to the signed-in user (T100): nothing is sent while signed out, and
//     another user's entries are never sent, counted or merged into
//   - a server rejection (non-transient SQLSTATE, e.g. 23502) goes dead at once (T099)
//
// Partial changes use 'update' (T099): PostgREST upsert is INSERT ... ON CONFLICT, and
// Postgres checks NOT NULL on the proposed row first, so a partial upsert always fails.
// Enqueueing onto a pending upsert/update for the same id merges the fields.

export type OutboxOperation = 'upsert' | 'update' | 'delete' | 'rpc';
export type OutboxStatus = 'pending' | 'synced' | 'dead';

/** Payload of an 'rpc' entry. */
export interface RpcPayload {
  fn: string;
  args: Record<string, unknown>;
}

export interface OutboxEntry {
  id: string; // client UUID, matches the row's pk in Supabase (record id for save_record)
  table: string; // Supabase table name ('rpc' entries: the table the RPC writes)
  operation: OutboxOperation;
  payload: Record<string, unknown>; // 'update': only the changed columns (no id)
  created_at: number; // ms epoch — determines flush order; kept when a pending entry is re-enqueued
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: number; // ms epoch; 0 = due now
  last_error: string | null;
  user_id: string | null; // owner; null only for rows written before T100
  rev: number; // bumped on every enqueue; guards against marking an unsent edit as synced
}

export type NewOutboxEntry = Pick<OutboxEntry, 'id' | 'table' | 'operation' | 'payload'>;

/** Minimal storage interface — implemented by SQLite at runtime, in-memory in tests. */
export interface OutboxStore {
  get(id: string): Promise<OutboxEntry | null>;
  /** Insert or overwrite by id. */
  put(entry: OutboxEntry): Promise<void>;
  remove(id: string): Promise<void>;
  /** Entries with the given status, sorted by created_at ascending. */
  list(status: OutboxStatus, userId?: string): Promise<OutboxEntry[]>;
  removeUser(userId: string): Promise<void>;
  claimUnowned(userId: string): Promise<void>;
}

/** Sends one entry. Must throw on failure. */
export type EntryExecutor = (entry: OutboxEntry) => Promise<void>;

export interface FlushResult {
  synced: string[];
  /** The entry that stopped the flush, if any. */
  failed: { id: string; error: string; dead: boolean } | null;
  /** When the head of the queue is next due (ms epoch), or null if nothing is pending. */
  nextAttemptAt: number | null;
}

export interface OutboxOptions {
  now?: () => number;
  userId?: string | null;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface Outbox {
  enqueue(entry: NewOutboxEntry): Promise<void>;
  flush(execute: EntryExecutor): Promise<FlushResult>;
  getPendingCount(): Promise<number>;
  getDead(): Promise<OutboxEntry[]>;
  /** Move a dead entry back to the queue (keeps its original position). */
  retry(id: string): Promise<void>;
  /** Permanently discard a dead entry. User-initiated only. */
  discard(id: string): Promise<void>;
  /** Who is signed in. Only their entries are enqueued, counted and sent (T100). */
  setUser(userId: string | null): void;
  /** Remove every entry (any status) of a user — after account deletion. */
  purgeUser(userId: string): Promise<void>;
  /** Called after every change to the queue. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_BASE_DELAY_MS = 2_000;
export const DEFAULT_MAX_DELAY_MS = 5 * 60_000;

const SQLSTATE = /^[0-9A-Z]{5}$/;
// SQLSTATE classes that mean "try again later", not "the server rejected this":
// 08 connection, 40 serialization/deadlock, 53 insufficient resources, 57 operator
// intervention (statement timeout, shutdown), 58 system error.
const TRANSIENT_SQLSTATE_CLASSES = new Set(['08', '40', '53', '57', '58']);

export function isSqlState(code: unknown): code is string {
  return typeof code === 'string' && SQLSTATE.test(code);
}

/** True when the error carries a SQLSTATE that retrying cannot fix. */
export function isServerRejection(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return isSqlState(code) && !TRANSIENT_SQLSTATE_CLASSES.has(code.slice(0, 2));
}

/** Error thrown by the Supabase executor; keeps the Postgres/PostgREST code. */
export class OutboxSendError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(code ? `${code}: ${message}` : message);
    this.name = 'OutboxSendError';
    this.code = code;
  }
}

const mergeable = (op: OutboxOperation) => op === 'upsert' || op === 'update';

/** What to store when `input` is enqueued while `existing` is still pending for the same id. */
function combine(existing: OutboxEntry | null, input: NewOutboxEntry): NewOutboxEntry {
  if (!existing || existing.status !== 'pending') return input;
  // A pending delete wins over a later partial change; nothing to update.
  if (existing.operation === 'delete' && input.operation === 'update') return existing;
  if (existing.table === input.table && mergeable(existing.operation) && mergeable(input.operation)) {
    const operation = existing.operation === 'upsert' || input.operation === 'upsert' ? 'upsert' : 'update';
    const payload = { ...existing.payload, ...input.payload };
    if (operation === 'update') delete payload.id; // the upsert side already carries its id
    return { ...input, operation, payload };
  }
  return input;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

/** Creates an Outbox backed by the given store. Pure business logic — no Expo/RN imports. */
export function createOutbox(store: OutboxStore, opts: OutboxOptions = {}): Outbox {
  const now = opts.now ?? Date.now;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelay = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  let userId: string | null = opts.userId ?? null;
  // Rows written before T100 have no owner; the first signed-in user claims them.
  let claimed: Promise<void> = userId ? store.claimUnowned(userId) : Promise.resolve();
  const listeners = new Set<() => void>();
  const ready = async () => {
    await claimed;
    return userId;
  };
  const own = (e: OutboxEntry | null, uid: string | null): e is OutboxEntry => !!e && !!uid && e.user_id === uid;
  const notify = () => listeners.forEach((l) => l());

  const backoff = (attempts: number) => Math.min(baseDelay * 2 ** (attempts - 1), maxDelay);

  return {
    async enqueue(input) {
      const uid = await ready();
      if (!uid) throw new Error('Outbox: nobody is signed in');
      const found = await store.get(input.id);
      const existing = own(found, uid) ? found : null;
      const keepPosition = existing?.status === 'pending';
      const next = combine(existing, input);
      await store.put({
        id: next.id,
        table: next.table,
        operation: next.operation,
        payload: next.payload,
        created_at: keepPosition ? existing.created_at : now(),
        status: 'pending',
        attempts: 0,
        next_attempt_at: 0,
        last_error: null,
        user_id: uid,
        rev: (found?.rev ?? 0) + 1,
      });
      notify();
    },

    async flush(execute) {
      const result: FlushResult = { synced: [], failed: null, nextAttemptAt: null };
      const uid = await ready();
      if (!uid) return result;
      try {
        const pending = await store.list('pending', uid);
        for (const entry of pending) {
          if (entry.next_attempt_at > now()) {
            result.nextAttemptAt = entry.next_attempt_at;
            break;
          }
          try {
            await execute(entry);
          } catch (err) {
            const attempts = entry.attempts + 1;
            const dead = attempts >= maxAttempts || isServerRejection(err);
            const error = errorMessage(err);
            const current = await store.get(entry.id);
            // If the user edited the entry while it was in flight, the new version starts fresh.
            if (current && current.rev === entry.rev) {
              await store.put({
                ...current,
                attempts,
                last_error: error,
                status: dead ? 'dead' : 'pending',
                next_attempt_at: dead ? 0 : now() + backoff(attempts),
              });
            }
            result.failed = { id: entry.id, error, dead };
            if (!dead) result.nextAttemptAt = now() + backoff(attempts);
            break;
          }
          const current = await store.get(entry.id);
          if (current && current.rev === entry.rev) {
            await store.put({ ...current, status: 'synced', last_error: null });
            result.synced.push(entry.id);
          }
        }
        // A dead head or an edit-in-flight leaves more work behind it.
        if (result.nextAttemptAt === null && (result.failed?.dead || result.synced.length < pending.length)) {
          const rest = await store.list('pending', uid);
          if (rest.length > 0) result.nextAttemptAt = Math.max(now(), rest[0]!.next_attempt_at);
        }
        return result;
      } finally {
        notify();
      }
    },

    async getPendingCount() {
      const uid = await ready();
      return uid ? (await store.list('pending', uid)).length : 0;
    },

    async getDead() {
      const uid = await ready();
      return uid ? store.list('dead', uid) : [];
    },

    async retry(id) {
      const uid = await ready();
      const e = await store.get(id);
      if (!own(e, uid) || e.status !== 'dead') return;
      await store.put({ ...e, status: 'pending', attempts: 0, next_attempt_at: 0 });
      notify();
    },

    async discard(id) {
      const uid = await ready();
      const e = await store.get(id);
      if (!own(e, uid) || e.status !== 'dead') return;
      await store.remove(id);
      notify();
    },

    setUser(next) {
      if (next === userId) return;
      userId = next;
      claimed = next ? claimed.then(() => store.claimUnowned(next)) : claimed;
      notify();
    },

    async purgeUser(target) {
      await claimed;
      await store.removeUser(target);
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ─── Supabase executor ─────────────────────────────────────────────────────

interface SupabaseErrorLike {
  message: string;
  code?: string;
}

/** The slice of the Supabase client the executor needs (keeps this module RN-free). */
export interface SupabaseLike {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: SupabaseErrorLike | null; status?: number }>;
  from(table: string): {
    upsert(
      row: Record<string, unknown>,
      opts?: { onConflict?: string },
    ): PromiseLike<{ error: SupabaseErrorLike | null }>;
    update(fields: Record<string, unknown>): {
      eq(col: string, val: unknown): PromiseLike<{ error: SupabaseErrorLike | null }>;
    };
    delete(): { eq(col: string, val: unknown): PromiseLike<{ error: SupabaseErrorLike | null }> };
  };
}

function check(error: SupabaseErrorLike | null): void {
  if (error) throw new OutboxSendError(error.message, error.code ?? '');
}

/** Builds an executor that sends one entry to Supabase via rpc / upsert / update / delete. */
export function createSupabaseExecutor(client: SupabaseLike): EntryExecutor {
  return async (entry) => {
    switch (entry.operation) {
      case 'rpc': {
        const { fn, args } = entry.payload as unknown as RpcPayload;
        const { error } = await client.rpc(fn, args);
        check(error);
        return;
      }
      case 'upsert': {
        const { error } = await client.from(entry.table).upsert(entry.payload, { onConflict: 'id' });
        check(error);
        return;
      }
      case 'update': {
        const { id: _id, ...fields } = entry.payload;
        const { error } = await client.from(entry.table).update(fields).eq('id', entry.id);
        check(error);
        return;
      }
      case 'delete': {
        const { error } = await client
          .from(entry.table)
          .delete()
          .eq('id', (entry.payload as { id: string }).id);
        check(error);
        return;
      }
    }
  };
}
