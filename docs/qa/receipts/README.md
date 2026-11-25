# Receipt golden set (SC-003)

SC-003: on at least 30 real independent-shop and DIY receipts, at least 85% of extracted fields
need no correction, and the total is right on at least 95%. This folder holds that set **on your
machine only**. The `.gitignore` here keeps every receipt and answer file out of git, because real
receipts carry shop names, addresses and sometimes names, VINs or card digits.

## Add a receipt

1. Save the photo or PDF here as `<name>.jpg`, `.png` or `.pdf`. Use a neutral name such as
   `shop-07-brakes.jpg`. Crop or black out anything personal that isn't needed: the provider
   still has to read the shop, date, mileage, lines, tax and total.
2. Write `<name>.expected.json` with the values a careful person would type from the receipt.
   Copy `example.expected.json` (synthetic) as a start:
   - `fields`: any of `shop_name`, `shop_address`, `performed_on` (YYYY-MM-DD), `odometer`,
     `subtotal_cents`, `tax_cents`, `total_cents` (integer cents), `suggested_category`,
     `is_diy_purchase`. Only the fields you list are scored. Use `null` for "not on the receipt".
   - `line_item_amounts_cents`: every line's amount in cents (discounts negative), any order.
3. Aim for a realistic mix: independent shops, dealers, parts-store DIY purchases, handwritten
   invoices, faded thermal paper, two-page PDFs.

## Run

```bash
cd supabase/functions
GEMINI_API_KEY=… deno task eval              # this folder
GEMINI_API_KEY=… deno task eval /path/to/set # another folder
GEMINI_MODEL=gemini-3.6-flash …              # optional; default gemini-3.6-flash
```

It uses the production prompt, response schema, validation and post-processing
(`supabase/functions/_shared/ai/`), so a prompt change can be measured before it ships. It prints
one row per receipt (fields right, total ok, latency, which fields were wrong) and the summary:
field accuracy, totals accuracy, latency p50/p90. It exits 1 if a target is missed.

Scoring (`_shared/ai/evalScore.ts`, unit-tested): text fields compare without case and
punctuation; numbers, dates and booleans must match exactly; each expected line amount is one
field, and extra or missing lines mark `line_items` wrong. Latency here is the provider call
only; the app's 15 s p90 target (US2 AS1) also includes upload and the function.

Each run uses real API calls (cost) but no app scan quota.
