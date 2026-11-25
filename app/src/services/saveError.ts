// T102 — every save form reports failures the same way: log the real error to the console
// and Sentry, and return the alert text (with the real error appended in development).
import { saveErrorMessage } from '@/domain/errors';
import { captureError } from './sentry';

export function reportSaveError(context: string, err: unknown, friendly: string): string {
  console.error(`[save:${context}]`, err);
  captureError(err);
  return saveErrorMessage(friendly, err, __DEV__);
}
