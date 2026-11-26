// Maintenance rule input (T062/T064, FR-018). Mirrors the maintenance_rules checks so the form
// can explain a problem before the write is queued.
import type { ServiceCategory } from './categories';
import type { GenericRule } from './genericRules';

export interface RuleFormInput {
  name: string;
  serviceCategory: ServiceCategory;
  intervalMiles: string;
  intervalMonths: string;
  leadDays: string;
  leadMiles: string;
}

export interface RuleFields {
  name: string;
  service_category: ServiceCategory;
  interval_miles: number | null;
  interval_months: number | null;
  lead_days: number;
  lead_miles: number;
}

export type RuleFormError = 'required' | 'range' | 'too_long';
export type RuleFormResult =
  | { ok: true; value: RuleFields }
  | { ok: false; errors: Partial<Record<'name' | 'interval' | 'intervalMiles' | 'intervalMonths' | 'leadDays' | 'leadMiles', RuleFormError>> };

export const DEFAULT_LEAD_DAYS = 14;
export const DEFAULT_LEAD_MILES = 500;

/** '' → null; a whole number in [min, max] → number; anything else → 'range'. */
function int(text: string, min: number, max: number): number | null | 'range' {
  const t = text.replace(/[,\s]/g, '');
  if (!t) return null;
  if (!/^-?\d+$/.test(t)) return 'range';
  const n = Number(t);
  return n < min || n > max ? 'range' : n;
}

export function parseRuleForm(f: RuleFormInput): RuleFormResult {
  const errors: Extract<RuleFormResult, { ok: false }>['errors'] = {};
  const name = f.name.replace(/\s+/g, ' ').trim();
  if (!name) errors.name = 'required';
  else if (name.length > 60) errors.name = 'too_long';
  const miles = int(f.intervalMiles, 100, 200_000);
  const months = int(f.intervalMonths, 1, 120);
  const leadDays = int(f.leadDays, 0, 90);
  const leadMiles = int(f.leadMiles, 0, 10_000);
  if (miles === 'range') errors.intervalMiles = 'range';
  if (months === 'range') errors.intervalMonths = 'range';
  if (leadDays === 'range') errors.leadDays = 'range';
  if (leadMiles === 'range') errors.leadMiles = 'range';
  if (miles === null && months === null) errors.interval = 'required';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      service_category: f.serviceCategory,
      interval_miles: miles as number | null,
      interval_months: months as number | null,
      lead_days: (leadDays as number | null) ?? DEFAULT_LEAD_DAYS,
      lead_miles: (leadMiles as number | null) ?? DEFAULT_LEAD_MILES,
    },
  };
}

/** A generic starter rule (001 R7 / 002 FR-004) as rule fields, labelled generic. */
export function ruleFromGeneric(g: GenericRule, name: string): RuleFields & { source: 'generic' } {
  return {
    name,
    service_category: g.serviceCategory,
    interval_miles: g.intervalMiles,
    interval_months: g.intervalMonths,
    lead_days: DEFAULT_LEAD_DAYS,
    lead_miles: DEFAULT_LEAD_MILES,
    source: 'generic',
  };
}

/** The latest service of this category, as a new rule's starting point (same idea as FR-022). */
export function baselineFromRecords(
  records: readonly { kind: string; category: string; performed_on: string; odometer: number | null }[],
  category: ServiceCategory,
): { last_done_on: string; last_done_odometer: number | null } | null {
  let best: (typeof records)[number] | null = null;
  for (const r of records) if (r.kind === 'service' && r.category === category && (!best || r.performed_on > best.performed_on)) best = r;
  return best ? { last_done_on: best.performed_on, last_done_odometer: best.odometer } : null;
}
