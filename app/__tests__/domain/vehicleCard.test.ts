// T104 — the Garage card subtitle never repeats the title.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lastServiceDate, vehicleCardText } from '../../src/domain/vehicleCard.ts';

const prius = { nickname: null, year: 2009, make: 'Toyota', model: 'Prius', trim: null };

describe('vehicleCardText', () => {
  it('with a nickname: nickname over year make model', () => {
    assert.deepEqual(vehicleCardText({ ...prius, nickname: 'Daily driver' }, null), {
      title: 'Daily driver',
      subtitle: { kind: 'text', text: '2009 Toyota Prius' },
    });
  });

  it('without a nickname: the trim when set', () => {
    assert.deepEqual(vehicleCardText({ ...prius, trim: 'Touring' }, '2026-05-01'), {
      title: '2009 Toyota Prius',
      subtitle: { kind: 'text', text: 'Touring' },
    });
  });

  it('without a nickname or trim: the last service date', () => {
    assert.deepEqual(vehicleCardText(prius, '2026-05-01').subtitle, { kind: 'lastService', date: '2026-05-01' });
  });

  it('without a nickname or trim and no services: "no services"', () => {
    assert.deepEqual(vehicleCardText(prius, null).subtitle, { kind: 'noService' });
  });

  it('shows nothing while records are loading (never claims "no services" too early)', () => {
    assert.equal(vehicleCardText(prius, undefined).subtitle, null);
  });

  it('ignores a blank trim', () => {
    assert.deepEqual(vehicleCardText({ ...prius, trim: '  ' }, null).subtitle, { kind: 'noService' });
  });

  it('never repeats the title as the subtitle', () => {
    const cases = [
      [prius, null], [prius, '2026-01-01'], [prius, undefined],
      [{ ...prius, trim: 'Touring' }, null], [{ ...prius, nickname: 'Prius' }, null],
      [{ ...prius, nickname: '2009 Toyota Prius' }, null],
    ] as const;
    for (const [v, last] of cases) {
      const { title, subtitle } = vehicleCardText(v, last);
      if (subtitle?.kind === 'text') assert.notEqual(subtitle.text, title, JSON.stringify(v));
    }
  });
});

describe('lastServiceDate', () => {
  it('is the latest service record, ignoring expenses', () => {
    assert.equal(lastServiceDate([
      { kind: 'expense', performed_on: '2026-06-01' },
      { kind: 'service', performed_on: '2026-03-01' },
      { kind: 'service', performed_on: '2026-05-01' },
    ]), '2026-05-01');
  });
  it('is null when there are no service records', () => {
    assert.equal(lastServiceDate([{ kind: 'expense', performed_on: '2026-06-01' }]), null);
    assert.equal(lastServiceDate([]), null);
  });
  it('is undefined while records are loading', () => {
    assert.equal(lastServiceDate(undefined), undefined);
  });
});
