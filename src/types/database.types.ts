export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action_description: string
          company_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          module_key: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action_description: string
          company_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action_description?: string
          company_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      activity_log_2026_07: {
        Row: {
          action_description: string
          company_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          module_key: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action_description: string
          company_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action_description?: string
          company_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      activity_log_2026_08: {
        Row: {
          action_description: string
          company_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          module_key: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action_description: string
          company_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action_description?: string
          company_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      activity_log_2026_09: {
        Row: {
          action_description: string
          company_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          module_key: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action_description: string
          company_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action_description?: string
          company_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      activity_log_2026_10: {
        Row: {
          action_description: string
          company_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          module_key: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action_description: string
          company_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action_description?: string
          company_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      activity_log_2026_11: {
        Row: {
          action_description: string
          company_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          module_key: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action_description: string
          company_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action_description?: string
          company_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      activity_log_2026_12: {
        Row: {
          action_description: string
          company_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          module_key: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action_description: string
          company_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action_description?: string
          company_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      activity_log_2027_01: {
        Row: {
          action_description: string
          company_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          module_key: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action_description: string
          company_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action_description?: string
          company_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      attachments: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_active: boolean
          mime_type: string | null
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          mime_type?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          mime_type?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_01: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_02: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_03: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_04: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_05: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_06: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_07: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_08: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_09: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_10: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_11: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2026_12: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2027_01: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log_2027_02: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      board_inventory: {
        Row: {
          board_type_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          current_stock: number
          deleted_at: string | null
          description: string
          gsm: number | null
          id: string
          is_active: boolean
          location: string | null
          reorder_level: number
          reserved_stock: number
          size_l: number | null
          size_w: number | null
          unit_cost: number | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          board_type_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          current_stock?: number
          deleted_at?: string | null
          description: string
          gsm?: number | null
          id?: string
          is_active?: boolean
          location?: string | null
          reorder_level?: number
          reserved_stock?: number
          size_l?: number | null
          size_w?: number | null
          unit_cost?: number | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          board_type_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_stock?: number
          deleted_at?: string | null
          description?: string
          gsm?: number | null
          id?: string
          is_active?: boolean
          location?: string | null
          reorder_level?: number
          reserved_stock?: number
          size_l?: number | null
          size_w?: number | null
          unit_cost?: number | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_inventory_board_type_id_fkey"
            columns: ["board_type_id"]
            isOneToOne: false
            referencedRelation: "board_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_inventory_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_inventory_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      board_inventory_lots: {
        Row: {
          board_item_id: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          lot_number: string
          notes: string | null
          quantity_received: number
          quantity_remaining: number
          received_date: string
          reference_id: string | null
          reference_type: string | null
          unit_cost: number | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          board_item_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          lot_number: string
          notes?: string | null
          quantity_received: number
          quantity_remaining: number
          received_date?: string
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          board_item_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          lot_number?: string
          notes?: string | null
          quantity_received?: number
          quantity_remaining?: number
          received_date?: string
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_inventory_lots_board_item_id_fkey"
            columns: ["board_item_id"]
            isOneToOne: false
            referencedRelation: "board_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_inventory_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_inventory_lots_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      board_inventory_movements: {
        Row: {
          balance_after: number
          board_item_id: string
          company_id: string
          id: string
          job_id: string | null
          moved_by: string | null
          movement_type: string
          notes: string | null
          occurred_at: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          balance_after: number
          board_item_id: string
          company_id: string
          id?: string
          job_id?: string | null
          moved_by?: string | null
          movement_type: string
          notes?: string | null
          occurred_at?: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          balance_after?: number
          board_item_id?: string
          company_id?: string
          id?: string
          job_id?: string | null
          moved_by?: string | null
          movement_type?: string
          notes?: string | null
          occurred_at?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_inventory_movements_board_item_id_fkey"
            columns: ["board_item_id"]
            isOneToOne: false
            referencedRelation: "board_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_inventory_movements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_inventory_movements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_inventory_movements_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      board_types: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          default_sheet_size: string | null
          deleted_at: string | null
          flute_type: string | null
          gsm: number | null
          id: string
          is_active: boolean
          name: string
          rate_per_sheet: number | null
          sheet_length_in: number | null
          sheet_width_in: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          default_sheet_size?: string | null
          deleted_at?: string | null
          flute_type?: string | null
          gsm?: number | null
          id?: string
          is_active?: boolean
          name: string
          rate_per_sheet?: number | null
          sheet_length_in?: number | null
          sheet_width_in?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          default_sheet_size?: string | null
          deleted_at?: string | null
          flute_type?: string | null
          gsm?: number | null
          id?: string
          is_active?: boolean
          name?: string
          rate_per_sheet?: number | null
          sheet_length_in?: number | null
          sheet_width_in?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_head_office: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_head_office?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_head_office?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          base_currency_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          ntn: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          base_currency_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          ntn?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          base_currency_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          ntn?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_companies_base_currency"
            columns: ["base_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          exchange_rate_to_base: number
          id: string
          is_active: boolean
          is_base: boolean
          name: string
          symbol: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          exchange_rate_to_base?: number
          id?: string
          is_active?: boolean
          is_base?: boolean
          name: string
          symbol: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          exchange_rate_to_base?: number
          id?: string
          is_active?: boolean
          is_base?: boolean
          name?: string
          symbol?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "currencies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_activities: {
        Row: {
          activity_date: string
          activity_type: string
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          id: string
          is_active: boolean
          logged_by: string | null
          notes: string | null
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_date?: string
          activity_type: string
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          logged_by?: string | null
          notes?: string | null
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_date?: string
          activity_type?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          logged_by?: string | null
          notes?: string | null
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_activities_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          address_type: string
          city: string | null
          company_id: string
          country: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          state: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          address_type?: string
          city?: string | null
          company_id: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          address_type?: string
          city?: string | null
          company_id?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          designation: string | null
          email: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          mobile: string | null
          name: string
          phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          mobile?: string | null
          name: string
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          mobile?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      customer_ledger_entries: {
        Row: {
          balance_after: number
          company_id: string
          created_at: string
          created_by: string | null
          credit: number
          customer_id: string
          debit: number
          deleted_at: string | null
          description: string
          entry_date: string
          entry_type: string
          id: string
          is_active: boolean
          reference_id: string | null
          reference_type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          balance_after: number
          company_id: string
          created_at?: string
          created_by?: string | null
          credit?: number
          customer_id: string
          debit?: number
          deleted_at?: string | null
          description: string
          entry_date?: string
          entry_type: string
          id?: string
          is_active?: boolean
          reference_id?: string | null
          reference_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          balance_after?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit?: number
          customer_id?: string
          debit?: number
          deleted_at?: string | null
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          is_active?: boolean
          reference_id?: string | null
          reference_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      customers: {
        Row: {
          assigned_to: string | null
          business_type: string | null
          company_id: string
          created_at: string
          created_by: string | null
          credit_limit: number | null
          currency_id: string | null
          customer_code: string
          default_tax_id: string | null
          deleted_at: string | null
          email: string | null
          id: string
          industry: string | null
          is_active: boolean
          lead_source: string | null
          mobile: string | null
          name: string
          notes: string | null
          ntn: string | null
          payment_terms: number | null
          phone: string | null
          pipeline_stage: string
          portal_enabled: boolean
          portal_token: string | null
          portal_token_expires_at: string | null
          strn: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_type?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency_id?: string | null
          customer_code: string
          default_tax_id?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          lead_source?: string | null
          mobile?: string | null
          name: string
          notes?: string | null
          ntn?: string | null
          payment_terms?: number | null
          phone?: string | null
          pipeline_stage?: string
          portal_enabled?: boolean
          portal_token?: string | null
          portal_token_expires_at?: string | null
          strn?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_type?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency_id?: string | null
          customer_code?: string
          default_tax_id?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          lead_source?: string | null
          mobile?: string | null
          name?: string
          notes?: string | null
          ntn?: string | null
          payment_terms?: number | null
          phone?: string | null
          pipeline_stage?: string
          portal_enabled?: boolean
          portal_token?: string | null
          portal_token_expires_at?: string | null
          strn?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_default_tax_id_fkey"
            columns: ["default_tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      delay_reasons: {
        Row: {
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delay_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_items: {
        Row: {
          carton_count: number | null
          company_id: string
          created_at: string
          created_by: string | null
          dispatch_id: string
          id: string
          is_active: boolean
          job_id: string
          notes: string | null
          quantity_dispatched: number
          quantity_ordered: number
          sort_order: number
          updated_at: string
          updated_by: string | null
          weight_kg: number | null
        }
        Insert: {
          carton_count?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          dispatch_id: string
          id?: string
          is_active?: boolean
          job_id: string
          notes?: string | null
          quantity_dispatched?: number
          quantity_ordered?: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          weight_kg?: number | null
        }
        Update: {
          carton_count?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          dispatch_id?: string
          id?: string
          is_active?: boolean
          job_id?: string
          notes?: string | null
          quantity_dispatched?: number
          quantity_ordered?: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_items_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatch_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_orders: {
        Row: {
          company_id: string
          courier_name: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_charges: number | null
          delivery_city: string | null
          delivery_contact: string | null
          delivery_phone: string | null
          dispatch_method: string | null
          dispatch_number: string
          dispatched_at: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          is_active: boolean
          notes: string | null
          scheduled_date: string | null
          status: string
          tracking_number: string | null
          updated_at: string
          updated_by: string | null
          vehicle_number: string | null
        }
        Insert: {
          company_id: string
          courier_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_charges?: number | null
          delivery_city?: string | null
          delivery_contact?: string | null
          delivery_phone?: string | null
          dispatch_method?: string | null
          dispatch_number: string
          dispatched_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          scheduled_date?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Update: {
          company_id?: string
          courier_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_charges?: number | null
          delivery_city?: string | null
          delivery_contact?: string | null
          delivery_phone?: string | null
          dispatch_method?: string | null
          dispatch_number?: string
          dispatched_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          scheduled_date?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          company_id: string
          created_at: string
          current_value: number
          document_type: string
          id: string
          padding: number
          prefix: string
          prefix_format: string
          updated_at: string
          year: number
          zero_padding: number
        }
        Insert: {
          company_id: string
          created_at?: string
          current_value?: number
          document_type: string
          id?: string
          padding?: number
          prefix: string
          prefix_format?: string
          updated_at?: string
          year: number
          zero_padding?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          current_value?: number
          document_type?: string
          id?: string
          padding?: number
          prefix?: string
          prefix_format?: string
          updated_at?: string
          year?: number
          zero_padding?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      foil_types: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foil_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      glue_types: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "glue_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ink_types: {
        Row: {
          color_code: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color_code?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color_code?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ink_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          invoice_id: string
          is_active: boolean
          job_id: string | null
          quantity: number
          sort_order: number
          subtotal: number
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          invoice_id: string
          is_active?: boolean
          job_id?: string | null
          quantity?: number
          sort_order?: number
          subtotal?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          invoice_id?: string
          is_active?: boolean
          job_id?: string | null
          quantity?: number
          sort_order?: number
          subtotal?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance_due: number
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          discount_amount: number | null
          discount_pct: number | null
          dispatch_id: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          is_active: boolean
          notes: string | null
          paid_amount: number
          payment_terms: number | null
          sent_at: string | null
          status: string
          subtotal: number
          tax_amount: number | null
          tax_id: string | null
          tax_pct: number | null
          terms: string | null
          total_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          balance_due?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          dispatch_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          is_active?: boolean
          notes?: string | null
          paid_amount?: number
          payment_terms?: number | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number | null
          tax_id?: string | null
          tax_pct?: number | null
          terms?: string | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          balance_due?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          dispatch_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          is_active?: boolean
          notes?: string | null
          paid_amount?: number
          payment_terms?: number | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number | null
          tax_id?: string | null
          tax_pct?: number | null
          terms?: string | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatch_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      job_artwork_references: {
        Row: {
          artwork_version: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          job_id: string
          notes: string | null
          reference_job_id: string | null
        }
        Insert: {
          artwork_version?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          job_id: string
          notes?: string | null
          reference_job_id?: string | null
        }
        Update: {
          artwork_version?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          job_id?: string
          notes?: string | null
          reference_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_artwork_references_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artwork_references_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artwork_references_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artwork_references_reference_job_id_fkey"
            columns: ["reference_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artwork_references_reference_job_id_fkey"
            columns: ["reference_job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
        ]
      }
      job_artworks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          designer_notes: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          is_active: boolean
          is_production_ready: boolean
          job_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          designer_notes?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          is_active?: boolean
          is_production_ready?: boolean
          job_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          designer_notes?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          is_active?: boolean
          is_production_ready?: boolean
          job_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_artworks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artworks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artworks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artworks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
        ]
      }
      job_costing_lines: {
        Row: {
          amount: number
          category: string | null
          company_id: string
          costing_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_active: boolean
          quantity: number | null
          sort_order: number
          unit_rate: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          company_id: string
          costing_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_active?: boolean
          quantity?: number | null
          sort_order?: number
          unit_rate?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          company_id?: string
          costing_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean
          quantity?: number | null
          sort_order?: number
          unit_rate?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_costing_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_costing_lines_costing_id_fkey"
            columns: ["costing_id"]
            isOneToOne: false
            referencedRelation: "job_costings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_costings: {
        Row: {
          board_cost: number
          board_rate: number | null
          board_sheets: number | null
          company_id: string
          costed_at: string | null
          costed_by: string | null
          costing_notes: string | null
          created_at: string
          created_by: string | null
          die_cutting_cost: number | null
          foiling_cost: number | null
          id: string
          ink_cost: number | null
          is_active: boolean
          job_id: string
          labour_cost: number | null
          lamination_cost: number | null
          margin_amount: number | null
          margin_pct: number | null
          other_finishing: number | null
          overhead_amount: number | null
          overhead_pct: number | null
          pasting_cost: number | null
          plate_cost: number | null
          printing_cost: number
          printing_plates: number | null
          quoted_amount: number | null
          total_cost: number
          updated_at: string
          updated_by: string | null
          uv_cost: number | null
        }
        Insert: {
          board_cost?: number
          board_rate?: number | null
          board_sheets?: number | null
          company_id: string
          costed_at?: string | null
          costed_by?: string | null
          costing_notes?: string | null
          created_at?: string
          created_by?: string | null
          die_cutting_cost?: number | null
          foiling_cost?: number | null
          id?: string
          ink_cost?: number | null
          is_active?: boolean
          job_id: string
          labour_cost?: number | null
          lamination_cost?: number | null
          margin_amount?: number | null
          margin_pct?: number | null
          other_finishing?: number | null
          overhead_amount?: number | null
          overhead_pct?: number | null
          pasting_cost?: number | null
          plate_cost?: number | null
          printing_cost?: number
          printing_plates?: number | null
          quoted_amount?: number | null
          total_cost?: number
          updated_at?: string
          updated_by?: string | null
          uv_cost?: number | null
        }
        Update: {
          board_cost?: number
          board_rate?: number | null
          board_sheets?: number | null
          company_id?: string
          costed_at?: string | null
          costed_by?: string | null
          costing_notes?: string | null
          created_at?: string
          created_by?: string | null
          die_cutting_cost?: number | null
          foiling_cost?: number | null
          id?: string
          ink_cost?: number | null
          is_active?: boolean
          job_id?: string
          labour_cost?: number | null
          lamination_cost?: number | null
          margin_amount?: number | null
          margin_pct?: number | null
          other_finishing?: number | null
          overhead_amount?: number | null
          overhead_pct?: number | null
          pasting_cost?: number | null
          plate_cost?: number | null
          printing_cost?: number
          printing_plates?: number | null
          quoted_amount?: number | null
          total_cost?: number
          updated_at?: string
          updated_by?: string | null
          uv_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_costings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_costings_costed_by_fkey"
            columns: ["costed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_costings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_costings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
        ]
      }
      job_machine_assignments: {
        Row: {
          actual_hours: number | null
          company_id: string
          created_at: string
          created_by: string | null
          end_time: string | null
          estimated_hours: number | null
          id: string
          is_active: boolean
          job_id: string
          job_plan_id: string
          machine_id: string
          notes: string | null
          operator_id: string | null
          stage_id: string | null
          start_time: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_hours?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean
          job_id: string
          job_plan_id: string
          machine_id: string
          notes?: string | null
          operator_id?: string | null
          stage_id?: string | null
          start_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_hours?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean
          job_id?: string
          job_plan_id?: string
          machine_id?: string
          notes?: string | null
          operator_id?: string | null
          stage_id?: string | null
          start_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_machine_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_machine_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_machine_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_machine_assignments_job_plan_id_fkey"
            columns: ["job_plan_id"]
            isOneToOne: false
            referencedRelation: "job_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_machine_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_floor_status"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "job_machine_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_machine_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "report_machine_utilization"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "job_machine_assignments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_machine_assignments_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      job_plans: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          job_id: string
          notes: string | null
          planned_by: string | null
          planned_date: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          job_id: string
          notes?: string | null
          planned_by?: string | null
          planned_date: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          job_id?: string
          notes?: string | null
          planned_by?: string | null
          planned_date?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_plans_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_plans_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_plans_planned_by_fkey"
            columns: ["planned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_plates: {
        Row: {
          assigned_at: string
          company_id: string
          condition_on_assign: string | null
          condition_on_return: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_reused: boolean
          job_id: string
          machine_id: string | null
          plate_id: string
          remarks: string | null
          returned_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_at?: string
          company_id: string
          condition_on_assign?: string | null
          condition_on_return?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_reused?: boolean
          job_id: string
          machine_id?: string | null
          plate_id: string
          remarks?: string | null
          returned_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_at?: string
          company_id?: string
          condition_on_assign?: string | null
          condition_on_return?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_reused?: boolean
          job_id?: string
          machine_id?: string | null
          plate_id?: string
          remarks?: string | null
          returned_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_plates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_plates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_plates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_plates_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_floor_status"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "job_plates_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_plates_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "report_machine_utilization"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "job_plates_plate_id_fkey"
            columns: ["plate_id"]
            isOneToOne: false
            referencedRelation: "plates"
            referencedColumns: ["id"]
          },
        ]
      }
      job_stage_events: {
        Row: {
          actor_id: string | null
          company_id: string
          event_type: string
          id: string
          job_id: string
          new_value: string | null
          notes: string | null
          occurred_at: string
          old_value: string | null
          stage_id: string | null
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          event_type: string
          id?: string
          job_id: string
          new_value?: string | null
          notes?: string | null
          occurred_at?: string
          old_value?: string | null
          stage_id?: string | null
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          event_type?: string
          id?: string
          job_id?: string
          new_value?: string | null
          notes?: string | null
          occurred_at?: string
          old_value?: string | null
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_stage_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_stage_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_stage_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_stage_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_stage_events_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "job_stage_progress"
            referencedColumns: ["id"]
          },
        ]
      }
      job_stage_progress: {
        Row: {
          company_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          job_id: string
          notes: string | null
          sequence_order: number
          started_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
          workflow_stage_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          job_id: string
          notes?: string | null
          sequence_order: number
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          workflow_stage_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          job_id?: string
          notes?: string | null
          sequence_order?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          workflow_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_stage_progress_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_stage_progress_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_stage_progress_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_stage_progress_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_stage_progress_workflow_stage_id_fkey"
            columns: ["workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      job_statuses: {
        Row: {
          color_hex: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color_hex?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color_hex?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_statuses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_wastage: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          job_id: string
          machine_id: string | null
          notes: string | null
          occurred_at: string
          quantity: number
          recorded_by: string | null
          stage_progress_id: string | null
          updated_at: string
          updated_by: string | null
          wastage_reason_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          job_id: string
          machine_id?: string | null
          notes?: string | null
          occurred_at?: string
          quantity: number
          recorded_by?: string | null
          stage_progress_id?: string | null
          updated_at?: string
          updated_by?: string | null
          wastage_reason_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          job_id?: string
          machine_id?: string | null
          notes?: string | null
          occurred_at?: string
          quantity?: number
          recorded_by?: string | null
          stage_progress_id?: string | null
          updated_at?: string
          updated_by?: string | null
          wastage_reason_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_wastage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_wastage_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_wastage_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_wastage_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_floor_status"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "job_wastage_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_wastage_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "report_machine_utilization"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "job_wastage_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_wastage_stage_progress_id_fkey"
            columns: ["stage_progress_id"]
            isOneToOne: false
            referencedRelation: "job_stage_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_wastage_wastage_reason_id_fkey"
            columns: ["wastage_reason_id"]
            isOneToOne: false
            referencedRelation: "wastage_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      job_workflow_instances: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          job_id: string
          updated_at: string
          updated_by: string | null
          workflow_template_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          job_id: string
          updated_at?: string
          updated_by?: string | null
          workflow_template_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          job_id?: string
          updated_at?: string
          updated_by?: string | null
          workflow_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_workflow_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_workflow_instances_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_workflow_instances_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_workflow_instances_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          actual_amount: number | null
          artwork_by: string | null
          assigned_to: string | null
          board_type_id: string | null
          company_id: string
          completed_date: string | null
          created_at: string
          created_by: string | null
          current_stage_id: string | null
          customer_id: string
          deleted_at: string | null
          description: string | null
          die_number: string | null
          foil_type_id: string | null
          grain_direction: string | null
          hold_notes: string | null
          hold_reason_id: string | null
          hold_started_at: string | null
          id: string
          internal_remarks: string | null
          is_active: boolean
          is_on_hold: boolean
          is_repeat: boolean
          job_number: string
          job_title: string
          lamination_type_id: string | null
          no_of_colors: number | null
          order_date: string
          paper_type_id: string | null
          parent_job_id: string | null
          pasting: string | null
          priority: string
          quantity: number
          quoted_amount: number | null
          repeat_sequence: number | null
          required_date: string | null
          sales_order_id: string | null
          sales_order_item_id: string | null
          sheet_qty: number | null
          sheet_size: string | null
          size_h: number | null
          size_l: number | null
          size_w: number | null
          special_finishing: string | null
          status: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          ups: number | null
          uv_coating: string | null
          workflow_template_id: string | null
        }
        Insert: {
          actual_amount?: number | null
          artwork_by?: string | null
          assigned_to?: string | null
          board_type_id?: string | null
          company_id: string
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id?: string | null
          customer_id: string
          deleted_at?: string | null
          description?: string | null
          die_number?: string | null
          foil_type_id?: string | null
          grain_direction?: string | null
          hold_notes?: string | null
          hold_reason_id?: string | null
          hold_started_at?: string | null
          id?: string
          internal_remarks?: string | null
          is_active?: boolean
          is_on_hold?: boolean
          is_repeat?: boolean
          job_number: string
          job_title: string
          lamination_type_id?: string | null
          no_of_colors?: number | null
          order_date?: string
          paper_type_id?: string | null
          parent_job_id?: string | null
          pasting?: string | null
          priority?: string
          quantity?: number
          quoted_amount?: number | null
          repeat_sequence?: number | null
          required_date?: string | null
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          sheet_qty?: number | null
          sheet_size?: string | null
          size_h?: number | null
          size_l?: number | null
          size_w?: number | null
          special_finishing?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          ups?: number | null
          uv_coating?: string | null
          workflow_template_id?: string | null
        }
        Update: {
          actual_amount?: number | null
          artwork_by?: string | null
          assigned_to?: string | null
          board_type_id?: string | null
          company_id?: string
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id?: string | null
          customer_id?: string
          deleted_at?: string | null
          description?: string | null
          die_number?: string | null
          foil_type_id?: string | null
          grain_direction?: string | null
          hold_notes?: string | null
          hold_reason_id?: string | null
          hold_started_at?: string | null
          id?: string
          internal_remarks?: string | null
          is_active?: boolean
          is_on_hold?: boolean
          is_repeat?: boolean
          job_number?: string
          job_title?: string
          lamination_type_id?: string | null
          no_of_colors?: number | null
          order_date?: string
          paper_type_id?: string | null
          parent_job_id?: string | null
          pasting?: string | null
          priority?: string
          quantity?: number
          quoted_amount?: number | null
          repeat_sequence?: number | null
          required_date?: string | null
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          sheet_qty?: number | null
          sheet_size?: string | null
          size_h?: number | null
          size_l?: number | null
          size_w?: number | null
          special_finishing?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          ups?: number | null
          uv_coating?: string | null
          workflow_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_artwork_by_fkey"
            columns: ["artwork_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_board_type_id_fkey"
            columns: ["board_type_id"]
            isOneToOne: false
            referencedRelation: "board_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "jobs_foil_type_id_fkey"
            columns: ["foil_type_id"]
            isOneToOne: false
            referencedRelation: "foil_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_hold_reason_id_fkey"
            columns: ["hold_reason_id"]
            isOneToOne: false
            referencedRelation: "delay_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_lamination_type_id_fkey"
            columns: ["lamination_type_id"]
            isOneToOne: false
            referencedRelation: "lamination_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_paper_type_id_fkey"
            columns: ["paper_type_id"]
            isOneToOne: false
            referencedRelation: "paper_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      lamination_types: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          material: string | null
          name: string
          rate_per_sqft: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          material?: string | null
          name: string
          rate_per_sqft?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          material?: string | null
          name?: string
          rate_per_sqft?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lamination_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          company_id: string
          device_info: string | null
          id: string
          ip_address: string | null
          logged_in_at: string
          logged_out_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          logged_in_at?: string
          logged_out_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          logged_in_at?: string
          logged_out_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_downtime_log: {
        Row: {
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          is_active: boolean
          machine_id: string
          reason: string | null
          reported_by: string | null
          resolution_notes: string | null
          resolved_by: string | null
          started_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          machine_id: string
          reason?: string | null
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_by?: string | null
          started_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          machine_id?: string
          reason?: string | null
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_by?: string | null
          started_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_downtime_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_downtime_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_floor_status"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_downtime_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_downtime_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "report_machine_utilization"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_downtime_log_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_downtime_log_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_maintenance_log: {
        Row: {
          company_id: string
          completed_date: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          is_active: boolean
          machine_id: string
          maintenance_type: string
          next_due_date: string | null
          notes: string | null
          performed_by: string | null
          scheduled_date: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          is_active?: boolean
          machine_id: string
          maintenance_type: string
          next_due_date?: string | null
          notes?: string | null
          performed_by?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_active?: boolean
          machine_id?: string
          maintenance_type?: string
          next_due_date?: string | null
          notes?: string | null
          performed_by?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_maintenance_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_maintenance_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_floor_status"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_maintenance_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_maintenance_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "report_machine_utilization"
            referencedColumns: ["machine_id"]
          },
        ]
      }
      machine_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          company_id: string
          id: string
          machine_id: string
          reason: string | null
          status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          company_id: string
          id?: string
          machine_id: string
          reason?: string | null
          status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          id?: string
          machine_id?: string
          reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_status_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_status_history_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_floor_status"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_status_history_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_status_history_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "report_machine_utilization"
            referencedColumns: ["machine_id"]
          },
        ]
      }
      machines: {
        Row: {
          capacity_per_hour: number | null
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          current_operator_id: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          machine_type: string
          name: string
          notes: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capacity_per_hour?: number | null
          code: string
          company_id: string
          created_at?: string
          created_by?: string | null
          current_operator_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          machine_type: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capacity_per_hour?: number | null
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_operator_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          machine_type?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_current_operator_id_fkey"
            columns: ["current_operator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requisition_items: {
        Row: {
          board_item_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          material_name: string
          material_type: string | null
          notes: string | null
          quantity_issued: number
          quantity_required: number
          requisition_id: string
          specification: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          board_item_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          material_name: string
          material_type?: string | null
          notes?: string | null
          quantity_issued?: number
          quantity_required?: number
          requisition_id: string
          specification?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          board_item_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          material_name?: string
          material_type?: string | null
          notes?: string | null
          quantity_issued?: number
          quantity_required?: number
          requisition_id?: string
          specification?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_requisition_items_board_item_id_fkey"
            columns: ["board_item_id"]
            isOneToOne: false
            referencedRelation: "board_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requisition_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requisition_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "material_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requisition_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requisitions: {
        Row: {
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          job_id: string | null
          mrn_number: string
          notes: string | null
          requested_by: string | null
          required_date: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          job_id?: string | null
          mrn_number: string
          notes?: string | null
          requested_by?: string | null
          required_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          job_id?: string | null
          mrn_number?: string
          notes?: string | null
          requested_by?: string | null
          required_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_requisitions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requisitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requisitions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requisitions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requisitions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          group_key: string | null
          id: string
          is_active: boolean
          is_read: boolean
          last_occurred_at: string
          link_url: string | null
          message: string | null
          occurrence_count: number
          title: string
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          group_key?: string | null
          id?: string
          is_active?: boolean
          is_read?: boolean
          last_occurred_at?: string
          link_url?: string | null
          message?: string | null
          occurrence_count?: number
          title: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          group_key?: string | null
          id?: string
          is_active?: boolean
          is_read?: boolean
          last_occurred_at?: string
          link_url?: string | null
          message?: string | null
          occurrence_count?: number
          title?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_types: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          gsm: number | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gsm?: number | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gsm?: number | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_name: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          id: string
          invoice_id: string
          is_active: boolean
          notes: string | null
          payment_date: string
          payment_method: string
          received_by: string | null
          reference: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          bank_name?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          id?: string
          invoice_id: string
          is_active?: boolean
          notes?: string | null
          payment_date?: string
          payment_method?: string
          received_by?: string | null
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          bank_name?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          id?: string
          invoice_id?: string
          is_active?: boolean
          notes?: string | null
          payment_date?: string
          payment_method?: string
          received_by?: string | null
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          module: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          module: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          module?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      plates: {
        Row: {
          color: string
          company_id: string
          cost: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          die_number: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          made_date: string | null
          material: string
          origin_job_id: string | null
          plate_code: string
          plate_size: string | null
          remarks: string | null
          retired_reason: string | null
          reuse_count: number
          status: string
          storage_location: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          color: string
          company_id: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          die_number?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          made_date?: string | null
          material?: string
          origin_job_id?: string | null
          plate_code: string
          plate_size?: string | null
          remarks?: string | null
          retired_reason?: string | null
          reuse_count?: number
          status?: string
          storage_location?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          color?: string
          company_id?: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          die_number?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          made_date?: string | null
          material?: string
          origin_job_id?: string | null
          plate_code?: string
          plate_size?: string | null
          remarks?: string | null
          retired_reason?: string | null
          reuse_count?: number
          status?: string
          storage_location?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plates_origin_job_id_fkey"
            columns: ["origin_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plates_origin_job_id_fkey"
            columns: ["origin_job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      production_assignments: {
        Row: {
          actual_end: string | null
          actual_minutes: number | null
          actual_start: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          estimated_minutes: number | null
          id: string
          is_active: boolean
          job_id: string
          machine_id: string
          notes: string | null
          operator_id: string | null
          scheduled_start: string | null
          stage_progress_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_minutes?: number | null
          actual_start?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          job_id: string
          machine_id: string
          notes?: string | null
          operator_id?: string | null
          scheduled_start?: string | null
          stage_progress_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_minutes?: number | null
          actual_start?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          job_id?: string
          machine_id?: string
          notes?: string | null
          operator_id?: string | null
          scheduled_start?: string | null
          stage_progress_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_floor_status"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "production_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "report_machine_utilization"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "production_assignments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_stage_progress_id_fkey"
            columns: ["stage_progress_id"]
            isOneToOne: false
            referencedRelation: "job_stage_progress"
            referencedColumns: ["id"]
          },
        ]
      }
      production_logs: {
        Row: {
          actor_id: string | null
          assignment_id: string
          company_id: string
          event_type: string
          id: string
          job_id: string
          machine_id: string
          notes: string | null
          occurred_at: string
          quantity_done: number | null
        }
        Insert: {
          actor_id?: string | null
          assignment_id: string
          company_id: string
          event_type: string
          id?: string
          job_id: string
          machine_id: string
          notes?: string | null
          occurred_at?: string
          quantity_done?: number | null
        }
        Update: {
          actor_id?: string | null
          assignment_id?: string
          company_id?: string
          event_type?: string
          id?: string
          job_id?: string
          machine_id?: string
          notes?: string | null
          occurred_at?: string
          quantity_done?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "machine_floor_status"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "production_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "production_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machine_floor_status"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "report_machine_utilization"
            referencedColumns: ["machine_id"]
          },
        ]
      }
      proof_of_delivery: {
        Row: {
          company_id: string
          condition: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          damage_notes: string | null
          dispatch_id: string
          id: string
          is_active: boolean
          notes: string | null
          photo_url: string | null
          received_at: string
          received_by: string | null
          signature_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          condition?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          damage_notes?: string | null
          dispatch_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          photo_url?: string | null
          received_at?: string
          received_by?: string | null
          signature_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          condition?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          damage_notes?: string | null
          dispatch_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          photo_url?: string | null
          received_at?: string
          received_by?: string | null
          signature_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proof_of_delivery_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatch_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          board_item_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_active: boolean
          line_no: number
          notes: string | null
          po_id: string
          quantity: number
          quantity_received: number
          sort_order: number
          specification: string | null
          subtotal: number
          unit_id: string | null
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          board_item_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_active?: boolean
          line_no?: number
          notes?: string | null
          po_id: string
          quantity?: number
          quantity_received?: number
          sort_order?: number
          specification?: string | null
          subtotal?: number
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          board_item_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean
          line_no?: number
          notes?: string | null
          po_id?: string
          quantity?: number
          quantity_received?: number
          sort_order?: number
          specification?: string | null
          subtotal?: number
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_board_item_id_fkey"
            columns: ["board_item_id"]
            isOneToOne: false
            referencedRelation: "board_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expected_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          order_date: string
          po_number: string
          status: string
          subtotal: number
          tax_amount: number
          terms: string | null
          total_amount: number
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          order_date?: string
          po_number: string
          status?: string
          subtotal?: number
          tax_amount?: number
          terms?: string | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          order_date?: string
          po_number?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          terms?: string | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_checklist_responses: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          inspection_id: string
          is_active: boolean
          is_critical: boolean
          notes: string | null
          question: string
          response: string | null
          template_item_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_id: string
          is_active?: boolean
          is_critical?: boolean
          notes?: string | null
          question: string
          response?: string | null
          template_item_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_id?: string
          is_active?: boolean
          is_critical?: boolean
          notes?: string | null
          question?: string
          response?: string | null
          template_item_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_checklist_responses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checklist_responses_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "qc_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checklist_responses_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "qc_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_defects: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          defect_type: string
          deleted_at: string | null
          description: string | null
          id: string
          inspection_id: string | null
          is_active: boolean
          job_id: string
          photo_url: string | null
          photo_urls: string[]
          quantity_affected: number | null
          reported_by: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_notes: string | null
          severity: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          defect_type: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          inspection_id?: string | null
          is_active?: boolean
          job_id: string
          photo_url?: string | null
          photo_urls?: string[]
          quantity_affected?: number | null
          reported_by?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_notes?: string | null
          severity?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          defect_type?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          inspection_id?: string | null
          is_active?: boolean
          job_id?: string
          photo_url?: string | null
          photo_urls?: string[]
          quantity_affected?: number | null
          reported_by?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_notes?: string | null
          severity?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_defects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_defects_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "qc_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_defects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_defects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_defects_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_inspections: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          defect_count: number | null
          deleted_at: string | null
          id: string
          inspected_at: string | null
          inspection_no: number
          inspector_id: string | null
          is_active: boolean
          job_id: string
          notes: string | null
          result: string | null
          sample_size: number | null
          signed_off_at: string | null
          signed_off_by: string | null
          template_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          defect_count?: number | null
          deleted_at?: string | null
          id?: string
          inspected_at?: string | null
          inspection_no?: number
          inspector_id?: string | null
          is_active?: boolean
          job_id: string
          notes?: string | null
          result?: string | null
          sample_size?: number | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          defect_count?: number | null
          deleted_at?: string | null
          id?: string
          inspected_at?: string | null
          inspection_no?: number
          inspector_id?: string | null
          is_active?: boolean
          job_id?: string
          notes?: string | null
          result?: string | null
          sample_size?: number | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "qc_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_template_items: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_critical: boolean
          question: string
          sort_order: number
          template_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_critical?: boolean
          question: string
          sort_order?: number
          template_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_critical?: boolean
          question?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_template_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "qc_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_templates: {
        Row: {
          applies_to: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          applies_to?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          applies_to?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          board_cost: number | null
          board_type_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          die_cutting_cost: number | null
          id: string
          is_active: boolean
          lamination_cost: number | null
          lamination_type_id: string | null
          line_no: number
          margin_percent: number | null
          no_of_colors: number | null
          notes: string | null
          other_cost: number | null
          overhead_percent: number | null
          pasting_cost: number | null
          plate_cost: number | null
          printing_cost: number | null
          product_desc: string
          quantity: number
          quotation_id: string
          sheet_qty: number | null
          size_h: number | null
          size_l: number | null
          size_w: number | null
          sort_order: number
          subtotal: number
          total_cost: number | null
          unit_id: string | null
          unit_price: number
          updated_at: string
          updated_by: string | null
          ups: number | null
          wastage_percent: number | null
        }
        Insert: {
          board_cost?: number | null
          board_type_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          die_cutting_cost?: number | null
          id?: string
          is_active?: boolean
          lamination_cost?: number | null
          lamination_type_id?: string | null
          line_no?: number
          margin_percent?: number | null
          no_of_colors?: number | null
          notes?: string | null
          other_cost?: number | null
          overhead_percent?: number | null
          pasting_cost?: number | null
          plate_cost?: number | null
          printing_cost?: number | null
          product_desc: string
          quantity?: number
          quotation_id: string
          sheet_qty?: number | null
          size_h?: number | null
          size_l?: number | null
          size_w?: number | null
          sort_order?: number
          subtotal?: number
          total_cost?: number | null
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          ups?: number | null
          wastage_percent?: number | null
        }
        Update: {
          board_cost?: number | null
          board_type_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          die_cutting_cost?: number | null
          id?: string
          is_active?: boolean
          lamination_cost?: number | null
          lamination_type_id?: string | null
          line_no?: number
          margin_percent?: number | null
          no_of_colors?: number | null
          notes?: string | null
          other_cost?: number | null
          overhead_percent?: number | null
          pasting_cost?: number | null
          plate_cost?: number | null
          printing_cost?: number | null
          product_desc?: string
          quantity?: number
          quotation_id?: string
          sheet_qty?: number | null
          size_h?: number | null
          size_l?: number | null
          size_w?: number | null
          sort_order?: number
          subtotal?: number
          total_cost?: number | null
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          ups?: number | null
          wastage_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_board_type_id_fkey"
            columns: ["board_type_id"]
            isOneToOne: false
            referencedRelation: "board_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_lamination_type_id_fkey"
            columns: ["lamination_type_id"]
            isOneToOne: false
            referencedRelation: "lamination_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          approval_ip: string | null
          approval_responded_at: string | null
          approval_token: string | null
          approval_token_expires_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency_id: string | null
          customer_contact_id: string | null
          customer_id: string
          deleted_at: string | null
          discount_amount: number
          discount_percent: number | null
          id: string
          is_active: boolean
          notes: string | null
          parent_quotation_id: string | null
          quotation_number: string
          revision: number
          status: string
          subtotal: number
          tax_amount: number
          tax_id: string | null
          terms_conditions: string | null
          total_amount: number
          updated_at: string
          updated_by: string | null
          valid_until: string | null
        }
        Insert: {
          approval_ip?: string | null
          approval_responded_at?: string | null
          approval_token?: string | null
          approval_token_expires_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency_id?: string | null
          customer_contact_id?: string | null
          customer_id: string
          deleted_at?: string | null
          discount_amount?: number
          discount_percent?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          parent_quotation_id?: string | null
          quotation_number: string
          revision?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_id?: string | null
          terms_conditions?: string | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Update: {
          approval_ip?: string | null
          approval_responded_at?: string | null
          approval_token?: string | null
          approval_token_expires_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency_id?: string | null
          customer_contact_id?: string | null
          customer_id?: string
          deleted_at?: string | null
          discount_amount?: number
          discount_percent?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          parent_quotation_id?: string | null
          quotation_number?: string
          revision?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_id?: string | null
          terms_conditions?: string | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "quotations_parent_quotation_id_fkey"
            columns: ["parent_quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          frequency: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          recipients: string[]
          report_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          recipients: string[]
          report_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          recipients?: string[]
          report_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      reprint_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          inspection_id: string | null
          is_active: boolean
          notes: string | null
          original_job_id: string
          priority: string
          quantity: number
          reason: string
          reprint_job_id: string | null
          requested_by: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inspection_id?: string | null
          is_active?: boolean
          notes?: string | null
          original_job_id: string
          priority?: string
          quantity: number
          reason: string
          reprint_job_id?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inspection_id?: string | null
          is_active?: boolean
          notes?: string | null
          original_job_id?: string
          priority?: string
          quantity?: number
          reason?: string
          reprint_job_id?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reprint_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reprint_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reprint_requests_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "qc_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reprint_requests_original_job_id_fkey"
            columns: ["original_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reprint_requests_original_job_id_fkey"
            columns: ["original_job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reprint_requests_reprint_job_id_fkey"
            columns: ["reprint_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reprint_requests_reprint_job_id_fkey"
            columns: ["reprint_job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reprint_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          permission_id: string
          role_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          permission_id: string
          role_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          permission_id?: string
          role_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system_role: boolean
          name: string
          slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_role?: boolean
          name: string
          slug: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_role?: boolean
          name?: string
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          board_type_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          lamination_type_id: string | null
          line_no: number
          no_of_colors: number | null
          notes: string | null
          product_desc: string
          quantity: number
          quotation_item_id: string | null
          sales_order_id: string
          size_h: number | null
          size_l: number | null
          size_w: number | null
          sort_order: number
          subtotal: number
          unit_id: string | null
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          board_type_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          lamination_type_id?: string | null
          line_no?: number
          no_of_colors?: number | null
          notes?: string | null
          product_desc: string
          quantity?: number
          quotation_item_id?: string | null
          sales_order_id: string
          size_h?: number | null
          size_l?: number | null
          size_w?: number | null
          sort_order?: number
          subtotal?: number
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          board_type_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          lamination_type_id?: string | null
          line_no?: number
          no_of_colors?: number | null
          notes?: string | null
          product_desc?: string
          quantity?: number
          quotation_item_id?: string | null
          sales_order_id?: string
          size_h?: number | null
          size_l?: number | null
          size_w?: number | null
          sort_order?: number
          subtotal?: number
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_board_type_id_fkey"
            columns: ["board_type_id"]
            isOneToOne: false
            referencedRelation: "board_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_lamination_type_id_fkey"
            columns: ["lamination_type_id"]
            isOneToOne: false
            referencedRelation: "lamination_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          currency_id: string | null
          customer_contact_id: string | null
          customer_id: string
          deleted_at: string | null
          delivery_address_id: string | null
          discount_amount: number
          discount_percent: number | null
          id: string
          is_active: boolean
          order_date: string
          quotation_id: string | null
          required_date: string | null
          so_number: string
          special_instructions: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_id: string | null
          total_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          currency_id?: string | null
          customer_contact_id?: string | null
          customer_id: string
          deleted_at?: string | null
          delivery_address_id?: string | null
          discount_amount?: number
          discount_percent?: number | null
          id?: string
          is_active?: boolean
          order_date?: string
          quotation_id?: string | null
          required_date?: string | null
          so_number: string
          special_instructions?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_id?: string | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency_id?: string | null
          customer_contact_id?: string | null
          customer_id?: string
          deleted_at?: string | null
          delivery_address_id?: string | null
          discount_amount?: number
          discount_percent?: number | null
          id?: string
          is_active?: boolean
          order_date?: string
          quotation_id?: string | null
          required_date?: string | null
          so_number?: string
          special_instructions?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_id?: string | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "report_customer_sales"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ledger_entries: {
        Row: {
          balance_after: number
          company_id: string
          created_at: string
          created_by: string | null
          credit: number
          debit: number
          deleted_at: string | null
          description: string
          entry_date: string
          entry_type: string
          id: string
          is_active: boolean
          reference_id: string | null
          reference_type: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          balance_after: number
          company_id: string
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          deleted_at?: string | null
          description: string
          entry_date?: string
          entry_type: string
          id?: string
          is_active?: boolean
          reference_id?: string | null
          reference_type?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          balance_after?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          deleted_at?: string | null
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          is_active?: boolean
          reference_id?: string | null
          reference_type?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ledger_entries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          category: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      taxes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          rate_percent: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          rate_percent: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          rate_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taxes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          css_variables: Json
          deleted_at: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          css_variables?: Json
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          slug: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          css_variables?: Json
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "themes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          symbol: string
          unit_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          symbol: string
          unit_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          symbol?: string
          unit_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branch_access: {
        Row: {
          branch_id: string
          can_create: boolean
          can_edit: boolean
          can_view: boolean
          company_id: string
          created_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          can_create?: boolean
          can_edit?: boolean
          can_view?: boolean
          company_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          can_create?: boolean
          can_edit?: boolean
          can_view?: boolean
          company_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branch_access_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_branch_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_branch_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_branch_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          dashboard_layout: Json | null
          deleted_at: string | null
          id: string
          is_active: boolean
          notification_prefs: Json | null
          sidebar_collapsed: boolean
          theme_slug: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          dashboard_layout?: Json | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          notification_prefs?: Json | null
          sidebar_collapsed?: boolean
          theme_slug?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          dashboard_layout?: Json | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          notification_prefs?: Json | null
          sidebar_collapsed?: boolean
          theme_slug?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          role_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          role_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          role_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          email: string
          employee_code: string | null
          failed_login_attempts: number
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          locked_until: string | null
          phone: string | null
          profile_photo_url: string | null
          role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auth_user_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email: string
          employee_code?: string | null
          failed_login_attempts?: number
          full_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          locked_until?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auth_user_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email?: string
          employee_code?: string | null
          failed_login_attempts?: number
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          locked_until?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bill_items: {
        Row: {
          bill_id: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          is_active: boolean
          po_item_id: string | null
          quantity_billed: number
          subtotal: number
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bill_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          is_active?: boolean
          po_item_id?: string | null
          quantity_billed?: number
          subtotal?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bill_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_active?: boolean
          po_item_id?: string | null
          quantity_billed?: number
          subtotal?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "vendor_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bills: {
        Row: {
          bill_date: string
          bill_number: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          po_id: string
          status: string
          total_amount: number
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          bill_date?: string
          bill_number: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          po_id: string
          status?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          bill_date?: string
          bill_number?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          po_id?: string
          status?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bills_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payments: {
        Row: {
          amount: number
          bank_name: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          notes: string | null
          paid_by: string | null
          payment_date: string
          payment_method: string
          po_id: string | null
          reference: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          bank_name?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          paid_by?: string | null
          payment_date?: string
          payment_method?: string
          po_id?: string | null
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          paid_by?: string | null
          payment_date?: string
          payment_method?: string
          po_id?: string | null
          reference?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          company_id: string
          contact_person: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          mobile: string | null
          name: string
          notes: string | null
          ntn: string | null
          payment_terms: number | null
          phone: string | null
          strn: string | null
          updated_at: string
          updated_by: string | null
          vendor_code: string
        }
        Insert: {
          address?: string | null
          company_id: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name: string
          notes?: string | null
          ntn?: string | null
          payment_terms?: number | null
          phone?: string | null
          strn?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_code: string
        }
        Update: {
          address?: string | null
          company_id?: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          notes?: string | null
          ntn?: string | null
          payment_terms?: number | null
          phone?: string | null
          strn?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wastage_reasons: {
        Row: {
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wastage_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_stages: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          estimated_hours: number | null
          id: string
          is_active: boolean
          is_optional: boolean
          name: string
          sequence_order: number
          updated_at: string
          updated_by: string | null
          workflow_template_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean
          is_optional?: boolean
          name: string
          sequence_order?: number
          updated_at?: string
          updated_by?: string | null
          workflow_template_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean
          is_optional?: boolean
          name?: string
          sequence_order?: number
          updated_at?: string
          updated_by?: string | null
          workflow_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_audit_trail: {
        Row: {
          action: string | null
          company_id: string | null
          id: string | null
          new_values: Json | null
          old_values: Json | null
          performed_at: string | null
          performed_by_email: string | null
          performed_by_name: string | null
          record_id: string | null
          table_name: string | null
        }
        Relationships: []
      }
      global_search_index: {
        Row: {
          code: string | null
          company_id: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          entity_type: string | null
          id: string | null
          required_date: string | null
          search_vector: unknown
          status: string | null
          title: string | null
        }
        Relationships: []
      }
      machine_floor_status: {
        Row: {
          actual_start: string | null
          assignment_id: string | null
          assignment_status: string | null
          company_id: string | null
          customer_name: string | null
          estimated_minutes: number | null
          job_id: string | null
          job_number: string | null
          job_priority: string | null
          job_title: string | null
          machine_active: boolean | null
          machine_id: string | null
          machine_name: string | null
          machine_type: string | null
          operator_id: string | null
          operator_name: string | null
          required_date: string | null
          stage_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "report_job_turnaround"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_customer_sales: {
        Row: {
          cancelled_jobs: number | null
          company_id: string | null
          completed_jobs: number | null
          customer_code: string | null
          customer_id: string | null
          customer_name: string | null
          dispatched_jobs: number | null
          first_job_date: string | null
          industry: string | null
          invoice_count: number | null
          last_job_date: string | null
          total_invoiced: number | null
          total_jobs: number | null
          total_outstanding: number | null
          total_paid: number | null
          total_quoted: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_financial_summary: {
        Row: {
          company_id: string | null
          fully_paid: number | null
          invoice_count: number | null
          month: string | null
          month_label: string | null
          overdue_amount: number | null
          overdue_count: number | null
          partially_paid: number | null
          total_collected: number | null
          total_invoiced: number | null
          total_outstanding: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_job_turnaround: {
        Row: {
          company_id: string | null
          completed_date: string | null
          created_at: string | null
          customer_code: string | null
          customer_name: string | null
          days_variance: number | null
          delivered_on_time: boolean | null
          dispatched_at: string | null
          id: string | null
          job_number: string | null
          job_title: string | null
          order_date: string | null
          priority: string | null
          qc_result: string | null
          quantity: number | null
          required_date: string | null
          stages_completed: number | null
          stages_total: number | null
          status: string | null
          turnaround_days: number | null
          updated_at: string | null
          workflow_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_machine_utilization: {
        Row: {
          avg_job_minutes: number | null
          company_id: string | null
          completed: number | null
          currently_running: number | null
          machine_id: string | null
          machine_name: string | null
          machine_type: string | null
          queued: number | null
          total_actual_minutes: number | null
          total_assignments: number | null
          total_estimated_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_monthly_production: {
        Row: {
          avg_turnaround_days: number | null
          company_id: string | null
          jobs_cancelled: number | null
          jobs_completed: number | null
          jobs_created: number | null
          jobs_dispatched: number | null
          jobs_on_hold: number | null
          month: string | null
          month_label: string | null
          on_time_pct: number | null
          total_quantity: number | null
          total_quoted_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_qc_analysis: {
        Row: {
          company_id: string | null
          conditional: number | null
          failed: number | null
          month: string | null
          month_label: string | null
          pass_rate_pct: number | null
          passed: number | null
          reprint_requests: number | null
          total_defects: number | null
          total_inspections: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_wastage_summary: {
        Row: {
          company_id: string | null
          machine_name: string | null
          month: string | null
          month_label: string | null
          reason_category: string | null
          reason_name: string | null
          total_quantity: number | null
          wastage_events: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_wastage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_job_actual_cost: {
        Args: {
          p_amount?: number
          p_bucket: string
          p_company_id: string
          p_job_id: string
          p_plates_delta?: number
          p_sheets_delta?: number
        }
        Returns: undefined
      }
      close_machine_downtime: {
        Args: {
          p_company_id: string
          p_downtime_id: string
          p_new_machine_status?: string
          p_resolution_notes?: string
          p_resolved_by: string
        }
        Returns: {
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          is_active: boolean
          machine_id: string
          reason: string | null
          reported_by: string | null
          resolution_notes: string | null
          resolved_by: string | null
          started_at: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "machine_downtime_log"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_board_lots_fifo: {
        Args: {
          p_board_item_id: string
          p_company_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      ensure_future_partitions: {
        Args: { p_months_ahead?: number }
        Returns: undefined
      }
      get_accessible_companies: {
        Args: { p_user_id: string }
        Returns: {
          company_id: string
          company_name: string
          is_primary: boolean
          user_role: string
        }[]
      }
      get_ap_summary: {
        Args: { p_company_id: string }
        Returns: {
          balance_owed: number
          vendor_id: string
          vendor_name: string
        }[]
      }
      get_ar_aging_report: {
        Args: { p_company_id: string }
        Returns: {
          current_amt: number
          customer_id: string
          customer_name: string
          days_1_30: number
          days_31_60: number
          days_61_90: number
          days_over_90: number
          oldest_invoice_date: string
          total_due: number
        }[]
      }
      get_dashboard_kpis: {
        Args: { p_company_id: string; p_days?: number }
        Returns: Json
      }
      get_mrp_summary: {
        Args: { p_company_id: string }
        Returns: {
          board_type_id: string
          board_type_name: string
          demand_sheets: number
          gsm: number
          incoming_sheets: number
          open_job_count: number
          reorder_level: number
          shortfall_sheets: number
          stock_sheets: number
        }[]
      }
      get_next_document_number: {
        Args: { p_company_id: string; p_document_type: string; p_year?: number }
        Returns: string
      }
      get_next_sequence_number: {
        Args: { p_company_id: string; p_document_type: string }
        Returns: string
      }
      get_po_three_way_match: {
        Args: { p_company_id: string; p_po_id: string }
        Returns: {
          billed_price: number
          billed_qty: number
          description: string
          match_status: string
          ordered_price: number
          ordered_qty: number
          po_item_id: string
          received_qty: number
        }[]
      }
      get_qc_defect_trends: {
        Args: { p_company_id: string; p_date_from: string; p_date_to: string }
        Returns: {
          by_customer: Json
          by_severity: Json
          by_type: Json
          by_week: Json
          total_defects: number
          total_qty_affected: number
        }[]
      }
      get_so_fulfillment: {
        Args: { p_company_id: string; p_sales_order_id: string }
        Returns: {
          dispatched_qty: number
          invoiced_qty: number
          ordered_qty: number
          sales_order_item_id: string
        }[]
      }
      has_permission: {
        Args: { p_action: string; p_module: string; p_user_id: string }
        Returns: boolean
      }
      mark_plate_reused: { Args: { p_plate_id: string }; Returns: undefined }
      record_customer_ledger_entry: {
        Args: {
          p_company_id: string
          p_created_by?: string
          p_credit?: number
          p_customer_id: string
          p_debit?: number
          p_description: string
          p_entry_date?: string
          p_entry_type: string
          p_reference_id?: string
          p_reference_type?: string
        }
        Returns: {
          balance_after: number
          company_id: string
          created_at: string
          created_by: string | null
          credit: number
          customer_id: string
          debit: number
          deleted_at: string | null
          description: string
          entry_date: string
          entry_type: string
          id: string
          is_active: boolean
          reference_id: string | null
          reference_type: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "customer_ledger_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_supplier_ledger_entry: {
        Args: {
          p_company_id: string
          p_created_by?: string
          p_credit?: number
          p_debit?: number
          p_description: string
          p_entry_date?: string
          p_entry_type: string
          p_reference_id?: string
          p_reference_type?: string
          p_vendor_id: string
        }
        Returns: {
          balance_after: number
          company_id: string
          created_at: string
          created_by: string | null
          credit: number
          debit: number
          deleted_at: string | null
          description: string
          entry_date: string
          entry_type: string
          id: string
          is_active: boolean
          reference_id: string | null
          reference_type: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        SetofOptions: {
          from: "*"
          to: "supplier_ledger_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
      upsert_notification_digest: {
        Args: {
          p_company_id: string
          p_group_key: string
          p_link_url?: string
          p_message: string
          p_title: string
          p_type?: string
          p_user_id: string
          p_window_minutes?: number
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
