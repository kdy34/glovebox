// 002 T009 — the generic starter set fits the car's fuel type (002 FR-004, SC-002; 001 R7).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERIC_RULES, genericStarterSet } from '../../src/domain/genericRules.ts';
import { FUEL_TYPES } from '../../src/domain/fuelType.ts';
import { SERVICE_CATEGORIES } from '../../src/domain/categories.ts';

const en = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'src', 'i18n', 'en.json'), 'utf8'));
const lookup = (key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);

const R7 = [
  'oil_change', 'tire_rotation', 'brake_inspection', 'engine_air_filter', 'cabin_filter',
  'coolant_check', 'battery_check', 'wipers', 'inspection_registration',
];
const keys = (fuel: (typeof FUEL_TYPES)[number]) => genericStarterSet(fuel).map((r) => r.key);

describe('genericStarterSet', () => {
  it('electric: no oil change, engine air filter or coolant check (SC-002)', () => {
    const set = keys('electric');
    for (const k of ['oil_change', 'engine_air_filter', 'coolant_check']) assert.ok(!set.includes(k), k);
  });

  it('electric keeps the rest, including the 12 V battery check and tire rotation', () => {
    assert.deepEqual(keys('electric'), R7.filter((k) => !['oil_change', 'engine_air_filter', 'coolant_check'].includes(k)));
    assert.ok(keys('electric').includes('battery_check'));
    assert.ok(keys('electric').includes('tire_rotation'));
  });

  it('every other fuel type gets the full R7 set', () => {
    for (const fuel of FUEL_TYPES.filter((f) => f !== 'electric')) assert.deepEqual(keys(fuel), R7, fuel);
  });
});

describe('GENERIC_RULES', () => {
  it('is the R7 set, in order', () => {
    assert.deepEqual(GENERIC_RULES.map((r) => r.key), R7);
  });

  it('every rule is labelled generic, has an interval, a valid category and a translated name', () => {
    for (const r of GENERIC_RULES) {
      assert.equal(r.source, 'generic', r.key);
      assert.ok((r.intervalMiles ?? 0) > 0 || (r.intervalMonths ?? 0) > 0, `${r.key} has an interval`);
      assert.ok((SERVICE_CATEGORIES as readonly string[]).includes(r.serviceCategory), `${r.key} category`);
      assert.equal(typeof lookup(r.nameKey), 'string', `${r.key} name ${r.nameKey}`);
    }
  });

  it('has the R7 intervals', () => {
    const byKey = Object.fromEntries(GENERIC_RULES.map((r) => [r.key, r]));
    assert.deepEqual([byKey.oil_change!.intervalMiles, byKey.oil_change!.intervalMonths], [5000, 6]);
    assert.equal(byKey.tire_rotation!.intervalMiles, 6000);
    assert.equal(byKey.engine_air_filter!.intervalMiles, 15000);
    for (const k of ['brake_inspection', 'cabin_filter', 'coolant_check', 'battery_check', 'wipers', 'inspection_registration']) {
      assert.equal(byKey[k]!.intervalMonths, 12, k);
    }
  });

  it('the generic label is translated', () => {
    assert.equal(lookup('rules.genericLabel'), "Generic — check your owner's manual");
  });
});
