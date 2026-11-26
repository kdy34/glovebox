// T062/T064 — rule input validation (DB limits: name 1–60, miles 100–200,000, months 1–120,
// at least one interval, lead 0–90 days / 0–10,000 distance) and adding a generic starter rule.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRuleForm, ruleFromGeneric } from '../../src/domain/ruleForm.ts';
import { GENERIC_RULES } from '../../src/domain/genericRules.ts';

const form = { name: 'Oil change', serviceCategory: 'oil_change' as const, intervalMiles: '5,000', intervalMonths: '6', leadDays: '14', leadMiles: '500' };

describe('parseRuleForm', () => {
  it('parses a valid form (commas allowed in numbers)', () => {
    assert.deepEqual(parseRuleForm(form), {
      ok: true,
      value: { name: 'Oil change', service_category: 'oil_change', interval_miles: 5000, interval_months: 6, lead_days: 14, lead_miles: 500 },
    });
  });
  it('an empty interval is null; at least one is required', () => {
    const r = parseRuleForm({ ...form, intervalMiles: '' });
    assert.equal(r.ok && r.value.interval_miles, null);
    assert.deepEqual(parseRuleForm({ ...form, intervalMiles: '', intervalMonths: ' ' }), { ok: false, errors: { interval: 'required' } });
  });
  it('enforces the DB ranges', () => {
    assert.deepEqual(parseRuleForm({ ...form, intervalMiles: '50' }), { ok: false, errors: { intervalMiles: 'range' } });
    assert.deepEqual(parseRuleForm({ ...form, intervalMonths: '121' }), { ok: false, errors: { intervalMonths: 'range' } });
    assert.deepEqual(parseRuleForm({ ...form, leadDays: '91' }), { ok: false, errors: { leadDays: 'range' } });
    assert.deepEqual(parseRuleForm({ ...form, leadMiles: '-1' }), { ok: false, errors: { leadMiles: 'range' } });
    assert.deepEqual(parseRuleForm({ ...form, intervalMonths: '2.5' }), { ok: false, errors: { intervalMonths: 'range' } });
  });
  it('requires a name of at most 60 characters, trimmed', () => {
    assert.deepEqual(parseRuleForm({ ...form, name: '  ' }), { ok: false, errors: { name: 'required' } });
    assert.deepEqual(parseRuleForm({ ...form, name: 'x'.repeat(61) }), { ok: false, errors: { name: 'too_long' } });
    const r = parseRuleForm({ ...form, name: '  Oil  ' });
    assert.equal(r.ok && r.value.name, 'Oil');
  });
  it('empty lead fields use the defaults (14 days, 500)', () => {
    const r = parseRuleForm({ ...form, leadDays: '', leadMiles: '' });
    assert.deepEqual(r.ok && [r.value.lead_days, r.value.lead_miles], [14, 500]);
  });
});

describe('ruleFromGeneric', () => {
  it('copies the R7 intervals with source generic', () => {
    const oil = GENERIC_RULES.find((g) => g.key === 'oil_change')!;
    assert.deepEqual(ruleFromGeneric(oil, 'Oil change'), {
      name: 'Oil change', service_category: 'oil_change', interval_miles: 5000, interval_months: 6, lead_days: 14, lead_miles: 500, source: 'generic',
    });
  });
  it('every generic rule passes the DB checks', () => {
    for (const g of GENERIC_RULES) {
      const r = ruleFromGeneric(g, g.key);
      const parsed = parseRuleForm({
        name: r.name, serviceCategory: r.service_category, intervalMiles: String(r.interval_miles ?? ''),
        intervalMonths: String(r.interval_months ?? ''), leadDays: String(r.lead_days), leadMiles: String(r.lead_miles),
      });
      assert.ok(parsed.ok, g.key);
    }
  });
});

import { baselineFromRecords } from '../../src/domain/ruleForm.ts';

describe('baselineFromRecords (a new rule starts from the latest matching service)', () => {
  const recs = [
    { kind: 'service', category: 'oil_change', performed_on: '2026-03-01', odometer: 147000 },
    { kind: 'service', category: 'oil_change', performed_on: '2026-06-01', odometer: 150000 },
    { kind: 'service', category: 'brakes', performed_on: '2026-07-01', odometer: 151000 },
    { kind: 'expense', category: 'fuel', performed_on: '2026-08-01', odometer: 152000 },
  ];
  it('uses the latest service of the same category', () => {
    assert.deepEqual(baselineFromRecords(recs, 'oil_change'), { last_done_on: '2026-06-01', last_done_odometer: 150000 });
  });
  it('none → nothing (the rule counts from today)', () => {
    assert.equal(baselineFromRecords(recs, 'tires'), null);
  });
});
