// Sync service: flushes the outbox on reconnect, app foreground, enqueue, and when the
// head entry's backoff elapses (T098). Keeps a single flush running at a time.
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { createOutbox, createSupabaseExecutor, type NewOutboxEntry, type SupabaseLike } from './outbox';
import { sqliteOutboxStore, initOutboxDb } from './outbox.sqlite';
import { captureError } from '@/services/sentry';

const outbox = createOutbox(sqliteOutboxStore);
const execute = createSupabaseExecutor(supabase as unknown as SupabaseLike);

let flushing = false;
let flushAgain = false;
let initialized = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export async function isOffline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  return s.isConnected === false || s.isInternetReachable === false;
}

function scheduleRetry(at: number | null): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (at === null) return;
  retryTimer = setTimeout(
    () => {
      retryTimer = null;
      void tryFlush();
    },
    Math.max(0, at - Date.now()),
  );
}

export async function tryFlush(): Promise<void> {
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  try {
    do {
      flushAgain = false;
      if (await isOffline()) return; // the NetInfo listener flushes on reconnect
      const result = await outbox.flush(execute);
      scheduleRetry(result.nextAttemptAt);
    } while (flushAgain);
  } catch (err) {
    // Local store error (send failures are handled inside flush). The next trigger retries.
    captureError(err);
  } finally {
    flushing = false;
  }
}

/**
 * Tell the outbox who is signed in (T100). Call on every auth change. Signed out, nothing
 * is sent (a flush would run as anon) and the retry timer stops; entries stay on the phone
 * for their owner.
 */
export function setSyncUser(userId: string | null): void {
  outbox.setUser(userId);
  if (userId) void tryFlush();
  else scheduleRetry(null);
}

/** Remove every queued change of a deleted account from this phone. */
export async function purgeUserOutbox(userId: string): Promise<void> {
  await outbox.purgeUser(userId);
}

/** Call once at app startup (after auth is ready). */
export function initSync(): void {
  if (initialized) return;
  initialized = true;

  initOutboxDb();

  NetInfo.addEventListener((state) => {
    if (state.isConnected) void tryFlush();
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void tryFlush();
  });

  void tryFlush();
}

/** Queue an entry and try to send it right away. */
export async function enqueue(entry: NewOutboxEntry): Promise<void> {
  await outbox.enqueue(entry);
  void tryFlush();
}

/** Enqueue a table write. Call instead of writing to Supabase directly. */
export async function enqueueWrite(
  table: string,
  operation: 'upsert' | 'update' | 'delete',
  payload: Record<string, unknown>,
  id: string,
): Promise<void> {
  await enqueue({ id, table, operation, payload });
}

/** Put a dead entry back in the queue and flush. */
export async function retryDead(id: string): Promise<void> {
  await outbox.retry(id);
  void tryFlush();
}

export { outbox };
