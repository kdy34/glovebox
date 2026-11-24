# Feature Specification: Glovebox MVP (v1.0 App Store release)

**Feature Branch**: `001-glovebox-mvp`
**Created**: 2026-11-23
**Status**: Draft
**Input**: "Our final decision is CarKeeper. Build a fully ready, end-user mobile app I can publish to the App Store. That means SQL, backend, front-end, deployment, cloud, security, legal, AI and everything else, with an attractive, professional, end-user-focused design." Decisions taken with Kutay:
- Cloud accounts
- Primary audience: owners who use independent mechanics or do their own maintenance (DIY)
- Freemium from launch
- Product name: **Glovebox**

## Positioning

Glovebox is a maintenance record for the service work that CARFAX never sees: receipts from an independent mechanic and the oil change you did in your driveway. You snap the receipt and get a verified record. You get a reminder before the next service is due. When you sell, you have a clean history to show buyers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Build my garage and log a service by hand (Priority: P1) 🎯 MVP

A new user creates an account, adds a car, and logs a past service manually: date, mileage, shop or "DIY", what was done and what it cost. The car's history appears as a timeline.

**Why this priority**: This is the smallest useful product. It also guarantees Principle III (the app works without AI), and every other story builds on vehicles and service records.

**Independent Test**: On a fresh install, sign up, add a 2009 Toyota Prius, and log "Oil change, 152,300 mi, $64.99, Joe's Auto". The timeline then shows it, and it is still there after signing out and back in on another device.

**Acceptance Scenarios**:
1. **Given** a signed-in user with no vehicles, **When** they enter a VIN, **Then** year, make and model are prefilled from a public VIN decoder, and the user can edit them before saving.
2. **Given** a user without a VIN, **When** they choose year, make and model manually, **Then** the vehicle saves without a VIN.
3. **Given** a vehicle, **When** the user logs a service with one or more line items, **Then** the record appears on the vehicle timeline, newest first, with a total cost equal to the sum of its line items plus tax and fees.
4. **Given** a service record, **When** the user edits or deletes it, **Then** the timeline, cost totals and reminders update immediately.
5. **Given** the device is offline, **When** the user logs a service, **Then** it is saved locally and synced when connectivity returns, without duplicates.

---

### User Story 2 — Snap a receipt and get a verified record (Priority: P2)

The user photographs a paper receipt (or picks a photo or PDF). Within seconds Glovebox shows a draft record:
- shop name and address
- date
- odometer reading
- line items (part or labor, description, quantity, price)
- tax and total

Fields the AI is unsure about are highlighted. The user corrects them and saves. The original image is attached to the record.

**Why this priority**: This is the core differentiator and the reason to choose Glovebox over a spreadsheet. It depends on US1's data model.

**Independent Test**: Scan 20 real independent-shop receipts. The resulting records need no field corrections for at least 85% of fields. Every saved record keeps its original image.

**Acceptance Scenarios**:
1. **Given** a clear receipt photo, **When** extraction finishes, **Then** a draft is shown within 15 seconds (p90) and nothing is saved until the user taps Save.
2. **Given** a field the AI is unsure about, **When** the draft is shown, **Then** that field is visibly flagged and focused for review.
3. **Given** extracted totals that don't add up (line items + tax ≠ total), **When** the draft is shown, **Then** a warning explains the mismatch.
4. **Given** an image that isn't a receipt or can't be read, **When** extraction fails, **Then** the user sees a plain message and a one-tap switch to manual entry with the photo still attached.
5. **Given** the AI service is unavailable or the user is over quota, **When** they scan, **Then** the photo is attached and the manual form opens (FR-015).
6. **Given** a receipt mentions a mileage, **When** it is saved, **Then** the vehicle's odometer history updates if the reading is the newest one.

---

### User Story 3 — Remind me before the next service is due (Priority: P3)

Glovebox keeps maintenance rules per vehicle ("oil change every 5,000 mi or 6 months"). Rules can be suggested from generic intervals, entered by the user from their owner's manual, or created automatically when a service is logged. A push notification arrives before each due date or mileage. Mileage is projected from the user's odometer history.

**Why this priority**: Reminders are why users come back. They turn a filing cabinet into a habit.

**Independent Test**: Log an oil change at 150,000 mi on 1 June, with odometer readings that imply ~1,000 mi/month and a 5,000 mi / 6-month rule. The app shows "due ≈ early Nov or at 155,000 mi" and sends a notification at the user's chosen lead time.

**Acceptance Scenarios**:
1. **Given** a rule with both mileage and time limits, **When** due status is computed, **Then** whichever limit comes first decides the due date.
2. **Given** fewer than two odometer readings, **When** mileage projection is needed, **Then** the app uses only the time limit and asks the user for a current odometer reading.
3. **Given** the user logs the service a rule covers, **When** the record is saved, **Then** that rule's next due date is reset from that service.
4. **Given** generic suggested intervals, **When** they are shown, **Then** they are labelled "generic — check your owner's manual" (Principle II).
5. **Given** notifications are off at the OS level, **When** a reminder comes due, **Then** it still shows as "Due soon" or "Overdue" in the app.

---

### User Story 4 — See what this car really costs me (Priority: P4)

The user sees:
- spending per month and per year
- spending by category (maintenance, repair, tires, fuel, insurance, registration, other)
- cost per mile
- a list of the biggest expenses

**Why this priority**: Cost insight is a clear Pro value driver and a strong "aha" moment. It needs records first.

**Independent Test**: With 12 months of seeded records and odometer readings, the dashboard totals match a hand-calculated spreadsheet to the cent.

**Acceptance Scenarios**:
1. **Given** records across categories, **When** the user opens Insights, **Then** totals per period and category are correct, and each one can be tapped through to the underlying records.
2. **Given** odometer readings spanning a period, **When** cost per mile is shown, **Then** it equals total spend in the period divided by miles driven in the period. With fewer than 100 miles of data it shows "not enough data".
3. **Given** the user logs a non-service expense (for example registration), **Then** it counts toward costs but not toward maintenance history.

---

### User Story 5 — A resale-ready history I can share (Priority: P5)

The user generates a professional PDF "Glovebox Service History" for a vehicle. It includes:
- vehicle details
- an odometer timeline
- every service with date, mileage, shop and work done
- optional receipt thumbnails

The user can share the PDF directly or create a read-only web link that a buyer can open without an account. The user can revoke the link at any time.

**Why this priority**: This is the share moment (the only organic-growth hook) and it proves value at the moment of sale. Every buyer who opens a link sees the Glovebox brand.

**Independent Test**: Generate a report for a vehicle with 10 records. The PDF is under 10 MB and opens on iOS and desktop. A shared link opens in a browser without signing in. After revoking, the link shows "no longer available".

**Acceptance Scenarios**:
1. **Given** a vehicle with records, **When** the user generates a report, **Then** they can choose whether to include costs and receipt images before sharing.
2. **Given** a shared link, **When** anyone opens it, **Then** they see only that vehicle's report, never the owner's email, other vehicles, or receipt images the owner excluded.
3. **Given** a free-tier user, **When** they generate a report, **Then** it carries a small "Made with Glovebox" footer. Pro reports carry a cleaner footer (see FR-031).

---

### User Story 6 — My account, my data (Priority: P2, required for launch)

The user signs up with Sign in with Apple or email. They can export everything and delete their account in-app. Deleting removes all of their rows and files, and cancels share links. Store subscriptions are cancelled through Apple, and the app explains how.

**Why this priority**: App Store review requires in-app account deletion. Principle I requires export. A launch is blocked without this.

**Independent Test**: Create an account, add data, export (a ZIP with JSON/CSV plus images), delete the account. Signing in again creates an empty account, the storage bucket holds no files for the old user id, and old share links return "not available".

**Acceptance Scenarios**:
1. **Given** a user requests deletion, **When** they confirm twice, **Then** all their data is removed within 24 hours (immediately for database rows) and they are signed out.
2. **Given** an active subscription, **When** the user deletes the account, **Then** the app tells them how to cancel the subscription in Apple settings before confirming.

---

### User Story 7 — Glovebox Pro (Priority: P6)

Free users get a generous core. Pro unlocks:
- more vehicles
- more receipt scans
- insights
- branded reports and share links
- cloud receipt storage beyond the free cap

Purchase, restore and cancel follow store rules. Monetization can be turned off remotely (constitution: work-authorization constraint).

**Why this priority**: Revenue matters, but the product must be worth paying for first.

**Independent Test**: In the App Store sandbox, a free user hits the scan limit, sees the paywall, subscribes, and the limit lifts immediately. Restore works on a second device. When the remote "monetization off" flag is set, the paywall never appears and everyone gets free-tier behaviour without crashes.

**Acceptance Scenarios**:
1. **Given** a free user at a limit, **When** they try the gated action, **Then** a paywall explains what Pro adds, the price and the renewal terms, with Restore and links to the Terms and Privacy Policy.
2. **Given** a Pro subscription lapses, **When** the user is back on free, **Then** no data is deleted. Over-limit items stay readable but can't be added to.

### Edge Cases

- Receipts:
  - A receipt covers two vehicles.
  - A receipt is handwritten.
  - A receipt is split across two photos.
  - A receipt has a negative line (coupon or core refund).
  - A receipt image contains text that tries to give instructions to the AI (prompt injection). The AI output MUST be treated as untrusted data and validated against a strict schema.
- Odometer:
  - A new reading is lower than the previous one (typo or replaced cluster). Warn, allow override, and exclude it from projections.
  - The unit is km (imported car). Store the unit with the reading.
- A user sells a car: archive the vehicle and keep its history and report link.
- Duplicate scan of the same receipt: detect a likely duplicate (same date, shop and total) and ask.
- A very large photo or PDF: compress on the device, reject files over the size cap with a clear message.
- Clock or time zone changes: dates are stored as calendar dates, not timestamps, for services.

## Requirements *(mandatory)*

### Functional Requirements

**Accounts & data**
- **FR-001**: Users MUST be able to sign up and sign in with Sign in with Apple and with email (magic link or password).
- **FR-002**: Users MUST be able to delete their account and all associated data in-app (US6).
- **FR-003**: Users MUST be able to export all their data as a ZIP (JSON + CSV + original images).
- **FR-004**: Each user's data MUST be visible only to that user, except through explicit share links.

**Vehicles & records**
- **FR-005**: Users MUST be able to add, edit, archive and delete vehicles. Fields:
  - nickname, year, make, model, trim
  - VIN (optional, validated)
  - photo (optional)
  - odometer unit
- **FR-006**: The app MUST decode a 17-character VIN to year, make, model and trim using a free public decoder, and fall back gracefully if the decoder is unavailable.
- **FR-007**: Users MUST be able to create, edit and delete service records. Fields:
  - date, odometer, shop (or DIY), category
  - line items (type part/labor/fee/discount, description, qty, unit price)
  - tax, total, notes
  - attachments
- **FR-008**: Users MUST be able to log non-service expenses (fuel, insurance, registration, parking/tolls, other) that count toward costs.
- **FR-009**: Users MUST be able to record odometer readings, and records carrying a mileage MUST add a reading automatically.
- **FR-010**: Core flows MUST work offline and sync without duplicates when back online.

**AI receipt capture**
- **FR-011**: Users MUST be able to capture a receipt with the camera (with edge detection and cropping) or import an image or PDF.
- **FR-012**: The system MUST extract a structured draft (shop, date, odometer, line items, tax, total) with a per-field confidence score, and MUST validate it against a strict schema on the server before returning it.
- **FR-013**: The app MUST show low-confidence fields as flagged and MUST NOT save anything without user confirmation.
- **FR-014**: The system MUST check that the arithmetic adds up and flag mismatches.
- **FR-015**: If extraction fails, times out (>30 s) or the user is over quota, the app MUST fall back to manual entry with the image attached.
- **FR-016**: Receipt images MUST be stored privately and served only through short-lived signed URLs.
- **FR-017**: The system MUST enforce per-user scan quotas and rate limits on the server.

**Reminders**
- **FR-018**: Users MUST be able to create maintenance rules per vehicle with a mileage interval, a time interval, or both, and a lead time.
- **FR-019**: The app MUST offer a starter set of generic rules (oil, tire rotation, brake inspection, cabin/engine air filter, coolant, battery check, wipers, inspection/registration renewal), clearly labelled as generic.
- **FR-020**: The system MUST compute each rule's next due date and mileage using whichever limit comes first and projected mileage from odometer history.
- **FR-021**: The system MUST send local or push notifications at the lead time and MUST show in-app Due soon / Overdue states regardless of notification permission.
- **FR-022**: Saving a record that matches a rule's service category MUST reset that rule.

**Insights**
- **FR-023**: The app MUST show spend by month and year, by category, cost per mile and the top expenses, for each vehicle and across all vehicles.

**Reports & sharing**
- **FR-024**: Users MUST be able to generate a branded PDF service history per vehicle, choosing whether to include costs and receipt images.
- **FR-025**: Users MUST be able to create, copy and revoke a read-only web link for a vehicle report. The link MUST use an unguessable token and expose no other data.

**Monetization**
- **FR-026**: The app MUST support a Pro subscription (monthly and annual) and possibly a lifetime purchase through native store billing, with purchase, restore and cancel guidance.
- **FR-027**: Entitlements MUST be verified on the server for gated server actions (scan quota, share links).
- **FR-028**: A remote configuration flag MUST be able to disable all monetization surfaces without an app update.

**Trust & legal**
- **FR-029**: The app MUST include an in-app Privacy Policy, Terms of Use, an "AI may make mistakes, review before saving" notice, and a support contact.
- **FR-030**: The app MUST ask for camera, photos and notification permissions only at the moment they are first needed, with a pre-prompt explaining why.
- **FR-031**: Free vs Pro limits and pricing:

  | | Free | Pro |
  |---|---|---|
  | Active vehicles | 1 | Unlimited |
  | AI scans per month | 5 | 100 (fair-use cap) |
  | Manual records | Unlimited | Unlimited |
  | Reminders | Yes | Yes |
  | PDF report | Basic, with "Made with Glovebox" footer | Clean branded PDF |
  | Insights | No | Yes |
  | Share links | No | Yes |

  Pro costs **$3.99/month** or **$24.99/year**, with a 7-day free trial on the annual plan. All limits and prices are remote-configurable.

**Quality**
- **FR-032**: The app MUST capture crashes and anonymous product analytics, with no receipt contents and no personal data in analytics events.
- **FR-033**: The app MUST support light and dark mode, Dynamic Type and VoiceOver.
- **FR-034**: The v1 UI MUST be in English only. All user-facing strings MUST be externalized, so that more languages (Turkish first) can be added without code changes.

### Key Entities

- **User / Profile**: account identity, display name, preferences (units, reminder lead time, notification opt-in), entitlement state.
- **Vehicle**: belongs to a user; identity (VIN, year/make/model/trim, nickname, photo), status (active/archived), odometer unit.
- **OdometerReading**: belongs to a vehicle; value, unit, date, source (manual / record / receipt).
- **ServiceRecord**: belongs to a vehicle.
  - Fields: date, odometer, shop (name, address or DIY), category, kind (service / expense), subtotal, tax, total, notes, source (manual / AI-assisted).
  - Has many **LineItems** (type, description, quantity, unit price, amount).
  - Has many **Attachments**.
- **Attachment**: a private stored file (receipt image/PDF) linked to a record.
- **ReceiptExtraction**: one AI attempt for an attachment.
  - Fields: status, draft payload, per-field confidence, model used, latency, error.
  - Kept for quality measurement. Deleted together with the user.
- **MaintenanceRule**: belongs to a vehicle; name, service category, mileage interval, months interval, lead time, source (generic / owner's manual / user), last done date and odometer, computed next due.
- **Reminder/Notification**: scheduled alert derived from a rule.
- **ShareLink**: belongs to a vehicle; token, options (costs on/off, images on/off), created and revoked dates, view count.
- **UsageCounter**: per-user, per-month scan count, used for quotas.

## Success Criteria *(mandatory)*

- **SC-001**: A first-time user can sign up, add a car and log their first service in under 3 minutes (median, usability test with 5 people).
- **SC-002**: Receipt capture to saved record takes under 60 seconds (median) for a typical one-page receipt.
- **SC-003**: On a test set of at least 30 real independent-shop and DIY receipts, at least 85% of extracted fields need no correction, and totals are correct for at least 95%.
- **SC-004**: Reminder due dates match hand calculations in 100% of reminder-engine test cases.
- **SC-005**: Cost insight totals match a hand-computed spreadsheet to the cent.
- **SC-006**: Crash-free sessions are at least 99.5% during the TestFlight beta.
- **SC-007**: The app passes App Store review with no rejections for privacy, account deletion, or subscription disclosure.
- **SC-008**: AI cost per active user stays under $0.10 per month at the default free limits.
- **SC-009**: Within 30 days of launch, at least 25% of new users have logged 2 or more records, and at least 10% of reports generated are shared as a link (traction signal).

## Assumptions

- US market, miles and USD for v1. Data model stores units so km and other currencies can come later.
- Primary audience: owners who use independent mechanics or do their own maintenance, with older or used cars.
- Generic maintenance intervals are a conservative, clearly labelled starter set. We do not license manufacturer schedule data in v1. Users can enter owner's-manual intervals.
- The VIN decoder is the free NHTSA vPIC service.
- One user per account in v1. Shared household garages are out of scope.
- No OBD-II hardware, no fuel-price data, no mechanic marketplace, and no predictive failure models in v1 (constitution Principle II).
- Ads are out of scope for v1 (Pro subscription only). AdMob may be revisited later.
- The developer publishes under an individual Apple Developer account. Monetization is wired but controlled by a remote kill switch (constitution: work authorization).
- Legal texts (privacy policy, terms) are drafted as plain-language templates and must be reviewed by the owner. They are not legal advice.
- Public support contact is the owner's Gmail for now (decided 2026-11-23), stored in `app_config.support_email` so it can be switched to a dedicated address before public launch without an app update. Legal pages are hosted on a simple public web page that the owner controls.

## Clarifications

### Session 2026-11-23
- Q: Where does user data live? → A: Cloud accounts with sync across devices.
- Q: Who is the primary audience? → A: Owners who use independent mechanics or do their own maintenance (DIY).
- Q: How is the app monetized at launch? → A: Freemium from day one. Monetization stays behind a remote kill switch, and the owner accepts responsibility for confirming work authorization.
- Q: Product name? → A: Glovebox. App Store name availability is checked before submission.
- Q: Free/Pro limits and price? → A: Free = 1 vehicle and 5 scans/month. Pro = $3.99/month or $24.99/year with a 7-day trial (FR-031).
- Q: UI language? → A: English only in v1, i18n-ready (FR-034).
- Q: Public support contact? → A: A dedicated Glovebox email address. Update 2026-11-23: Kutay's personal Gmail is used for now (changeable through `app_config.support_email`).
