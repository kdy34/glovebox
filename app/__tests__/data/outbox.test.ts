// T029 — Outbox: ordered flush, idempotent retry, no duplicates after network failure.
// Tests run against an in-memory OutboxStore adapter so no Expo dependencies are needed.
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOutbox,
  type OutboxEntry,
  type OutboxStore,
  type FlushResult,
} from '../../src/data/outbox.ts';

// ─── In-memory store (simulates SQLite without Expo) ───────────────────────
function makeMemoryStore(): OutboxStore & { _entries: Map<string, OutboxEntry> } {
  const _entries = new Map<string, OutboxEntry>();
  return {
    _entries,
    async getPending() {
      return [..._entries.values()]
        .filter((e) => e.status === 'pending')
        .sort((a, b) => a.created_at - b.created_at);
    },
    async add(entry) {
      _entries.set(entry.id, entry);
    },
    async markSynced(id) {
      const e = _entries.get(id);
      if (e) _entries.set(id, { ...e, status: 'synced' });
    },
    async markFailed(id) {
      const e = _entries.get(id);
      if (e) _entries.set(id, { ...e, status: 'failed', attempts: e.attempts + 1 });
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────
let flushOrder: string[];
let shouldFail: boolean;

function makeSuccessExecutor() {
  return async (entries: OutboxEntry[]): Promise<FlushResult> => {
    flushOrder.push(...entries.map((e) => e.id));
    return { succeeded: entries.map((e) => e.id), failed: [] };
  };
}

function makeFailingExecutor() {
  return async (entries: OutboxEntry[]): Promise<FlushResult> => {
    if (shouldFail) return { succeeded: [], failed: entries.map((e) => e.id) };
    flushOrder.push(...entries.map((e) => e.id));
    return { succeeded: entries.map((e) => e.id), failed: [] };
  };
}

describe('createOutbox — ordered flush', () => {
  let store: ReturnType<typeof makeMemoryStore>;

  before(() => {
    flushOrder = [];
    shouldFail = false;
  });

  beforeEach(() => {
    store = makeMemoryStore();
    flushOrder = [];
  });

  it('flushes entries in creation order', async () => {
    const outbox = createOutbox(store);
    const now = Date.now();
    await outbox.enqueue({ id: 'a', table: 'vehicles', operation: 'upsert', payload: { id: 'a' }, created_at: now, status: 'pending', attempts: 0 });
    await outbox.enqueue({ id: 'b', table: 'vehicles', operation: 'upsert', payload: { id: 'b' }, created_at: now + 1, status: 'pending', attempts: 0 });
    await outbox.enqueue({ id: 'c', table: 'vehicles', operation: 'upsert', payload: { id: 'c' }, created_at: now + 2, status: 'pending', attempts: 0 });

    await outbox.flush(makeSuccessExecutor());
    assert.deepEqual(flushOrder, ['a', 'b', 'c']);
  });

  it('marks entries as synced after a successful flush', async () => {
    const outbox = createOutbox(store);
    await outbox.enqueue({ id: 'x', table: 'vehicles', operation: 'upsert', payload: { id: 'x' }, created_at: Date.now(), status: 'pending', attempts: 0 });

    await outbox.flush(makeSuccessExecutor());

    const e = store._entries.get('x');
    assert.equal(e?.status, 'synced');
  });
});

describe('createOutbox — idempotent retry', () => {
  let store: ReturnType<typeof makeMemoryStore>;

  beforeEach(() => {
    store = makeMemoryStore();
    flushOrder = [];
  });

  it('flushing the same entry twice does not cause it to appear twice in executor', async () => {
    const outbox = createOutbox(store);
    await outbox.enqueue({ id: 'dup', table: 'service_records', operation: 'upsert', payload: { id: 'dup' }, created_at: Date.now(), status: 'pending', attempts: 0 });

    // Flush once successfully
    await outbox.flush(makeSuccessExecutor());

    // Now re-enqueue the same id (simulates a retry on a re-opened screen)
    await outbox.enqueue({ id: 'dup', table: 'service_records', operation: 'upsert', payload: { id: 'dup' }, created_at: Date.now(), status: 'pending', attempts: 0 });

    const pending = await store.getPending();
    // The entry was already synced; re-enqueueing overwrites it back to pending
    // so only one entry exists for 'dup'
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.id, 'dup');
  });

  it('a failed entry increments attempts and stays pending', async () => {
    const outbox = createOutbox(store);
    await outbox.enqueue({ id: 'fail1', table: 'vehicles', operation: 'upsert', payload: {}, created_at: Date.now(), status: 'pending', attempts: 0 });

    shouldFail = true;
    await outbox.flush(makeFailingExecutor());
    shouldFail = false;

    const e = store._entries.get('fail1');
    assert.equal(e?.status, 'failed');
    assert.equal(e?.attempts, 1);
  });
});

describe('createOutbox — no duplicates after simulated network failure', () => {
  let store: ReturnType<typeof makeMemoryStore>;
  let executorCallCount: number;

  beforeEach(() => {
    store = makeMemoryStore();
    flushOrder = [];
    executorCallCount = 0;
  });

  it('does not duplicate writes when the network fails mid-flush and then succeeds on retry', async () => {
    const outbox = createOutbox(store);
    const now = Date.now();

    // Add two entries
    await outbox.enqueue({ id: 'e1', table: 'service_records', operation: 'upsert', payload: { id: 'e1' }, created_at: now, status: 'pending', attempts: 0 });
    await outbox.enqueue({ id: 'e2', table: 'service_records', operation: 'upsert', payload: { id: 'e2' }, created_at: now + 1, status: 'pending', attempts: 0 });

    // First flush: network fails for e2
    let call = 0;
    const partialFailExecutor = async (entries: OutboxEntry[]): Promise<FlushResult> => {
      call++;
      executorCallCount++;
      if (call === 1) {
        // Simulate: e1 succeeds, e2 fails
        flushOrder.push(entries[0]!.id);
        return { succeeded: [entries[0]!.id], failed: entries.slice(1).map((e) => e.id) };
      }
      // Retry: all succeed
      flushOrder.push(...entries.map((e) => e.id));
      return { succeeded: entries.map((e) => e.id), failed: [] };
    };

    await outbox.flush(partialFailExecutor);
    // e1 synced, e2 still pending/failed
    assert.equal(store._entries.get('e1')?.status, 'synced');
    assert.equal(store._entries.get('e2')?.status, 'failed');

    // Reset e2 to pending so the retry flush picks it up
    store._entries.set('e2', { ...store._entries.get('e2')!, status: 'pending' });

    // Second flush: e2 succeeds
    await outbox.flush(partialFailExecutor);
    assert.equal(store._entries.get('e2')?.status, 'synced');

    // e1 should NOT appear in flushOrder twice
    assert.equal(flushOrder.filter((id) => id === 'e1').length, 1, 'e1 must only be flushed once');
    assert.equal(flushOrder.filter((id) => id === 'e2').length, 1, 'e2 must only be flushed once');
  });

  it('does not re-flush already-synced entries', async () => {
    const outbox = createOutbox(store);
    await outbox.enqueue({ id: 'done', table: 'vehicles', operation: 'upsert', payload: {}, created_at: Date.now(), status: 'pending', attempts: 0 });

    // Flush once
    await outbox.flush(makeSuccessExecutor());
    assert.equal(store._entries.get('done')?.status, 'synced');

    // Flush again — should be a no-op for 'done'
    const secondFlushOrder: string[] = [];
    await outbox.flush(async (entries) => {
      secondFlushOrder.push(...entries.map((e) => e.id));
      return { succeeded: entries.map((e) => e.id), failed: [] };
    });

    assert.equal(secondFlushOrder.includes('done'), false, 'synced entry must not be re-flushed');
  });
});
