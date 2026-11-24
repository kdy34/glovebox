// TanStack Query hooks for the app's data layer.
// All keys are stable strings so the cache persists across app restarts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listVehicles, getVehicle, saveVehicle, archiveVehicle, unarchiveVehicle, deleteVehicle, type VehicleInput } from './repositories/vehicles';
import { listRecords, getRecord, getLineItems, saveRecord, deleteRecord, type SaveRecordArgs } from './repositories/records';
import { listOdometerReadings, saveOdometerReading, excludeOdometerReading, type OdometerInput } from './repositories/odometer';

// ─── Vehicles ──────────────────────────────────────────────────────────────

export const qk = {
  vehicles: ['vehicles'] as const,
  vehicle: (id: string) => ['vehicles', id] as const,
  records: (vehicleId: string) => ['records', vehicleId] as const,
  record: (id: string) => ['record', id] as const,
  lineItems: (recordId: string) => ['lineItems', recordId] as const,
  odometer: (vehicleId: string) => ['odometer', vehicleId] as const,
};

export function useVehicles() {
  return useQuery({ queryKey: qk.vehicles, queryFn: listVehicles });
}

export function useVehicle(id: string) {
  return useQuery({ queryKey: qk.vehicle(id), queryFn: () => getVehicle(id), enabled: !!id });
}

export function useSaveVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleInput & { id?: string }) => saveVehicle(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.vehicles });
    },
  });
}

export function useArchiveVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: archiveVehicle,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.vehicles }),
  });
}

export function useUnarchiveVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: unarchiveVehicle,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.vehicles }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteVehicle,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.vehicles }),
  });
}

// ─── Records ───────────────────────────────────────────────────────────────

export function useRecords(vehicleId: string) {
  return useQuery({
    queryKey: qk.records(vehicleId),
    queryFn: () => listRecords(vehicleId),
    enabled: !!vehicleId,
  });
}

export function useRecord(id: string) {
  return useQuery({
    queryKey: qk.record(id),
    queryFn: () => getRecord(id),
    enabled: !!id,
  });
}

export function useLineItems(recordId: string) {
  return useQuery({
    queryKey: qk.lineItems(recordId),
    queryFn: () => getLineItems(recordId),
    enabled: !!recordId,
  });
}

export function useSaveRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveRecord,
    onSuccess: (_, args: SaveRecordArgs) => {
      void qc.invalidateQueries({ queryKey: qk.records(args.record.vehicle_id) });
      void qc.invalidateQueries({ queryKey: qk.odometer(args.record.vehicle_id) });
    },
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; vehicleId: string }) => deleteRecord(args.id),
    onSuccess: (_, args) => {
      void qc.invalidateQueries({ queryKey: qk.records(args.vehicleId) });
    },
  });
}

// ─── Odometer ──────────────────────────────────────────────────────────────

export function useOdometerReadings(vehicleId: string) {
  return useQuery({
    queryKey: qk.odometer(vehicleId),
    queryFn: () => listOdometerReadings(vehicleId),
    enabled: !!vehicleId,
  });
}

export function useSaveOdometerReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OdometerInput & { id?: string }) => saveOdometerReading(input),
    onSuccess: (_, input) => {
      void qc.invalidateQueries({ queryKey: qk.odometer(input.vehicle_id) });
    },
  });
}

export function useExcludeOdometerReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; vehicleId: string }) => excludeOdometerReading(args.id),
    onSuccess: (_, args) => {
      void qc.invalidateQueries({ queryKey: qk.odometer(args.vehicleId) });
    },
  });
}
