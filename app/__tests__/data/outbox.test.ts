// Outbox tests.
// T029 — ordered flush, idempotent retry, no duplicates after network failure.
// T096 — record saves queue as a single save_record RPC entry.
// T097 — only network failures are queued; validation/DB errors surface to the caller.
// T098 — failed entries are retried with backoff, never dropped; dead after 5 attempts.
// Runs against an in-memory OutboxStore and a fake Supabase so no Expo dependencies are needed.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOutbox,
  createSupabaseExecutor,
  type NewOutboxEntry,
  type OutboxEntry,
  type OutboxStore,
  type SupabaseLike,
} from '../../src/data/outbox.ts';
import {
  saveRecordOrQueue,
  RecordSaveError,
  type SaveRecordDeps,
  type RpcResponse,
} from '../../src/data/recordSave.ts';

// ─── In-memory store (simulates SQLite without Expo) ───────────────────────
function makeMemoryStore(): OutboxStore & { _entries: Map<string, OutboxEntry> } {
  const _entries = new Map<string, OutboxEntry>();
  return {
    _entries,
    async get(id) {
      return _entries.get(id) ?? null;
    },
    async put(entry) {
      _entries.set(entry.id, { ...entry });
    },
    async remove(id) {
      _entries.delete(id);
    },
    async list(status) {
      return [..._entries.values()].filter((e) => e.status === status).sort((a, b) => a.created_at - b.created_at);
    },
  };
}

// Controllable clock so ordering and backoff are deterministic.
function makeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    tick: (ms = 1) => {
      t += ms;
      return t;
    },
    set: (v: number) => {
      t = v;
    },
  };
}

const upsert = (id: string, table = 'vehicles'): NewOutboxEntry => ({
  id,
  table,
  operation: 'upsert',
  payload: { id },
});

// ─── Fake Supabase that models save_record's transactional semantics ───────
interface FakeRow {
  [k: string]: unknown;
}
function makeFakeSupabase() {
  const tables: Record<string, Map<string, FakeRow>> = {
    vehicles: new Map(),
    service_records: new Map(),
    line_items: new Map(),
    odometer_readings: new Map(),
  };
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  let failNext: null | 'before-commit' | 'after-commit' = null;
  let odoSeq = 0;

  const client: SupabaseLike = {
    async rpc(fn, args) {
      rpcCalls.push({ fn, args });
      if (failNext === 'before-commit') {
        failNext = null;
        return { data: null, error: { message: 'TypeError: Network request failed', code: '' }, status: 0 };
      }
      assert.equal(fn, 'save_record');
      const rec = args.p_record as FakeRow & { id: string; odometer?: number | null; vehicle_id: string };
      const items = (args.p_items ?? []) as (FakeRow & { id: string })[];
      tables.service_records!.set(rec.id, { ...rec });
      // replace line items
      for (const [id, li] of tables.line_items!) if (li.record_id === rec.id) tables.line_items!.delete(id);
      for (const li of items) tables.line_items!.set(li.id, { ...li, record_id: rec.id });
      // linked odometer reading: upsert on record_id
      const linked = [...tables.odometer_readings!.values()].find((o) => o.record_id === rec.id);
      if (rec.odometer != null) {
        if (linked) linked.value = rec.odometer;
        else {
          const id = `odo-${++odoSeq}`;
          tables.odometer_readings!.set(id, { id, record_id: rec.id, vehicle_id: rec.vehicle_id, value: rec.odometer });
        }
      } else if (linked) {
        tables.odometer_readings!.delete(linked.id as string);
      }
      if (failNext === 'after-commit') {
        failNext = null; // committed, but the response is lost
        return { data: null, error: { message: 'TypeError: Network request failed', code: '' }, status: 0 };
      }
      return { data: rec, error: null, status: 200 };
    },
    from(table) {
      const t = tables[table]!;
      return {
        async upsert(row: FakeRow) {
          const id = row.id as string;
          t.set(id, { ...(t.get(id) ?? {}), ...row });
          return { error: null };
        },
        delete() {
          return {
            async eq(_col: string, val: unknown) {
              t.delete(val as string);
              return { error: null };
            },
          };
        },
      };
    },
  };
  return {
    client,
    tables,
    rpcCalls,
    failNextRpc(mode: 'before-commit' | 'after-commit') {
      failNext = mode;
    },
  };
}

// ─── Record fixtures ───────────────────────────────────────────────────────
const RECORD_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';

function recordArgs(overrides: { items?: { id: string; amount_cents: number }[]; odometer?: number | null } = {}) {
  const items = (
    overrides.items ?? [
      { id: 'li-a', amount_cents: 4000 },
      { id: 'li-b', amount_cents: 2000 },
    ]
  ).map((it, i) => ({
    id: it.id,
    item_type: 'part' as const,
    description: `item ${it.id}`,
    quantity: 1,
    unit_price_cents: it.amount_cents,
    amount_cents: it.amount_cents,
    position: i,
  }));
  const subtotal = items.reduce((s, it) => s + it.amount_cents, 0);
  return {
    record: {
      id: RECORD_ID,
      vehicle_id: VEHICLE_ID,
      kind: 'service' as const,
      category: 'oil_change',
      title: 'Oil change',
      performed_on: '2026-11-20',
      odometer: overrides.odometer === undefined ? 50_000 : overrides.odometer,
      subtotal_cents: subtotal,
      tax_cents: 0,
      total_cents: subtotal,
    },
    items,
  };
}

function makeDeps(
  outbox: ReturnType<typeof createOutbox>,
  opts: { offline?: boolean; rpc?: (fn: string, args: Record<string, unknown>) => Promise<RpcResponse> } = {},
): SaveRecordDeps & { rpcCalls: number } {
  const deps = {
    rpcCalls: 0,
    isOffline: async () => opts.offline ?? false,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      deps.rpcCalls++;
      return opts.rpc ? opts.rpc(fn, args) : { data: args.p_record, error: null, status: 200 };
    },
    enqueue: (e: NewOutboxEntry) => outbox.enqueue(e),
  };
  return deps;
}

const networkDown = async (): Promise<RpcResponse> => ({
  data: null,
  error: { message: 'TypeError: Network request failed', code: '' },
  status: 0,
});

// ═══ T029 — ordered flush, idempotent retry, no duplicates ═════════════════

describe('T029 outbox — ordered flush', () => {
  let store: ReturnType<typeof makeMemoryStore>;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    store = makeMemoryStore();
    clock = makeClock();
  });

  it('flushes entries in creation order', async () => {
    const outbox = createOutbox(store, { now: clock.now });
    await outbox.enqueue(upsert('a'));
    clock.tick();
    await outbox.enqueue(upsert('b'));
    clock.tick();
    await outbox.enqueue(upsert('c'));
    clock.tick();

    const order: string[] = [];
    await outbox.flush(async (e) => {
      order.push(e.id);
    });
    assert.deepEqual(order, ['a', 'b', 'c']);
  });

  it('marks entries as synced after a successful flush', async () => {
    const outbox = createOutbox(store, { now: clock.now });
    await outbox.enqueue(upsert('x'));
    await outbox.flush(async () => {});
    assert.equal(store._entries.get('x')?.status, 'synced');
    assert.equal(await outbox.getPendingCount(), 0);
  });
});

describe('T029 outbox — idempotent retry, no duplicates', () => {
  let store: ReturnType<typeof makeMemoryStore>;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    store = makeMemoryStore();
    clock = makeClock();
  });

  it('re-enqueueing the same id keeps a single entry', async () => {
    const outbox = createOutbox(store, { now: clock.now });
    await outbox.enqueue(upsert('dup', 'service_records'));
    await outbox.flush(async () => {});
    await outbox.enqueue(upsert('dup', 'service_records'));

    const pending = await store.list('pending');
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.id, 'dup');
  });

  it('does not re-send an entry that synced when a later entry failed', async () => {
    const outbox = createOutbox(store, { now: clock.now });
    await outbox.enqueue(upsert('e1'));
    clock.tick();
    await outbox.enqueue(upsert('e2'));
    clock.tick();

    const sent: string[] = [];
    let failE2 = true;
    const exec = async (e: OutboxEntry) => {
      if (e.id === 'e2' && failE2) {
        failE2 = false;
        throw new Error('TypeError: Network request failed');
      }
      sent.push(e.id);
    };

    await outbox.flush(exec);
    clock.tick(60_000);
    await outbox.flush(exec);

    assert.deepEqual(sent, ['e1', 'e2'], 'each entry is sent exactly once');
    assert.equal(store._entries.get('e1')?.status, 'synced');
    assert.equal(store._entries.get('e2')?.status, 'synced');
  });

  it('does not re-flush already-synced entries', async () => {
    const outbox = createOutbox(store, { now: clock.now });
    await outbox.enqueue(upsert('done'));
    await outbox.flush(async () => {});

    const second: string[] = [];
    await outbox.flush(async (e) => {
      second.push(e.id);
    });
    assert.deepEqual(second, []);
  });
});

// ═══ T096 — saveRecord offline → one save_record RPC entry ══════════════════

describe('T096 saveRecord offline queues a single save_record rpc entry', () => {
  let store: ReturnType<typeof makeMemoryStore>;
  let clock: ReturnType<typeof makeClock>;
  let outbox: ReturnType<typeof createOutbox>;

  beforeEach(() => {
    store = makeMemoryStore();
    clock = makeClock();
    outbox = createOutbox(store, { now: clock.now });
  });

  it('enqueues exactly one rpc entry keyed by the record id with {fn, args:{p_record, p_items}}', async () => {
    const args = recordArgs();
    const res = await saveRecordOrQueue(args, makeDeps(outbox, { offline: true }));

    assert.equal(res.queued, true);
    const all = [...store._entries.values()];
    assert.equal(all.length, 1, 'no separate service_records / line_items / odometer_readings upserts');
    const e = all[0]!;
    assert.equal(e.id, RECORD_ID);
    assert.equal(e.operation, 'rpc');
    assert.deepEqual(e.payload, { fn: 'save_record', args: { p_record: args.record, p_items: args.items } });
  });

  it('an edited offline record replaces its line items on the server', async () => {
    const server = makeFakeSupabase();
    await saveRecordOrQueue(recordArgs(), makeDeps(outbox, { offline: true }));
    clock.tick(5);
    // edit while still offline: drop both items, add a new one
    await saveRecordOrQueue(
      recordArgs({ items: [{ id: 'li-c', amount_cents: 7500 }] }),
      makeDeps(outbox, { offline: true }),
    );

    assert.equal((await store.list('pending')).length, 1, 'the edit replaces the queued save');

    await outbox.flush(createSupabaseExecutor(server.client));

    assert.equal(server.rpcCalls.length, 1);
    const items = [...server.tables.line_items!.values()].filter((li) => li.record_id === RECORD_ID);
    assert.deepEqual(
      items.map((li) => li.id),
      ['li-c'],
      'old line items are gone',
    );
    assert.equal(server.tables.service_records!.get(RECORD_ID)?.total_cents, 7500);
  });

  it('editing an offline record keeps its place in the queue', async () => {
    await outbox.enqueue(upsert('vehicle-first', 'vehicles'));
    clock.tick();
    await saveRecordOrQueue(recordArgs(), makeDeps(outbox, { offline: true }));
    clock.tick();
    await outbox.enqueue(upsert('later', 'vehicles'));
    clock.tick();
    await saveRecordOrQueue(
      recordArgs({ items: [{ id: 'li-c', amount_cents: 100 }] }),
      makeDeps(outbox, { offline: true }),
    );

    const order = (await store.list('pending')).map((e) => e.id);
    assert.deepEqual(order, ['vehicle-first', RECORD_ID, 'later']);
  });

  it('creates no duplicate odometer reading, even when a retry follows a lost response', async () => {
    const server = makeFakeSupabase();
    const exec = createSupabaseExecutor(server.client);
    await saveRecordOrQueue(recordArgs({ odometer: 61_234 }), makeDeps(outbox, { offline: true }));

    assert.equal(
      [...store._entries.values()].filter((e) => e.table === 'odometer_readings').length,
      0,
      'no separate odometer_readings entry is queued',
    );

    server.failNextRpc('after-commit'); // server commits, phone never hears back
    await outbox.flush(exec);
    assert.equal(store._entries.get(RECORD_ID)?.status, 'pending', 'unacknowledged entry stays queued');

    clock.tick(60_000);
    await outbox.flush(exec);
    assert.equal(store._entries.get(RECORD_ID)?.status, 'synced');

    const readings = [...server.tables.odometer_readings!.values()].filter((o) => o.record_id === RECORD_ID);
    assert.equal(readings.length, 1);
    assert.equal(readings[0]!.value, 61_234);
  });
});

// ═══ T097 — only network failures are queued ═══════════════════════════════

describe('T097 saveRecord queues only on network failure', () => {
  let store: ReturnType<typeof makeMemoryStore>;
  let outbox: ReturnType<typeof createOutbox>;

  beforeEach(() => {
    store = makeMemoryStore();
    outbox = createOutbox(store, { now: makeClock().now });
  });

  it('online success returns server data and queues nothing', async () => {
    const res = await saveRecordOrQueue(recordArgs(), makeDeps(outbox));
    assert.equal(res.queued, false);
    assert.equal(store._entries.size, 0);
  });

  it('NetInfo offline: queues without calling the RPC', async () => {
    const deps = makeDeps(outbox, { offline: true });
    const res = await saveRecordOrQueue(recordArgs(), deps);
    assert.equal(res.queued, true);
    assert.equal(deps.rpcCalls, 0);
  });

  it('fetch/network error while NetInfo says online: queues', async () => {
    const res = await saveRecordOrQueue(recordArgs(), makeDeps(outbox, { rpc: networkDown }));
    assert.equal(res.queued, true);
    assert.equal(store._entries.size, 1);
  });

  for (const [code, message] of [
    ['22023', 'line item amount mismatch'],
    ['23514', 'new row violates check constraint "service_records_total_check"'],
  ] as const) {
    it(`validation/DB error ${code} is thrown to the caller and not queued`, async () => {
      const deps = makeDeps(outbox, {
        rpc: async () => ({ data: null, error: { message, code }, status: 400 }),
      });
      await assert.rejects(
        saveRecordOrQueue(recordArgs(), deps),
        (err: unknown) => err instanceof RecordSaveError && err.code === code,
      );
      assert.equal(store._entries.size, 0, 'nothing queued');
    });
  }

  it('an RLS / auth error (42501) is not queued either', async () => {
    const deps = makeDeps(outbox, {
      rpc: async () => ({ data: null, error: { message: 'permission denied', code: '42501' }, status: 403 }),
    });
    await assert.rejects(saveRecordOrQueue(recordArgs(), deps), RecordSaveError);
    assert.equal(store._entries.size, 0);
  });
});

// ═══ T098 — retry with backoff, never drop, dead after 5 ═══════════════════

describe('T098 outbox — failed entries are retried, not lost', () => {
  let store: ReturnType<typeof makeMemoryStore>;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    store = makeMemoryStore();
    clock = makeClock();
  });

  const failing = async () => {
    throw new Error('TypeError: Network request failed');
  };

  it('a transient failure is retried after backoff and not lost', async () => {
    const outbox = createOutbox(store, { now: clock.now, baseDelayMs: 2000 });
    await outbox.enqueue(upsert('t1'));

    const r1 = await outbox.flush(failing);
    const e = store._entries.get('t1')!;
    assert.equal(e.status, 'pending', 'still queued');
    assert.equal(e.attempts, 1);
    assert.equal(e.next_attempt_at, clock.now() + 2000);
    assert.equal(r1.nextAttemptAt, clock.now() + 2000);
    assert.equal(await outbox.getPendingCount(), 1);

    // Too early: not attempted
    clock.tick(1000);
    let calls = 0;
    await outbox.flush(async () => {
      calls++;
    });
    assert.equal(calls, 0, 'not retried before its backoff elapses');

    clock.tick(1000);
    await outbox.flush(async () => {
      calls++;
    });
    assert.equal(calls, 1);
    assert.equal(store._entries.get('t1')?.status, 'synced');
  });

  it('backoff is exponential', async () => {
    const outbox = createOutbox(store, { now: clock.now, baseDelayMs: 1000 });
    await outbox.enqueue(upsert('x'));
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) {
      await outbox.flush(failing);
      const e = store._entries.get('x')!;
      delays.push(e.next_attempt_at - clock.now());
      clock.set(e.next_attempt_at);
    }
    assert.deepEqual(delays, [1000, 2000, 4000, 8000]);
  });

  it('after 5 failed attempts the entry becomes dead, is kept, and stops blocking the queue', async () => {
    const outbox = createOutbox(store, { now: clock.now, maxAttempts: 5 });
    await outbox.enqueue(upsert('bad'));
    clock.tick();
    await outbox.enqueue(upsert('next'));
    clock.tick();

    const sent: string[] = [];
    const exec = async (e: OutboxEntry) => {
      if (e.id === 'bad') throw new Error('boom');
      sent.push(e.id);
    };
    for (let i = 0; i < 5; i++) {
      await outbox.flush(exec);
      const e = store._entries.get('bad')!;
      if (e.status === 'pending') clock.set(e.next_attempt_at);
    }

    const bad = store._entries.get('bad');
    assert.ok(bad, 'not dropped');
    assert.equal(bad.status, 'dead');
    assert.equal(bad.attempts, 5);
    assert.equal(bad.last_error, 'boom');
    assert.deepEqual(
      (await outbox.getDead()).map((e) => e.id),
      ['bad'],
    );
    assert.deepEqual(sent, [], '"next" waits behind "bad" while it is still retrying');

    await outbox.flush(exec);
    assert.deepEqual(sent, ['next'], 'once dead, later entries flush');
  });

  it('stops the flush at the first failure so order is preserved', async () => {
    const outbox = createOutbox(store, { now: clock.now });
    await outbox.enqueue(upsert('a'));
    clock.tick();
    await outbox.enqueue(upsert('b'));
    clock.tick();
    await outbox.enqueue(upsert('c'));
    clock.tick();

    const sent: string[] = [];
    await outbox.flush(async (e) => {
      if (e.id === 'b') throw new Error('network');
      sent.push(e.id);
    });
    assert.deepEqual(sent, ['a'], 'c is not sent ahead of b');
    assert.equal(store._entries.get('c')?.status, 'pending');
    assert.equal(store._entries.get('c')?.attempts, 0);
  });

  it('a dead entry can be retried from review', async () => {
    const outbox = createOutbox(store, { now: clock.now, maxAttempts: 1 });
    await outbox.enqueue(upsert('d'));
    await outbox.flush(failing);
    assert.equal(store._entries.get('d')?.status, 'dead');

    await outbox.retry('d');
    assert.equal(store._entries.get('d')?.status, 'pending');
    assert.equal(store._entries.get('d')?.attempts, 0);
    await outbox.flush(async () => {});
    assert.equal(store._entries.get('d')?.status, 'synced');
  });

  it('an edit enqueued while its previous version is in flight is not marked synced unsent', async () => {
    const outbox = createOutbox(store, { now: clock.now });
    await outbox.enqueue({ id: 'r', table: 'vehicles', operation: 'upsert', payload: { v: 1 } });

    const sent: unknown[] = [];
    await outbox.flush(async (e) => {
      sent.push(e.payload);
      // user edits while the request is in flight
      await outbox.enqueue({ id: 'r', table: 'vehicles', operation: 'upsert', payload: { v: 2 } });
    });
    assert.equal(store._entries.get('r')?.status, 'pending', 'v2 still needs to be sent');

    await outbox.flush(async (e) => {
      sent.push(e.payload);
    });
    assert.deepEqual(sent, [{ v: 1 }, { v: 2 }]);
    assert.equal(store._entries.get('r')?.status, 'synced');
  });

  it('notifies subscribers when the queue changes', async () => {
    const outbox = createOutbox(store, { now: clock.now });
    let n = 0;
    const unsub = outbox.subscribe(() => {
      n++;
    });
    await outbox.enqueue(upsert('s'));
    await outbox.flush(async () => {});
    unsub();
    await outbox.enqueue(upsert('s2'));
    assert.ok(n >= 2);
    const before = n;
    await outbox.flush(async () => {});
    assert.equal(n, before, 'unsubscribed');
  });
});
