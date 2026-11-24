// T020 — remote config: compiled defaults, partial overrides, bad values ignored (contracts/app-config.md).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, resolveConfig } from '../../src/domain/config.ts';

describe('resolveConfig', () => {
  it('returns defaults when nothing was fetched', () => {
    assert.deepEqual(resolveConfig(undefined), DEFAULT_CONFIG);
    assert.deepEqual(resolveConfig([]), DEFAULT_CONFIG);
  });

  it('applies valid overrides from app_config rows', () => {
    const c = resolveConfig([
      { key: 'monetization_enabled', value: false },
      { key: 'limits', value: { free: { vehicles: 2, scans_per_month: 10, share_links: false, insights: false }, pro: { vehicles: null, scans_per_month: 100, share_links: true, insights: true } } },
    ]);
    assert.equal(c.monetizationEnabled, false);
    assert.equal(c.limits.free.vehicles, 2);
    assert.equal(c.limits.free.scansPerMonth, 10);
    assert.equal(c.limits.pro.vehicles, null);
  });

  it('ignores malformed values and keeps the default (never crash, never unlock)', () => {
    const c = resolveConfig([
      { key: 'monetization_enabled', value: 'nope' },
      { key: 'limits', value: { free: { vehicles: -3 } } },
      { key: 'support_email', value: 42 },
    ]);
    assert.equal(c.monetizationEnabled, DEFAULT_CONFIG.monetizationEnabled);
    assert.deepEqual(c.limits, DEFAULT_CONFIG.limits);
    assert.equal(c.supportEmail, DEFAULT_CONFIG.supportEmail);
  });

  it('ignores unknown keys', () => {
    const c = resolveConfig([{ key: 'something_new', value: true }]);
    assert.deepEqual(c, DEFAULT_CONFIG);
  });

  it('parses min_supported_version', () => {
    assert.equal(resolveConfig([{ key: 'min_supported_version', value: '1.2.0' }]).minSupportedVersion, '1.2.0');
    assert.equal(resolveConfig([{ key: 'min_supported_version', value: 'v1' }]).minSupportedVersion, '1.0.0');
  });
});
