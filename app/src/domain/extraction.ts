// AI draft → record form values (T053; US2, FR-013/FR-014). The draft is untrusted data that
// already passed the schema; this turns it into values save_record and the DB accept, and
// lists which fields the user should check first.
import { DRAFT_CATEGORIES, type ExtractionDraft } from './extractionSchema';
import { kindOf, type Category, type RecordKind } from './categories';
import { lineAmountCents } from './money';

export type ItemType = 'part' | 'labor' | 'fee' | 'discount';

export interface DraftItem {
  id: string;
  item_type: ItemType;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

/** Form flags: a field key, or `item:<id>` for a line item. */
export type FormFlag = 'category' | 'performed_on' | 'odometer' | 'shop_name' | 'shop_address' | 'is_diy' | 'tax_cents' | `item:${string}`;

export interface DraftForm {
  kind: RecordKind;
  category: Category;
  title: string | null;
  performedOn: string;
  odometer: string;
  shopName: string;
  shopAddress: string;
  isDiy: boolean;
  taxCents: number | null;
  /** The printed total, for the mismatch banner. Not saved: the record total is items + tax. */
  receiptTotalCents: number | null;
  items: DraftItem[];
  /** Fields to check, in the order they appear in the form. */
  flags: FormFlag[];
  warnings: ExtractionDraft['warnings'];
}

// DB limits (data-model.md): shop_name ≤ 120, shop_address ≤ 240, title ≤ 120, description 1–200.
const cut = (s: string | null | undefined, max: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const FIELD_FLAG: Record<string, FormFlag> = {
  suggested_category: 'category',
  performed_on: 'performed_on',
  odometer: 'odometer',
  shop_name: 'shop_name',
  shop_address: 'shop_address',
  is_diy_purchase: 'is_diy',
  tax_cents: 'tax_cents',
};
const FLAG_ORDER: readonly FormFlag[] = ['category', 'performed_on', 'odometer', 'shop_name', 'shop_address', 'is_diy'];

function normalizeItem(li: ExtractionDraft['line_items'][number], id: string): { item: DraftItem; suspect: boolean } {
  let itemType: ItemType = li.item_type;
  let quantity = Math.round(li.quantity * 1000) / 1000;
  if (!(quantity > 0)) quantity = 1;
  let unit = li.unit_price_cents;
  let amount = li.amount_cents;
  if (itemType !== 'discount' && amount < 0) itemType = 'discount';
  if (itemType === 'discount') { unit = -Math.abs(unit); amount = -Math.abs(amount); }
  let suspect = false;
  if (lineAmountCents(quantity, unit) !== amount) {
    // Keep the printed line amount (it is what adds up to the total); show it as 1 × amount.
    quantity = 1;
    unit = amount;
    suspect = true;
  }
  const description = cut(li.description, 200);
  if (!description) suspect = true;
  return { item: { id, item_type: itemType, description, quantity, unit_price_cents: unit, amount_cents: amount }, suspect };
}

export function draftToForm(
  draft: ExtractionDraft,
  lowConfidence: readonly string[],
  opts: { today: string; newId: () => string },
): DraftForm {
  const f = draft.fields;
  const flags = new Set<FormFlag>();
  for (const name of lowConfidence) {
    const flag = FIELD_FLAG[name];
    if (flag) flags.add(flag);
  }

  const cat = f.suggested_category.value;
  const category: Category = cat && (DRAFT_CATEGORIES as readonly string[]).includes(cat) ? cat : 'other_maintenance';
  if (!cat) flags.add('category');

  let performedOn = f.performed_on.value ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performedOn) || performedOn > opts.today) {
    performedOn = opts.today;
    flags.add('performed_on');
  }
  if (draft.warnings.includes('date_ambiguous')) flags.add('performed_on');

  const odo = f.odometer.value;
  const odometer = odo !== null && odo > 0 ? String(odo) : '';
  if (odo !== null && odo <= 0) flags.add('odometer');

  const tax = f.tax_cents.value;
  const taxCents = tax !== null && tax >= 0 ? tax : null;
  if (tax !== null && tax < 0) flags.add('tax_cents');

  const itemFlags: FormFlag[] = [];
  const items = draft.line_items.map((li, i) => {
    const { item, suspect } = normalizeItem(li, opts.newId());
    if (suspect || lowConfidence.includes(`line_items[${i}]`)) itemFlags.push(`item:${item.id}`);
    return item;
  });

  // DIY detection default: the model's answer if it has one; otherwise parts and no labor.
  let isDiy: boolean;
  if (f.is_diy_purchase.value !== null) isDiy = f.is_diy_purchase.value;
  else {
    isDiy = items.length > 0 && !items.some((it) => it.item_type === 'labor');
    flags.add('is_diy');
  }

  const title = cut(f.suggested_title.value, 120) || null;
  const total = f.total_cents.value;

  return {
    kind: kindOf(category),
    category,
    title,
    performedOn,
    odometer,
    shopName: cut(f.shop_name.value, 120),
    shopAddress: cut(f.shop_address.value, 240),
    isDiy,
    taxCents,
    receiptTotalCents: total !== null && total >= 0 ? total : null,
    items,
    flags: [...FLAG_ORDER.filter((k) => flags.has(k)), ...itemFlags, ...(flags.has('tax_cents') ? ['tax_cents' as const] : [])],
    warnings: [...draft.warnings],
  };
}

/** FR-014: the printed total disagrees with line items + tax by more than one cent. */
export function formTotalsMismatch(subtotalCents: number, taxCents: number | null, receiptTotalCents: number | null): boolean {
  if (receiptTotalCents === null) return false;
  return Math.abs(subtotalCents + (taxCents ?? 0) - receiptTotalCents) > 1;
}

const sameItem = (a: DraftItem, b: DraftItem) =>
  a.item_type === b.item_type && a.description === b.description && a.quantity === b.quantity &&
  a.unit_price_cents === b.unit_price_cents && a.amount_cents === b.amount_cents;

/** Draft field names the user changed before saving (receipt_extractions.corrected_fields, SC-003). */
export function correctedFields(initial: DraftForm, final: DraftForm): string[] {
  const out: string[] = [];
  if (initial.category !== final.category) out.push('suggested_category');
  if (initial.performedOn !== final.performedOn) out.push('performed_on');
  if (initial.odometer !== final.odometer) out.push('odometer');
  if (initial.shopName !== final.shopName) out.push('shop_name');
  if (initial.shopAddress !== final.shopAddress) out.push('shop_address');
  if (initial.isDiy !== final.isDiy) out.push('is_diy_purchase');
  if (initial.taxCents !== final.taxCents) out.push('tax_cents');
  const finalById = new Map(final.items.map((it) => [it.id, it]));
  initial.items.forEach((it, i) => {
    const now = finalById.get(it.id);
    if (!now || !sameItem(it, now)) out.push(`line_items[${i}]`);
  });
  const initialIds = new Set(initial.items.map((it) => it.id));
  if (final.items.some((it) => !initialIds.has(it.id))) out.push('line_items[new]');
  return out;
}
