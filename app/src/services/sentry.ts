// Crash reporting (FR-032). PII scrubbing on; never attach receipt images or record contents.
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn = (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn;

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0.1,
    beforeBreadcrumb(crumb) {
      // Drop network breadcrumbs that could carry query strings or bodies.
      if (crumb.category === 'fetch' || crumb.category === 'xhr') {
        return { ...crumb, data: { method: crumb.data?.method, status_code: crumb.data?.status_code } };
      }
      return crumb;
    },
    beforeSend(event) {
      delete event.user?.email;
      delete event.user?.ip_address;
      if (event.request) delete event.request.data;
      return event;
    },
  });
}

export const captureError = (e: unknown) => Sentry.captureException(e);
export const wrapRoot = Sentry.wrap;
