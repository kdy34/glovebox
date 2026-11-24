// Account flows (T045), pure TypeScript with injected dependencies so they can be tested.
// The React Native wiring is in src/services/account.ts.

/** A normalized Edge Function result. */
export type FunctionResult = { ok: true; status: number; data: unknown } | { ok: false; status: number; code: string };

export type Invoke = (fn: string, body: Record<string, unknown>) => Promise<FunctionResult>;

export interface DeleteAccountDeps {
  userId: string;
  invoke: Invoke;
  /** Remove every queued change of this user from the phone (T100). */
  purgeOutbox(userId: string): Promise<void>;
  clearQueryCache(): void;
  /** AsyncStorage caches (persisted query cache, config cache, …). */
  clearLocalCaches(): Promise<void>;
  resetAnalytics(): void;
  /** Local-scope sign-out: the server session is already gone with the user. */
  signOutLocal(): Promise<void>;
}

export type DeleteAccountResult = { ok: true; partial: boolean } | { ok: false; code: string };

/**
 * Deletes the account on the server first. Only when the server says the account is gone
 * (200, or 500 partial_failure, where the user is deleted and the nightly sweep finishes
 * storage) is local data wiped and the user signed out. Any other failure, including
 * being offline, changes nothing on the phone.
 */
export async function deleteAccountFlow(
  deps: DeleteAccountDeps,
  opts: { appleAuthorizationCode?: string } = {},
): Promise<DeleteAccountResult> {
  const body: Record<string, unknown> = { confirm: 'DELETE' };
  if (opts.appleAuthorizationCode) body.apple_authorization_code = opts.appleAuthorizationCode;

  let res: FunctionResult;
  try {
    res = await deps.invoke('delete-account', body);
  } catch {
    return { ok: false, code: 'network' };
  }

  const partial = !res.ok && res.code === 'partial_failure';
  if (!res.ok && !partial) return { ok: false, code: res.code };

  await deps.purgeOutbox(deps.userId);
  deps.clearQueryCache();
  await deps.clearLocalCaches();
  deps.resetAnalytics();
  await deps.signOutLocal();
  return { ok: true, partial };
}

export interface ExportDataDeps {
  invoke: Invoke;
  /** Downloads the signed URL to a local file and returns its URI. */
  download(url: string): Promise<string>;
  /** Opens the iOS share sheet for the file. */
  share(uri: string): Promise<void>;
}

export type ExportDataResult = { ok: true } | { ok: false; code: string; dataOnlyAvailable?: boolean };

export async function exportDataFlow(
  deps: ExportDataDeps,
  opts: { dataOnly?: boolean } = {},
): Promise<ExportDataResult> {
  let res: FunctionResult;
  try {
    res = await deps.invoke('export-data', opts.dataOnly ? { data_only: true } : {});
  } catch {
    return { ok: false, code: 'network' };
  }
  if (!res.ok) {
    return res.code === 'export_too_large'
      ? { ok: false, code: res.code, dataOnlyAvailable: true }
      : { ok: false, code: res.code };
  }
  const url = (res.data as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || !url) return { ok: false, code: 'internal' };
  try {
    await deps.share(await deps.download(url));
  } catch {
    return { ok: false, code: 'network' };
  }
  return { ok: true };
}
