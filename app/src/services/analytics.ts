// Product analytics (FR-032, research R11). Only allowlisted events with non-personal
// properties. No receipt content, no names, no VINs, no IDFA (no ATT prompt needed).
import PostHog from 'posthog-react-native';
import Constants from 'expo-constants';

type Events = {
  signup_completed: { method: 'apple' | 'email' };
  vehicle_added: { via: 'vin' | 'manual' };
  record_saved: { source: 'manual' | 'ai'; kind: 'service' | 'expense' };
  scan_started: Record<string, never>;
  scan_succeeded: { latency_bucket: '<5s' | '5-15s' | '>15s'; corrected_fields: number };
  scan_failed: { code: string };
  reminder_created: { source: 'generic' | 'owners_manual' | 'user' };
  report_generated: { include_costs: boolean; include_images: boolean };
  share_link_created: Record<string, never>;
  paywall_viewed: { trigger: string };
  purchase_completed: { product: 'monthly' | 'annual' };
};

const key = (Constants.expoConfig?.extra as { posthogKey?: string } | undefined)?.posthogKey;
let client: PostHog | null = null;

export function initAnalytics(): void {
  if (!key || client) return;
  client = new PostHog(key, {
    host: 'https://us.i.posthog.com',
    captureAppLifecycleEvents: true,
    disableGeoip: true,
  });
}

export function track<E extends keyof Events>(event: E, props: Events[E]): void {
  client?.capture(event, props as Record<string, string | number | boolean>);
}

/** Uses the Supabase user id (random UUID), never email. */
export function identify(userId: string): void {
  client?.identify(userId);
}

export function resetAnalytics(): void {
  client?.reset();
}
