// 002 T003 — fuel type: VIN mapping (FR-002, SC-001), parsing, decode prefill (US1 AS3),
// electric notice (FR-006).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FUEL_TYPE,
  FUEL_TYPES,
  applyDecodedFuelType,
  fuelTypeFromVpic,
  parseFuelType,
  showsElectricNotice,
} from '../../src/domain/fuelType.ts';
import { VPIC_FUEL_FIXTURES } from './fixtures/vpic.ts';

describe('fuelTypeFromVpic (FR-002)', () => {
  for (const f of VPIC_FUEL_FIXTURES) {
    it(`${f.name} (${f.origin}) → ${f.expected}`, () => {
      assert.equal(
        fuelTypeFromVpic({
          primary: f.result.FuelTypePrimary,
          secondary: f.result.FuelTypeSecondary,
          electrification: f.result.ElectrificationLevel,
        }),
        f.expected,
      );
    });
  }

  it('checks ElectrificationLevel before FuelTypePrimary (a PHEV reports Primary = Electric)', () => {
    assert.equal(fuelTypeFromVpic({ primary: 'Electric', secondary: 'Gasoline', electrification: 'PHEV (Plug-in Hybrid Electric Vehicle)' }), 'plug_in_hybrid');
  });

  it('uses the first of several FuelTypePrimary values', () => {
    assert.equal(fuelTypeFromVpic({ primary: 'Gasoline, Electric', secondary: '', electrification: '' }), 'gasoline');
    assert.equal(fuelTypeFromVpic({ primary: 'Diesel, Gasoline', secondary: '', electrification: '' }), 'diesel');
  });

  it('treats missing fields as empty', () => {
    assert.equal(fuelTypeFromVpic({}), null);
    assert.equal(fuelTypeFromVpic({ primary: null, secondary: undefined, electrification: null }), null);
    assert.equal(fuelTypeFromVpic({ primary: '  ' }), null);
  });

  it('covers every FR-002 table row with at least one fixture', () => {
    const expected = new Set(VPIC_FUEL_FIXTURES.map((f) => f.expected));
    for (const v of [...FUEL_TYPES, null]) assert.ok(expected.has(v), `fixture for ${v}`);
  });
});

describe('parseFuelType', () => {
  it('accepts every allowed value', () => {
    for (const v of FUEL_TYPES) assert.equal(parseFuelType(v), v);
  });
  it('falls back to gasoline for unknown or missing values', () => {
    assert.equal(DEFAULT_FUEL_TYPE, 'gasoline');
    assert.equal(parseFuelType('hydrogen'), 'gasoline');
    assert.equal(parseFuelType(null), 'gasoline');
    assert.equal(parseFuelType(undefined), 'gasoline');
  });
});

describe('applyDecodedFuelType (US1 AS1–AS3)', () => {
  it('prefills from the decode when the user has not chosen', () => {
    assert.equal(applyDecodedFuelType('gasoline', 'hybrid', false), 'hybrid');
  });
  it('never overwrites a value the user set', () => {
    assert.equal(applyDecodedFuelType('diesel', 'hybrid', true), 'diesel');
  });
  it('keeps the current value when the decode has nothing usable', () => {
    assert.equal(applyDecodedFuelType('electric', null, false), 'electric');
  });
});

describe('showsElectricNotice (FR-006)', () => {
  it('shows when a non-electric car is switched to electric', () => {
    for (const saved of FUEL_TYPES.filter((v) => v !== 'electric')) assert.equal(showsElectricNotice(saved, 'electric'), true, saved);
  });
  it('does not show for a car that was already electric', () => {
    assert.equal(showsElectricNotice('electric', 'electric'), false);
  });
  it('does not show for other changes', () => {
    assert.equal(showsElectricNotice('gasoline', 'hybrid'), false);
    assert.equal(showsElectricNotice('electric', 'gasoline'), false);
    assert.equal(showsElectricNotice('gasoline', 'gasoline'), false);
  });
});
