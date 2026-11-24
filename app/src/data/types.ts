
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_config": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"attachments": {
                  Row: {
                    "bucket": string,"bytes": number,"created_at": string,"id": string,"mime_type": string,"record_id": string | null,"sha256": string | null,"storage_path": string,"user_id": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket"?: string,"bytes": number,"created_at"?: string,"id"?: string,"mime_type": string,"record_id"?: string | null,"sha256"?: string | null,"storage_path": string,"user_id"?: string,"vehicle_id": string
                  }
                  Update: {
                    "bucket"?: string,"bytes"?: number,"created_at"?: string,"id"?: string,"mime_type"?: string,"record_id"?: string | null,"sha256"?: string | null,"storage_path"?: string,"user_id"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_record_fk"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "service_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"entitlements": {
                  Row: {
                    "expires_at": string | null,"is_pro": boolean,"last_event_id": string | null,"period_type": string | null,"product_id": string | null,"store": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at"?: string | null,"is_pro"?: boolean,"last_event_id"?: string | null,"period_type"?: string | null,"product_id"?: string | null,"store"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "expires_at"?: string | null,"is_pro"?: boolean,"last_event_id"?: string | null,"period_type"?: string | null,"product_id"?: string | null,"store"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"line_items": {
                  Row: {
                    "amount_cents": number,"created_at": string,"description": string,"id": string,"item_type": string,"position": number,"quantity": number,"record_id": string,"unit_price_cents": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"description": string,"id"?: string,"item_type": string,"position"?: number,"quantity"?: number,"record_id": string,"unit_price_cents": number,"user_id"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"description"?: string,"id"?: string,"item_type"?: string,"position"?: number,"quantity"?: number,"record_id"?: string,"unit_price_cents"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "line_items_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "service_records"
      referencedColumns: ["id"]
    }
                  ]
                },"maintenance_rules": {
                  Row: {
                    "created_at": string,"id": string,"interval_miles": number | null,"interval_months": number | null,"is_active": boolean,"last_done_odometer": number | null,"last_done_on": string | null,"lead_days": number,"lead_miles": number,"name": string,"service_category": string,"source": string,"updated_at": string,"user_id": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"interval_miles"?: number | null,"interval_months"?: number | null,"is_active"?: boolean,"last_done_odometer"?: number | null,"last_done_on"?: string | null,"lead_days"?: number,"lead_miles"?: number,"name": string,"service_category": string,"source"?: string,"updated_at"?: string,"user_id"?: string,"vehicle_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"interval_miles"?: number | null,"interval_months"?: number | null,"is_active"?: boolean,"last_done_odometer"?: number | null,"last_done_on"?: string | null,"lead_days"?: number,"lead_miles"?: number,"name"?: string,"service_category"?: string,"source"?: string,"updated_at"?: string,"user_id"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "maintenance_rules_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"odometer_readings": {
                  Row: {
                    "created_at": string,"id": string,"is_excluded": boolean,"read_on": string,"record_id": string | null,"source": string,"unit": string,"updated_at": string,"user_id": string,"value": number,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_excluded"?: boolean,"read_on": string,"record_id"?: string | null,"source"?: string,"unit"?: string,"updated_at"?: string,"user_id"?: string,"value": number,"vehicle_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_excluded"?: boolean,"read_on"?: string,"record_id"?: string | null,"source"?: string,"unit"?: string,"updated_at"?: string,"user_id"?: string,"value"?: number,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "odometer_readings_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "service_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "odometer_readings_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"distance_unit": string,"id": string,"notifications_enabled": boolean,"onboarding_completed_at": string | null,"reminder_lead_days": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"distance_unit"?: string,"id": string,"notifications_enabled"?: boolean,"onboarding_completed_at"?: string | null,"reminder_lead_days"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"distance_unit"?: string,"id"?: string,"notifications_enabled"?: boolean,"onboarding_completed_at"?: string | null,"reminder_lead_days"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"receipt_extractions": {
                  Row: {
                    "attachment_id": string,"corrected_fields": (string)[],"created_at": string,"draft": Json | null,"error_code": string | null,"id": string,"latency_ms": number | null,"model": string,"provider": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attachment_id": string,"corrected_fields"?: (string)[],"created_at"?: string,"draft"?: Json | null,"error_code"?: string | null,"id"?: string,"latency_ms"?: number | null,"model": string,"provider": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "attachment_id"?: string,"corrected_fields"?: (string)[],"created_at"?: string,"draft"?: Json | null,"error_code"?: string | null,"id"?: string,"latency_ms"?: number | null,"model"?: string,"provider"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipt_extractions_attachment_id_fkey"
      columns: ["attachment_id"]
isOneToOne: false
      referencedRelation: "attachments"
      referencedColumns: ["id"]
    }
                  ]
                },"service_records": {
                  Row: {
                    "category": string,"created_at": string,"currency": string,"extraction_id": string | null,"id": string,"is_diy": boolean,"kind": string,"notes": string | null,"odometer": number | null,"performed_on": string,"shop_address": string | null,"shop_name": string | null,"source": string,"subtotal_cents": number,"tax_cents": number,"title": string,"total_cents": number,"updated_at": string,"user_id": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"currency"?: string,"extraction_id"?: string | null,"id"?: string,"is_diy"?: boolean,"kind": string,"notes"?: string | null,"odometer"?: number | null,"performed_on": string,"shop_address"?: string | null,"shop_name"?: string | null,"source"?: string,"subtotal_cents"?: number,"tax_cents"?: number,"title": string,"total_cents"?: number,"updated_at"?: string,"user_id"?: string,"vehicle_id": string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"currency"?: string,"extraction_id"?: string | null,"id"?: string,"is_diy"?: boolean,"kind"?: string,"notes"?: string | null,"odometer"?: number | null,"performed_on"?: string,"shop_address"?: string | null,"shop_name"?: string | null,"source"?: string,"subtotal_cents"?: number,"tax_cents"?: number,"title"?: string,"total_cents"?: number,"updated_at"?: string,"user_id"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_records_extraction_id_fkey"
      columns: ["extraction_id"]
isOneToOne: false
      referencedRelation: "receipt_extractions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_records_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"share_links": {
                  Row: {
                    "created_at": string,"id": string,"include_costs": boolean,"include_images": boolean,"revoked_at": string | null,"token": string,"user_id": string,"vehicle_id": string,"view_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"include_costs"?: boolean,"include_images"?: boolean,"revoked_at"?: string | null,"token"?: string,"user_id"?: string,"vehicle_id": string,"view_count"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"include_costs"?: boolean,"include_images"?: boolean,"revoked_at"?: string | null,"token"?: string,"user_id"?: string,"vehicle_id"?: string,"view_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_links_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"usage_counters": {
                  Row: {
                    "period": string,"scans": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "period": string,"scans"?: number,"user_id": string
                  }
                  Update: {
                    "period"?: string,"scans"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"vehicles": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"make": string,"model": string,"nickname": string | null,"odometer_unit": string,"photo_path": string | null,"status": string,"trim": string | null,"updated_at": string,"user_id": string,"vin": string | null,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"make": string,"model": string,"nickname"?: string | null,"odometer_unit"?: string,"photo_path"?: string | null,"status"?: string,"trim"?: string | null,"updated_at"?: string,"user_id"?: string,"vin"?: string | null,"year": number
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"make"?: string,"model"?: string,"nickname"?: string | null,"odometer_unit"?: string,"photo_path"?: string | null,"status"?: string,"trim"?: string | null,"updated_at"?: string,"user_id"?: string,"vin"?: string | null,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "consume_scan":
{ Args: { "p_limit": number,"p_user_id": string }; Returns: boolean
                           },
"new_share_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"owns_record":
{ Args: { "p_record_id": string }; Returns: boolean
                           },
"owns_vehicle":
{ Args: { "p_vehicle_id": string }; Returns: boolean
                           },
"refund_scan":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"save_record":
{ Args: { "p_items"?: Json,"p_record": Json }; Returns: {
              "category": string,
"created_at": string,
"currency": string,
"extraction_id": string | null,
"id": string,
"is_diy": boolean,
"kind": string,
"notes": string | null,
"odometer": number | null,
"performed_on": string,
"shop_address": string | null,
"shop_name": string | null,
"source": string,
"subtotal_cents": number,
"tax_cents": number,
"title": string,
"total_cents": number,
"updated_at": string,
"user_id": string,
"vehicle_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "service_records"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

// Convenience row-type aliases used throughout the codebase.
export type VehicleRow = Tables<'vehicles'>;
export type RecordRow = Tables<'service_records'>;
export type LineItemRow = Tables<'line_items'>;
export type OdometerRow = Tables<'odometer_readings'>;
export type ProfileRow = Tables<'profiles'>;
export type MaintenanceRuleRow = Tables<'maintenance_rules'>;
export type ShareLinkRow = Tables<'share_links'>;
export type AttachmentRow = Tables<'attachments'>;

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
