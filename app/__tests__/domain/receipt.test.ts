// T055 — the pure parts of the receipt service: storage paths, hashing output, error codes and
// the plain-language fallback message for each (US2 AS4/AS5, FR-015).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTRACT_ERROR_CODES,
  MAX_RECEIPT_BYTES,
  extractErrorCode,
  fallbackMessageKey,
  receiptStoragePath,
  toHex,
} from '../../src/domain/receipt.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const en = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'src', 'i18n', 'en.json'), 'utf8'));
const lookup = (key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);

describe('receiptStoragePath', () => {
  it('is {uid}/{attachment_id}.{ext} (storage policy + attachments_path_owner)', () => {
    assert.equal(receiptStoragePath('u1', 'a1', 'image/jpeg'), 'u1/a1.jpg');
    assert.equal(receiptStoragePath('u1', 'a1', 'image/png'), 'u1/a1.png');
    assert.equal(receiptStoragePath('u1', 'a1', 'image/heic'), 'u1/a1.heic');
    assert.equal(receiptStoragePath('u1', 'a1', 'application/pdf'), 'u1/a1.pdf');
  });
  it('the size limit matches the bucket (under 10 MB)', () => {
    assert.equal(MAX_RECEIPT_BYTES, 10 * 1024 * 1024);
  });
});

describe('toHex', () => {
  it('formats a digest as lowercase hex (attachments.sha256 check)', () => {
    assert.equal(toHex(new Uint8Array([0, 15, 255, 16]).buffer), '000fff10');
  });
});

describe('extractErrorCode', () => {
  it('reads the contract error code from the body', () => {
    assert.equal(extractErrorCode(402, { error: { code: 'quota_exceeded' } }), 'quota_exceeded');
    assert.equal(extractErrorCode(422, { error: { code: 'not_a_receipt' } }), 'not_a_receipt');
    assert.equal(extractErrorCode(504, { error: { code: 'timeout' } }), 'timeout');
  });
  it('falls back on the HTTP status when the body has no known code', () => {
    assert.equal(extractErrorCode(504, null), 'timeout');
    assert.equal(extractErrorCode(402, {}), 'quota_exceeded');
    assert.equal(extractErrorCode(500, { error: { code: 'internal' } }), 'provider_error');
    assert.equal(extractErrorCode(418, 'nope'), 'provider_error');
  });
  it('no response at all is a network error', () => {
    assert.equal(extractErrorCode(null, null), 'network');
  });
});

describe('fallbackMessageKey', () => {
  it('every error code has a translated message', () => {
    for (const code of EXTRACT_ERROR_CODES) {
      assert.equal(typeof lookup(fallbackMessageKey(code)), 'string', code);
    }
  });
});
