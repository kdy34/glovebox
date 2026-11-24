// Sync service: flushes the outbox on reconnect and app foreground.
// Keeps a single flush running at a time (no concurrent flushes).
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { createOutbox, type Executor, type OutboxEntry, type FlushResult } from './outbox';
import { sqliteOutboxStore, initOutboxDb } from './outbox.sqlite';

const outbox = createOutbox(sqliteOutboxStore);

let flushing = false;
let initialized = false;

/** Build an Executor that sends entries to Supabase via upsert / delete. */
function buildSupabaseExecutor(): Executor {
  return async (entries: OutboxEntry[]): Promise<FlushResult> => {
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const entry of entries) {
      try {
        const table = (supabase as any).from(entry.table) as {
          upsert: (data: unknown, opts: object) => Promise<{ error: { message: string } | null }>;
          delete: () => { eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }> };
        };
        if (entry.operation === 'upsert') {
          const { error } = await table.upsert(entry.payload, { onConflict: 'id' });
          if (error) throw new Error(error.message);
        } else {
          const { error } = await table.delete().eq('id', (entry.payload as { id: string }).id);
          if (error) throw new Error(error.message);
        }
        succeeded.push(entry.id);
      } catch {
        failed.push(entry.id);
      }
    }

    return { succeeded, failed };
  };
}

async function tryFlush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const { isConnected } = await NetInfo.fetch();
    if (!isConnected) return;
    await outbox.flush(buildSupabaseExecutor());
  } finally {
    flushing = false;
  }
}

/** Call once at app startup (after auth is ready). */
export function initSync(): void {
  if (initialized) return;
  initialized = true;

  initOutboxDb();

  // Flush on network reconnect
  NetInfo.addEventListener((state) => {
    if (state.isConnected) void tryFlush();
  });

  // Flush when app comes to foreground
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void tryFlush();
  });

  // Initial flush
  void tryFlush();
}

/** Enqueue a write to the outbox. Call instead of writing to Supabase directly. */
export async function enqueueWrite(
  table: string,
  operation: 'upsert' | 'delete',
  payload: Record<string, unknown>,
  id: string,
): Promise<void> {
  await outbox.enqueue({
    id,
    table,
    operation,
    payload,
    created_at: Date.now(),
    status: 'pending',
    attempts: 0,
  });
  void tryFlush();
}

export { outbox };
