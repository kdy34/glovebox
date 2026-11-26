// Due items for every active vehicle (T063/T065/T066), from cached query data.
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { qk, useAllRules, useVehicles } from '@/data/queries';
import { listOdometerReadings } from '@/data/repositories/odometer';
import { buildDueItems, type DueItem } from '@/domain/dueItems';
import type { MaintenanceRuleRow, VehicleRow } from '@/data/types';

import { localToday } from './format';
export { localToday };

export type AppDueItem = DueItem<VehicleRow, MaintenanceRuleRow>;

export function useDueItems(): { items: AppDueItem[]; isLoading: boolean } {
  const { data: vehicles = [], isLoading: vLoading } = useVehicles();
  const { data: rules = [], isLoading: rLoading } = useAllRules();
  const readings = useQueries({
    queries: vehicles.map((v) => ({ queryKey: qk.odometer(v.id), queryFn: () => listOdometerReadings(v.id) })),
  });
  const readingsKey = readings.map((q) => q.dataUpdatedAt).join(',');
  const items = useMemo(() => {
    const byVehicle: Record<string, Awaited<ReturnType<typeof listOdometerReadings>>> = {};
    vehicles.forEach((v, i) => { byVehicle[v.id] = readings[i]?.data ?? []; });
    return buildDueItems(vehicles, rules, byVehicle, localToday());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readingsKey tracks the query results
  }, [vehicles, rules, readingsKey]);
  return { items, isLoading: vLoading || rLoading || readings.some((q) => q.isLoading) };
}
