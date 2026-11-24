// T045 — account flows: delete (server first, local wipe only on success) and export.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccountFlow, exportDataFlow, type FunctionResult } from '../../src/data/accountFlow.ts';
import { profileUpdate } from '../../src/data/writes.ts';

const UID = 'aaaaaaaa-0000-4000-8000-00000000000a';

function deleteDeps(result: FunctionResult | Error) {
  const calls: string[] = [];
  let body: unknown;
  return {
    calls,
    get body() {
      return body;
    },
    deps: {
      userId: UID,
      invoke: async (_fn: string, b: Record<string, unknown>) => {
        calls.push('invoke');
        body = b;
        if (result instanceof Error) throw result;
        return result;
      },
      purgeOutbox: async (uid: string) => {
        calls.push(`purgeOutbox:${uid}`);
      },
      clearQueryCache: () => {
        calls.push('clearQueryCache');
      },
      clearLocalCaches: async () => {
        calls.push('clearLocalCaches');
      },
      resetAnalytics: () => {
        calls.push('resetAnalytics');
      },
      signOutLocal: async () => {
        calls.push('signOutLocal');
      },
    },
  };
}

describe('T045 deleteAccountFlow', () => {
  it('sends confirm "DELETE" (and the Apple code when there is one)', async () => {
    const d = deleteDeps({ ok: true, status: 200, data: { deleted: true } });
    await deleteAccountFlow(d.deps, { appleAuthorizationCode: 'code-1' });
    assert.deepEqual(d.body, { confirm: 'DELETE', apple_authorization_code: 'code-1' });
  });

  it('on success: wipes local data, then signs out locally', async () => {
    const d = deleteDeps({ ok: true, status: 200, data: { deleted: true } });
    const res = await deleteAccountFlow(d.deps);
    assert.deepEqual(res, { ok: true, partial: false });
    assert.deepEqual(d.calls, [
      'invoke',
      `purgeOutbox:${UID}`,
      'clearQueryCache',
      'clearLocalCaches',
      'resetAnalytics',
      'signOutLocal',
    ]);
  });

  it('partial_failure still means the account is gone: wipe and sign out', async () => {
    const d = deleteDeps({ ok: false, status: 500, code: 'partial_failure' });
    const res = await deleteAccountFlow(d.deps);
    assert.deepEqual(res, { ok: true, partial: true });
    assert.equal(d.calls.at(-1), 'signOutLocal');
  });

  it('a server error wipes nothing and keeps the user signed in', async () => {
    const d = deleteDeps({ ok: false, status: 400, code: 'confirmation_required' });
    const res = await deleteAccountFlow(d.deps);
    assert.deepEqual(res, { ok: false, code: 'confirmation_required' });
    assert.deepEqual(d.calls, ['invoke']);
  });

  it('a network error (offline) wipes nothing', async () => {
    const d = deleteDeps(new Error('Network request failed'));
    const res = await deleteAccountFlow(d.deps);
    assert.deepEqual(res, { ok: false, code: 'network' });
    assert.deepEqual(d.calls, ['invoke']);
  });
});

describe('T045 exportDataFlow', () => {
  function exportDeps(results: (FunctionResult | Error)[]) {
    const calls: string[] = [];
    const bodies: unknown[] = [];
    return {
      calls,
      bodies,
      deps: {
        invoke: async (_fn: string, b: Record<string, unknown>) => {
          bodies.push(b);
          const r = results.shift()!;
          if (r instanceof Error) throw r;
          return r;
        },
        download: async (url: string) => {
          calls.push(`download:${url}`);
          return 'file:///cache/export.zip';
        },
        share: async (uri: string) => {
          calls.push(`share:${uri}`);
        },
      },
    };
  }

  it('downloads the ZIP and opens the share sheet', async () => {
    const d = exportDeps([{ ok: true, status: 200, data: { url: 'https://x/e.zip', bytes: 10, expires_at: 'z' } }]);
    const res = await exportDataFlow(d.deps);
    assert.deepEqual(res, { ok: true });
    assert.deepEqual(d.calls, ['download:https://x/e.zip', 'share:file:///cache/export.zip']);
    assert.deepEqual(d.bodies, [{}]);
  });

  it('export_too_large is reported with a data-only option', async () => {
    const d = exportDeps([{ ok: false, status: 413, code: 'export_too_large' }]);
    const res = await exportDataFlow(d.deps);
    assert.deepEqual(res, { ok: false, code: 'export_too_large', dataOnlyAvailable: true });
    assert.deepEqual(d.calls, []);
  });

  it('a data-only export asks the server for data_only', async () => {
    const d = exportDeps([{ ok: true, status: 200, data: { url: 'https://x/d.zip', bytes: 1, expires_at: 'z' } }]);
    await exportDataFlow(d.deps, { dataOnly: true });
    assert.deepEqual(d.bodies, [{ data_only: true }]);
  });

  it('a network error is reported, nothing is shared', async () => {
    const d = exportDeps([new Error('Network request failed')]);
    assert.deepEqual(await exportDataFlow(d.deps), { ok: false, code: 'network' });
    assert.deepEqual(d.calls, []);
  });

  it('a malformed response is an error, not a crash', async () => {
    const d = exportDeps([{ ok: true, status: 200, data: { nope: true } }]);
    assert.deepEqual(await exportDataFlow(d.deps), { ok: false, code: 'internal' });
  });
});

describe('T044 profile settings are partial updates', () => {
  it('builds an update keyed by the user id (profiles has no insert policy)', () => {
    const e = profileUpdate(UID, { distance_unit: 'km', reminder_lead_days: 30 });
    assert.deepEqual(e, {
      id: UID,
      table: 'profiles',
      operation: 'update',
      payload: { distance_unit: 'km', reminder_lead_days: 30 },
    });
  });

  it('rejects out-of-range lead days and unknown units', () => {
    assert.throws(() => profileUpdate(UID, { reminder_lead_days: 91 }));
    assert.throws(() => profileUpdate(UID, { reminder_lead_days: 1.5 }));
    assert.throws(() => profileUpdate(UID, { distance_unit: 'yards' as 'mi' }));
  });
});
