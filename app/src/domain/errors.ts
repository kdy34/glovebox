// T102 — turn any thrown value into readable text, for logs and the dev-only error detail.
// Pure TypeScript (constitution: no React Native imports in src/domain).

interface PostgrestLike {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

function isPostgrestLike(e: unknown): e is PostgrestLike {
  return typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string';
}

export function describeError(err: unknown): string {
  if (err === undefined || err === null) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error && !(err as { code?: unknown }).code) return err.message;
  if (isPostgrestLike(err)) {
    const head = err.code ? `${err.code}: ${err.message}` : err.message;
    const extra = [err.details, err.hint ? `hint: ${err.hint}` : null].filter(Boolean).join('; ');
    return extra ? `${head} (${extra})` : head;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** The alert text for a failed save: the friendly line, plus the real error in development. */
export function saveErrorMessage(friendly: string, err: unknown, dev: boolean): string {
  return dev ? `${friendly}\n\n${describeError(err)}` : friendly;
}
