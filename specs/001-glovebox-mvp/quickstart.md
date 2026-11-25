# Quickstart: Run, validate and ship Glovebox

This guide is written for Kutay, on a Mac. Steps marked 🧾 cost money or need an account.

## 0. Accounts to create (in this order)

| # | Account | Why | Cost (verify) |
|---|---|---|---|
| 1 | 🧾 Apple Developer Program, enrolled as an **Individual** | TestFlight and the App Store | ~$99/yr |
| 2 | Supabase | Database, auth, storage, functions | Free for development; Pro ~$25/mo at launch |
| 3 | Google AI Studio, with a paid-tier Gemini API key | Receipt extraction | Pay as you go |
| 4 | RevenueCat | Subscriptions | Free up to a revenue threshold |
| 5 | Expo (EAS) | Cloud builds and submission | Free tier |
| 6 | Sentry and PostHog | Crash reports and analytics | Free tiers |
| 7 | Vercel | `web/` (legal pages and the report viewer) | Free |
| 8 | Gmail `glovebox.app.support@…` | Public support address | Free |

> ⚠️ **F-1:** Before you switch on paid products in App Store Connect, confirm your work authorization with your DSO. Until then, keep `monetization_enabled = false`. The app runs fully free in that mode.

## 1. Local setup

```bash
# prerequisites: Node 22+, Xcode 26.4+, CocoaPods, Supabase CLI, Docker Desktop
cd glovebox
npm i -g eas-cli supabase
cd app && npm install && cd ..

supabase start                       # local Postgres/Auth/Storage
supabase db reset                    # runs migrations + seed
supabase test db                     # pgTAP: RLS + constraints must pass
supabase functions serve --env-file supabase/.env.local
cp app/.env.example app/.env         # EXPO_PUBLIC_SUPABASE_URL / ANON_KEY (local)
cd app && npm test                   # domain unit tests must pass
npx expo run:ios                     # dev build on simulator (VisionKit needs a real device for scanning)
```

Secrets live in `supabase/.env.local` (never committed). Put the same values in the hosted project with `supabase secrets set`:

```
GEMINI_API_KEY=...
REVENUECAT_WEBHOOK_SECRET=...
SITE_ORIGIN=http://localhost:3000
```

## 2. Validate each user story (independent tests from spec.md)

| Story | Do this | Expect |
|---|---|---|
| US1 | Sign up with email. Add a vehicle by VIN (e.g. a 2009 Prius VIN). Log an oil change at 152,300 mi, $64.99. Turn on airplane mode and log another record. Turn airplane mode off. | VIN fields prefill. The timeline shows both records with no duplicates after sync. Sign in on the simulator and the data is there. |
| US2 | Scan 5 real receipts from your own folder. | Each draft arrives in about 15 s or less. Uncertain fields are highlighted. A totals mismatch shows a warning. The non-receipt photo goes to the manual form with the photo attached. |
| US3 | Add a 5,000 mi / 6 mo oil rule and two odometer readings 30 days apart. | The due date and mileage match a hand calculation. Logging an oil change resets the rule. A local notification fires (set the lead time to "now" in dev settings). |
| US4 | Run `npm run seed:demo` (12 months of data) and open Insights. | Totals match `docs/qa/insights-expected.xlsx`. |
| US5 | Generate a report and create a link. Open the link in a private browser window. Revoke it. | The PDF opens. The web view shows no email, no notes, and costs only if you turned them on. After revoking you see "No longer available". |
| US6 | Export, then delete the account. | The ZIP contains JSON, CSV and images. After deletion, signing in again shows an empty garage and old links show "not available". |
| US7 | Use a sandbox tester: hit the 5-scan limit → paywall → subscribe → restore on a 2nd device. Then flip `monetization_enabled` to false. | After subscribing, the Pro limits apply immediately. With the flag off, no paywall appears anywhere and everyone, subscribers included, gets the `free` limits (1 vehicle, 5 scans/month, no share links or insights), enforced on the client and the server ([contracts/app-config.md](contracts/app-config.md)). |
| AI quality | `deno task eval --set docs/qa/receipts/` | Field accuracy is at least 85% and totals are correct for at least 95% (SC-003). |

## 3. Deploy the backend

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy extract-receipt export-data delete-account public-report revenuecat-webhook
supabase secrets set GEMINI_API_KEY=... REVENUECAT_WEBHOOK_SECRET=... SITE_ORIGIN=https://<site>
```

Then, in the Supabase dashboard:
- **Auth → Providers:** enable Apple (Services ID, key, team ID) and Email OTP.
- Set the **SMTP** sender to the support address.

## 4. Deploy `web/`

`vercel deploy web --prod`, then update `app_config.legal_urls` to the deployed URLs.

## 5. App Store Connect

1. Create the app with bundle ID `app.glovebox.ios`, name **Glovebox – Car Service Log** (check that the name is available), and primary category Utilities.
2. Create the subscription group "Glovebox Pro" with `glovebox_pro_monthly` and `glovebox_pro_annual`. Add a 7-day free trial to the annual product. Link both in RevenueCat.
3. Enroll in the App Store Small Business Program.
4. Fill in App Privacy from `docs/app-store/privacy-nutrition.md`.
5. Add the screenshots (6.9" and 6.5"), the description and keywords from `docs/app-store/listing.md`, and the review notes with a demo account from `docs/app-store/review-notes.md`.

## 6. Build and ship

```bash
cd app
eas build --platform ios --profile production
eas submit --platform ios --latest      # goes to TestFlight
```

1. Run a TestFlight beta with at least 10 testers for at least 1 week. Crash-free sessions must be ≥ 99.5% (SC-006).
2. Submit for review.
3. Release manually after approval.

## 7. Later: Android

1. Add `android` config in `app.config.ts`.
2. Create Google Play products and link them in RevenueCat.
3. Run `eas build -p android`.
4. Run a closed test with at least 12 testers for 14 days (requirement for new personal accounts).
5. Promote to production.
