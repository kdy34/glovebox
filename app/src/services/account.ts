// Account service (T045): export download + share sheet, delete + local wipe + sign-out.
// The decisions live in src/data/accountFlow.ts (tested); this file only wires in
// Supabase, the file system, the share sheet and local storage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  deleteAccountFlow,
  exportDataFlow,
  type DeleteAccountResult,
  type ExportDataResult,
  type FunctionResult,
} from '@/data/accountFlow';
import { queryClient } from '@/data/queryClient';
import { supabase } from '@/data/supabase';
import { purgeUserOutbox } from '@/data/sync';
import { getAppleAuthorizationCode } from '@/platform/appleAuth';
import { resetAnalytics } from '@/services/analytics';

/** Calls an Edge Function and normalizes the result. Throws only on network failure. */
async function invoke(fn: string, body: Record<string, unknown>): Promise<FunctionResult> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return { ok: true, status: 200, data };
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const parsed = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    return { ok: false, status: res.status, code: parsed?.error?.code ?? 'internal' };
  }
  throw error; // FunctionsFetchError / FunctionsRelayError: treat as offline
}

export async function exportMyData(opts: { dataOnly?: boolean } = {}): Promise<ExportDataResult> {
  return exportDataFlow(
    {
      invoke,
      download: async (url) => {
        const target = new File(Paths.cache, 'glovebox-export.zip');
        if (target.exists) target.delete();
        const file = await File.downloadFileAsync(url, target);
        return file.uri;
      },
      share: async (uri) => {
        await Sharing.shareAsync(uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
      },
    },
    opts,
  );
}

export async function deleteMyAccount(userId: string, isAppleUser: boolean): Promise<DeleteAccountResult> {
  const appleAuthorizationCode = isAppleUser ? ((await getAppleAuthorizationCode()) ?? undefined) : undefined;
  return deleteAccountFlow(
    {
      userId,
      invoke,
      purgeOutbox: purgeUserOutbox,
      clearQueryCache: () => queryClient.clear(),
      clearLocalCaches: () => AsyncStorage.clear(),
      resetAnalytics,
      signOutLocal: async () => {
        await supabase.auth.signOut({ scope: 'local' });
      },
    },
    { appleAuthorizationCode },
  );
}
