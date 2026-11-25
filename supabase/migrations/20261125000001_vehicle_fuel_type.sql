-- 002 FR-001: every vehicle has a fuel type. Existing rows and inserts that leave it out
-- (older app versions) get 'gasoline'. A check on text, like the other 001 enums.
alter table public.vehicles
  add column fuel_type text not null default 'gasoline'
  constraint vehicles_fuel_type_check
  check (fuel_type in ('gasoline', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'flex', 'other'));
