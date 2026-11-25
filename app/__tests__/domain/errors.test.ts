// T102 — save forms show and log the real error instead of a bare "Could not save".
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeError, saveErrorMessage } from '../../src/domain/errors.ts';

describe('describeError', () => {
  it('uses the message of an Error', () => {
    assert.equal(describeError(new Error('crypto.getRandomValues() not supported')), 'crypto.getRandomValues() not supported');
  });
  it('includes the code, details and hint of a PostgREST error', () => {
    const pg = { message: 'new row violates row-level security policy', code: '42501', details: null, hint: 'check user_id' };
    assert.equal(describeError(pg), '42501: new row violates row-level security policy (hint: check user_id)');
    assert.equal(describeError({ message: 'bad value', code: '22023', details: 'year out of range' }), '22023: bad value (year out of range)');
  });
  it('handles strings and unknown values', () => {
    assert.equal(describeError('offline'), 'offline');
    assert.equal(describeError(undefined), 'Unknown error');
    assert.equal(describeError({ foo: 1 }), '{"foo":1}');
  });
});

describe('saveErrorMessage', () => {
  it('shows only the friendly text in production', () => {
    assert.equal(saveErrorMessage('Could not save vehicle.', new Error('boom'), false), 'Could not save vehicle.');
  });
  it('appends the real error in development', () => {
    assert.equal(saveErrorMessage('Could not save vehicle.', new Error('boom'), true), 'Could not save vehicle.\n\nboom');
  });
});
