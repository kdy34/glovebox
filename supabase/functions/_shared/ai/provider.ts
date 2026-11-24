// AI provider interface (T050). The function never gives the model tools, function calling
// or URL fetching; it sends one image plus the system prompt and gets JSON back.
// Provider output is untrusted: extract-receipt validates it with ReceiptExtractionDraft.

export interface ExtractRequest {
  image: Uint8Array;
  mimeType: string;
  systemPrompt: string;
  responseSchema: Record<string, unknown>;
  /** Aborts the provider call (30 s timeout, set by the caller). */
  signal: AbortSignal;
}

export interface ExtractResult {
  /** Parsed JSON from the model. Not yet validated. */
  json: unknown;
  model: string;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  extract(req: ExtractRequest): Promise<ExtractResult>;
}

/**
 * timeout: the call was aborted. provider_error: HTTP/network failure or a blocked prompt.
 * invalid_output: the model answered, but not with complete JSON.
 * Messages are generic: raw model text never leaves the provider.
 */
export type ProviderErrorKind = 'timeout' | 'provider_error' | 'invalid_output';

export class ProviderError extends Error {
  constructor(public readonly kind: ProviderErrorKind, detail = '') {
    super(detail ? `${kind}: ${detail}` : kind);
    this.name = 'ProviderError';
  }
}
