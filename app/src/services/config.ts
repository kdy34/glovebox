// Remote config service (T020): fetch app_config, cache it, fall back to compiled defaults.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { resolveConfig, type AppConfig, type ConfigRow } from '@/domain/config';
import { supabase } from '@/data/supabase';

const CACHE_KEY = 'glovebox.app_config.v1';

async function fetchConfig(): Promise<AppConfig> {
  const { data, error } = await supabase.from('app_config').select('key, value');
  if (error || !data) {
    const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
    return resolveConfig(cached ? (JSON.parse(cached) as ConfigRow[]) : undefined);
  }
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => undefined);
  return resolveConfig(data as ConfigRow[]);
}

/** Refetched on every app foreground (TanStack Query focus manager is wired in _layout). */
export function useAppConfig(): AppConfig {
  const { data } = useQuery({ queryKey: ['app_config'], queryFn: fetchConfig, staleTime: 5 * 60_000 });
  return data ?? resolveConfig(undefined);
}
