// Typed error responses: { error: { code, message } } with a user-safe message.
// Never include stack traces or provider output (contracts/edge-functions.md).

export type ErrorCode =
  | 'unauthorized' | 'bad_request' | 'confirmation_required' | 'attachment_not_found'
  | 'file_too_large' | 'unsupported_type' | 'quota_exceeded' | 'not_a_receipt' | 'unreadable'
  | 'ai_disabled' | 'provider_error' | 'timeout' | 'invalid_output' | 'not_available'
  | 'export_too_large' | 'rate_limited' | 'partial_failure' | 'internal';

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401, bad_request: 400, confirmation_required: 400, attachment_not_found: 404,
  file_too_large: 413, unsupported_type: 415, quota_exceeded: 402, not_a_receipt: 422, unreadable: 422,
  ai_disabled: 503, provider_error: 503, timeout: 504, invalid_output: 502, not_available: 404,
  export_too_large: 413, rate_limited: 429, partial_failure: 500, internal: 500,
};

const MESSAGE: Record<ErrorCode, string> = {
  unauthorized: 'Please sign in again.',
  bad_request: 'Something about that request was not right.',
  confirmation_required: 'Please confirm to continue.',
  attachment_not_found: 'We could not find that photo.',
  file_too_large: 'That file is too large (max 10 MB).',
  unsupported_type: 'Please use a JPEG, PNG, HEIC or PDF.',
  quota_exceeded: 'You have used all of this month’s scans.',
  not_a_receipt: 'That does not look like a receipt.',
  unreadable: 'We could not read that receipt. You can enter it manually.',
  ai_disabled: 'Receipt scanning is temporarily unavailable.',
  provider_error: 'Receipt scanning is temporarily unavailable.',
  timeout: 'Scanning took too long. You can enter it manually.',
  invalid_output: 'We could not read that receipt. You can enter it manually.',
  not_available: 'This report is no longer available.',
  export_too_large: 'Your export is too large. Try a data-only export.',
  rate_limited: 'Too many requests. Please try again in a minute.',
  partial_failure: 'Something went wrong. We will finish cleaning up automatically.',
  internal: 'Something went wrong. Please try again.',
};

export class HttpError extends Error {
  constructor(public readonly code: ErrorCode, public readonly extra: Record<string, unknown> = {}) {
    super(code);
  }
}

export function errorResponse(code: ErrorCode, headers: HeadersInit = {}, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ error: { code, message: MESSAGE[code], ...extra } }), {
    status: STATUS[code],
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** Wraps a handler so thrown HttpErrors become typed responses and anything else becomes `internal`. */
export function handle(fn: (req: Request) => Promise<Response>, headers: HeadersInit = {}) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e.code, headers, e.extra);
      console.error('unhandled', e instanceof Error ? e.message : String(e));
      return errorResponse('internal', headers);
    }
  };
}
