// 002 T003 — NHTSA vPIC `decodevinvaluesextended` responses, trimmed to the fields the decoder
// reads. `recorded` entries are live decodes from 2026-11-25 (002 research.md R1); `synthetic`
// entries use the same shape for FR-002 rows that no live sample hit.
import type { FuelType } from '../../../src/domain/fuelType.ts';

export interface VpicFuelFixture {
  name: string;
  origin: 'recorded' | 'synthetic';
  result: { FuelTypePrimary: string; FuelTypeSecondary: string; ElectrificationLevel: string };
  expected: FuelType | null;
}

export const VPIC_FUEL_FIXTURES: VpicFuelFixture[] = [
  // ElectrificationLevel rows
  { name: '2019 Tesla Model 3 (BEV)', origin: 'recorded', expected: 'electric',
    result: { FuelTypePrimary: 'Electric', FuelTypeSecondary: '', ElectrificationLevel: 'BEV (Battery Electric Vehicle)' } },
  { name: '2012 Nissan Leaf (BEV)', origin: 'recorded', expected: 'electric',
    result: { FuelTypePrimary: 'Electric', FuelTypeSecondary: '', ElectrificationLevel: 'BEV (Battery Electric Vehicle)' } },
  { name: '2011 Chevrolet Volt (PHEV, primary Electric)', origin: 'recorded', expected: 'plug_in_hybrid',
    result: { FuelTypePrimary: 'Electric', FuelTypeSecondary: 'Gasoline', ElectrificationLevel: 'PHEV (Plug-in Hybrid Electric Vehicle)' } },
  { name: '2013 Toyota Prius Plug-in (PHEV)', origin: 'recorded', expected: 'plug_in_hybrid',
    result: { FuelTypePrimary: 'Electric', FuelTypeSecondary: 'Gasoline', ElectrificationLevel: 'PHEV (Plug-in Hybrid Electric Vehicle)' } },
  { name: '2009 Toyota Prius (strong HEV)', origin: 'recorded', expected: 'hybrid',
    result: { FuelTypePrimary: 'Gasoline', FuelTypeSecondary: 'Electric', ElectrificationLevel: 'Strong HEV (Hybrid Electric Vehicle)' } },
  { name: 'mild HEV', origin: 'synthetic', expected: 'hybrid',
    result: { FuelTypePrimary: 'Gasoline', FuelTypeSecondary: '', ElectrificationLevel: 'Mild HEV (Hybrid Electric Vehicle)' } },
  { name: 'HEV, level unknown', origin: 'synthetic', expected: 'hybrid',
    result: { FuelTypePrimary: 'Gasoline', FuelTypeSecondary: '', ElectrificationLevel: 'HEV (Hybrid Electric Vehicle) - Level Unknown' } },
  { name: 'fuel cell (FCEV)', origin: 'synthetic', expected: 'other',
    result: { FuelTypePrimary: 'Hydrogen', FuelTypeSecondary: 'Electric', ElectrificationLevel: 'FCEV (Fuel Cell Electric Vehicle)' } },
  // FuelTypePrimary rows (no ElectrificationLevel)
  { name: 'Electric without a level', origin: 'synthetic', expected: 'electric',
    result: { FuelTypePrimary: 'Electric', FuelTypeSecondary: '', ElectrificationLevel: '' } },
  { name: 'Gasoline + Electric without a level', origin: 'synthetic', expected: 'hybrid',
    result: { FuelTypePrimary: 'Gasoline', FuelTypeSecondary: 'Electric', ElectrificationLevel: '' } },
  { name: '2013 Volkswagen Jetta TDI', origin: 'recorded', expected: 'diesel',
    result: { FuelTypePrimary: 'Diesel', FuelTypeSecondary: '', ElectrificationLevel: '' } },
  { name: '2016 Ford F-250 diesel', origin: 'recorded', expected: 'diesel',
    result: { FuelTypePrimary: 'Diesel', FuelTypeSecondary: '', ElectrificationLevel: '' } },
  { name: '2013 Ford F-150', origin: 'recorded', expected: 'gasoline',
    result: { FuelTypePrimary: 'Gasoline', FuelTypeSecondary: '', ElectrificationLevel: '' } },
  { name: '2013 Chevrolet Tahoe (FFV)', origin: 'recorded', expected: 'flex',
    result: { FuelTypePrimary: 'Flexible Fuel Vehicle (FFV)', FuelTypeSecondary: '', ElectrificationLevel: '' } },
  { name: 'Ethanol (E85)', origin: 'synthetic', expected: 'flex',
    result: { FuelTypePrimary: 'Ethanol (E85)', FuelTypeSecondary: '', ElectrificationLevel: '' } },
  { name: 'CNG', origin: 'synthetic', expected: 'other',
    result: { FuelTypePrimary: 'Compressed Natural Gas (CNG)', FuelTypeSecondary: '', ElectrificationLevel: '' } },
  { name: 'LPG', origin: 'synthetic', expected: 'other',
    result: { FuelTypePrimary: 'Liquefied Petroleum Gas (propane or LPG)', FuelTypeSecondary: '', ElectrificationLevel: '' } },
  // nothing usable
  { name: 'empty fuel fields', origin: 'synthetic', expected: null,
    result: { FuelTypePrimary: '', FuelTypeSecondary: '', ElectrificationLevel: '' } },
  { name: 'Not Applicable', origin: 'synthetic', expected: null,
    result: { FuelTypePrimary: 'Not Applicable', FuelTypeSecondary: '', ElectrificationLevel: 'Not Applicable' } },
];
