# Contract: Remote app configuration (`app_config` table)

The app reads this table once on launch and again on every foreground. It caches the values on the device.

If the config can't be fetched, the app uses the **compiled defaults** shown below. Every key is optional; when a key is missing, its default applies.

| key | type | default | purpose |
|---|---|---|---|
| `monetization_enabled` | boolean | `true` | **Kill switch (FR-028).** When `false`, the paywall never shows, RevenueCat isn't configured, and everyone gets the `free` limits. Server-side gates also treat everyone as free. |
| `limits` | object | `{"free":{"vehicles":1,"scans_per_month":5,"share_links":false,"insights":false},"pro":{"vehicles":null,"scans_per_month":100,"share_links":true,"insights":true}}` | Entitlement limits (FR-031). `null` means unlimited. |
| `pricing_display` | object | `{"monthly":"$3.99","annual":"$24.99","trial_days":7}` | Fallback text only. The real price strings always come from StoreKit through RevenueCat. |
| `ai` | object | `{"enabled":true,"provider":"gemini","model":"gemini-3.6-flash","timeout_ms":30000,"low_confidence":0.7}` | Read only by `extract-receipt`, never by the client. `enabled:false` sends every scan to manual entry (FR-015). |
| `min_supported_version` | string | `"1.0.0"` | If the installed app is older, show a non-blocking "Update available" banner. |
| `support_email` | string | `"denizbes46@gmail.com"` | Kutay's Gmail for now (decided 2026-11-23). Switch to a dedicated address before public launch by changing this row; no app update needed. |
| `legal_urls` | object | `{"privacy":"https://glovebox-app.vercel.app/privacy","terms":"https://glovebox-app.vercel.app/terms"}` | Domain to be decided at deploy time. |
