// Save-or-queue logic for service records (T096/T097). Pure TypeScript — the real
// Supabase client, NetInfo and outbox are injected by repositories/records.ts.
//
// Every record write goes through the save_record RPC (record + line items + linked
// odometer reading + rule reset in one transaction). Offline, the same RPC call is
// queued as one outbox entry keyed by the record id, so an offline edit replaces the
// queued save and the server replaces the line items when it finally runs.
//
// Only network failures are queued. Validation / DB / permission errors are thrown as
// RecordSaveError so the form can tell the user.
import type { NewOutboxEntry, RpcPayload } from './outbox';

export interface LineItemInput {
  id: string;
  item_type: 'part' | 'labor' | 'fee' | 'discount';
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  position: number;
}

export interface RecordInput {
  id: string;
  vehicle_id: string;
  kind: 'service' | 'expense';
  category: string;
  title: string;
  performed_on: string; // YYYY-MM-DD
  odometer?: number | null; // save_record upserts the linked odometer reading from this
  shop_name?: string | null;
  shop_address?: string | null;
  is_diy?: boolean;
  currency?: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes?: string | null;
  source?: 'manual' | 'ai';
  extraction_id?: string | null;
}

export interface SaveRecordArgs {
  record: RecordInput;
  items: LineItemInput[];
}

export interface RpcError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface RpcResponse {
  data: unknown;
  error: RpcError | null;
  status?: number;
}

export interface SaveRecordDeps {
  /** True when NetInfo reports no connection. */
  isOffline(): Promise<boolean>;
  rpc(fn: string, args: Record<string, unknown>): Promise<RpcResponse>;
  enqueue(entry: NewOutboxEntry): Promise<void>;
}

export interface SaveRecordResult<T = unknown> {
  data: T;
  queued: boolean;
}

/** A save the server rejected (validation, constraint, permission). Never queued. */
export class RecordSaveError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'RecordSaveError';
    this.code = code;
  }
}

/** SQLSTATE (e.g. 22023, 23514, 42501) or a PostgREST code (PGRST...). */
const SERVER_CODE = /^([0-9A-Z]{5}|PGRST\d+)$/;
// postgrest-js wraps fetch failures as `${name}: ${message}` with status 0 and code ''.
const NETWORK_MESSAGE =
  /network request failed|failed to fetch|fetch failed|networkerror|load failed|aborterror|timeouterror|timed out/i;

/** True if the RPC never reached the database (so retrying later is safe and useful). */
export function isNetworkFailure(res: Pick<RpcResponse, 'error' | 'status'>): boolean {
  const err = res.error;
  if (!err) return false;
  if (err.code && SERVER_CODE.test(err.code)) return false;
  if (res.status === 0) return true;
  return NETWORK_MESSAGE.test(err.message ?? '');
}

export const SAVE_RECORD_FN = 'save_record';

export function saveRecordEntry(args: SaveRecordArgs): NewOutboxEntry {
  const payload: RpcPayload = {
    fn: SAVE_RECORD_FN,
    args: { p_record: args.record, p_items: args.items },
  };
  return {
    id: args.record.id,
    table: 'service_records',
    operation: 'rpc',
    payload: payload as unknown as Record<string, unknown>,
  };
}

export async function saveRecordOrQueue(args: SaveRecordArgs, deps: SaveRecordDeps): Promise<SaveRecordResult> {
  const entry = saveRecordEntry(args);
  const optimistic = { data: args.record, queued: true };

  if (await deps.isOffline()) {
    await deps.enqueue(entry);
    return optimistic;
  }

  let res: RpcResponse;
  try {
    res = await deps.rpc(SAVE_RECORD_FN, (entry.payload as unknown as RpcPayload).args);
  } catch (err) {
    // A thrown fetch error (rather than a returned one) is a network failure too.
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    res = { data: null, error: { message, code: '' }, status: 0 };
  }

  if (!res.error) return { data: res.data, queued: false };

  if (isNetworkFailure(res)) {
    await deps.enqueue(entry);
    return optimistic;
  }

  throw new RecordSaveError(res.error.message, res.error.code ?? '');
}
