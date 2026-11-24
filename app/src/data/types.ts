// Database types. Regenerate after any migration:
//   npx supabase gen types typescript --local > app/src/data/types.ts
// Hand-written v1 below mirrors data-model.md so the app compiles before generation.

type Ts = string; // timestamptz ISO string
type DateStr = string; // YYYY-MM-DD

interface Table<Row, Insert = Partial<Row>, Update = Partial<Row>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface VehicleRow {
  id: string; user_id: string; nickname: string | null; year: number; make: string; model: string;
  trim: string | null; vin: string | null; odometer_unit: 'mi' | 'km'; photo_path: string | null;
  status: 'active' | 'archived'; archived_at: Ts | null; created_at: Ts; updated_at: Ts;
}
export interface RecordRow {
  id: string; user_id: string; vehicle_id: string; kind: 'service' | 'expense'; category: string; title: string;
  performed_on: DateStr; odometer: number | null; shop_name: string | null; shop_address: string | null;
  is_diy: boolean; currency: string; subtotal_cents: number; tax_cents: number; total_cents: number;
  notes: string | null; source: 'manual' | 'ai'; extraction_id: string | null; created_at: Ts; updated_at: Ts;
}
export interface LineItemRow {
  id: string; user_id: string; record_id: string; position: number; item_type: 'part' | 'labor' | 'fee' | 'discount';
  description: string; quantity: number; unit_price_cents: number; amount_cents: number; created_at: Ts;
}
export interface OdometerRow {
  id: string; user_id: string; vehicle_id: string; value: number; unit: 'mi' | 'km'; read_on: DateStr;
  source: 'manual' | 'record' | 'receipt'; record_id: string | null; is_excluded: boolean; created_at: Ts; updated_at: Ts;
}
export interface RuleRow {
  id: string; user_id: string; vehicle_id: string; name: string; service_category: string;
  interval_miles: number | null; interval_months: number | null; lead_days: number; lead_miles: number;
  source: 'generic' | 'owners_manual' | 'user'; last_done_on: DateStr | null; last_done_odometer: number | null;
  is_active: boolean; created_at: Ts; updated_at: Ts;
}
export interface AttachmentRow {
  id: string; user_id: string; vehicle_id: string; record_id: string | null; bucket: 'receipts';
  storage_path: string; mime_type: string; bytes: number; sha256: string | null; created_at: Ts;
}
export interface ShareLinkRow {
  id: string; user_id: string; vehicle_id: string; token: string; include_costs: boolean; include_images: boolean;
  view_count: number; revoked_at: Ts | null; created_at: Ts;
}
export interface ProfileRow {
  id: string; display_name: string | null; distance_unit: 'mi' | 'km'; reminder_lead_days: number;
  notifications_enabled: boolean; onboarding_completed_at: Ts | null; created_at: Ts; updated_at: Ts;
}

export interface Database {
  public: {
    Tables: {
      vehicles: Table<VehicleRow>;
      service_records: Table<RecordRow>;
      line_items: Table<LineItemRow>;
      odometer_readings: Table<OdometerRow>;
      maintenance_rules: Table<RuleRow>;
      attachments: Table<AttachmentRow>;
      share_links: Table<ShareLinkRow>;
      profiles: Table<ProfileRow>;
      receipt_extractions: Table<{ id: string; user_id: string; attachment_id: string; status: string; draft: unknown; error_code: string | null; corrected_fields: string[]; created_at: Ts }>;
      usage_counters: Table<{ user_id: string; period: DateStr; scans: number }>;
      entitlements: Table<{ user_id: string; is_pro: boolean; product_id: string | null; expires_at: Ts | null; updated_at: Ts }>;
      app_config: Table<{ key: string; value: unknown; updated_at: Ts }>;
    };
    Views: Record<string, never>;
    Functions: {
      save_record: { Args: { p_record: Record<string, unknown>; p_items: Record<string, unknown>[] }; Returns: RecordRow };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
