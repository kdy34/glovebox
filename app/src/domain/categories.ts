// Record categories (data-model.md "Enums") and the Insights grouping (US4).

export const SERVICE_CATEGORIES = [
  'oil_change', 'tire_rotation', 'tires', 'brakes', 'battery', 'filters',
  'fluids', 'inspection', 'repair', 'body', 'other_maintenance',
] as const;
export const EXPENSE_CATEGORIES = ['fuel', 'insurance', 'registration', 'parking_tolls', 'other_expense'] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type Category = ServiceCategory | ExpenseCategory;
export type RecordKind = 'service' | 'expense';

export type InsightsGroup = 'maintenance' | 'repair' | 'tires' | 'fuel' | 'insurance' | 'registration' | 'other';

export const INSIGHTS_GROUP: Record<Category, InsightsGroup> = {
  oil_change: 'maintenance', tire_rotation: 'maintenance', filters: 'maintenance', fluids: 'maintenance',
  battery: 'maintenance', inspection: 'maintenance', other_maintenance: 'maintenance',
  repair: 'repair', brakes: 'repair', body: 'repair',
  tires: 'tires',
  fuel: 'fuel', insurance: 'insurance', registration: 'registration',
  parking_tolls: 'other', other_expense: 'other',
};

export function kindOf(category: Category): RecordKind {
  return (SERVICE_CATEGORIES as readonly string[]).includes(category) ? 'service' : 'expense';
}

/** i18n keys live in src/i18n/en.json under "category.<id>". */
export const categoryLabelKey = (c: Category) => `category.${c}` as const;
