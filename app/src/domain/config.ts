// Remote config (contracts/app-config.md). Pure: parses app_config rows into a typed
// config, falling back to compiled defaults for anything missing or malformed.
// A bad remote value must never crash the app or unlock paid features.

export interface PlanLimits {
  /** null = unlimited */
  vehicles: number | null;
  scansPerMonth: number | null;
  shareLinks: boolean;
  insights: boolean;
}

export interface AppConfig {
  monetizationEnabled: boolean;
  limits: { free: PlanLimits; pro: PlanLimits };
  pricingDisplay: { monthly: string; annual: string; trialDays: number };
  minSupportedVersion: string;
  supportEmail: string;
  legalUrls: { privacy: string; terms: string };
}

export const DEFAULT_CONFIG: AppConfig = Object.freeze({
  monetizationEnabled: true,
  limits: {
    free: { vehicles: 1, scansPerMonth: 5, shareLinks: false, insights: false },
    pro: { vehicles: null, scansPerMonth: 100, shareLinks: true, insights: true },
  },
  pricingDisplay: { monthly: '$3.99', annual: '$24.99', trialDays: 7 },
  minSupportedVersion: '1.0.0',
  supportEmail: 'denizbes46@gmail.com',
  legalUrls: {
    privacy: 'https://glovebox-app.vercel.app/privacy',
    terms: 'https://glovebox-app.vercel.app/terms',
  },
}) as AppConfig;

export interface ConfigRow {
  key: string;
  value: unknown;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number | null => v === null || (Number.isInteger(v) && (v as number) >= 0);
const isUrl = (v: unknown): v is string => typeof v === 'string' && /^https:\/\/\S+$/.test(v);

function parseLimits(v: unknown): PlanLimits | undefined {
  if (!isObj(v)) return undefined;
  const { vehicles, scans_per_month, share_links, insights } = v;
  if (!isCount(vehicles) || !isCount(scans_per_month)) return undefined;
  if (typeof share_links !== 'boolean' || typeof insights !== 'boolean') return undefined;
  return { vehicles, scansPerMonth: scans_per_month, shareLinks: share_links, insights };
}

export function resolveConfig(rows: readonly ConfigRow[] | undefined): AppConfig {
  const c: AppConfig = structuredClone(DEFAULT_CONFIG);
  for (const { key, value } of rows ?? []) {
    switch (key) {
      case 'monetization_enabled':
        if (typeof value === 'boolean') c.monetizationEnabled = value;
        break;
      case 'limits': {
        if (!isObj(value)) break;
        const free = parseLimits(value.free);
        const pro = parseLimits(value.pro);
        if (free && pro) c.limits = { free, pro };
        break;
      }
      case 'pricing_display':
        if (isObj(value) && typeof value.monthly === 'string' && typeof value.annual === 'string'
          && Number.isInteger(value.trial_days)) {
          c.pricingDisplay = { monthly: value.monthly, annual: value.annual, trialDays: value.trial_days as number };
        }
        break;
      case 'min_supported_version':
        if (typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value)) c.minSupportedVersion = value;
        break;
      case 'support_email':
        if (typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) c.supportEmail = value;
        break;
      case 'legal_urls':
        if (isObj(value) && isUrl(value.privacy) && isUrl(value.terms)) {
          c.legalUrls = { privacy: value.privacy, terms: value.terms };
        }
        break;
      default:
        break; // unknown keys are ignored (forward compatible)
    }
  }
  return c;
}

/** Semver compare: -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
