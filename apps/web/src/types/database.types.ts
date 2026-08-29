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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      commission_tiers: {
        Row: {
          active: boolean
          effective_from: string
          id: string
          lower_bound_cents: number
          rate_bps: number
          tier_order: number
          upper_bound_cents: number | null
        }
        Insert: {
          active?: boolean
          effective_from: string
          id?: string
          lower_bound_cents: number
          rate_bps: number
          tier_order: number
          upper_bound_cents?: number | null
        }
        Update: {
          active?: boolean
          effective_from?: string
          id?: string
          lower_bound_cents?: number
          rate_bps?: number
          tier_order?: number
          upper_bound_cents?: number | null
        }
        Relationships: []
      }
      driver_monthly_stats: {
        Row: {
          commission_cents: number
          driver_id: string
          gross_fare_cents: number
          id: string
          payout_cents: number
          rides_count: number
          updated_at: string
          year_month: string
        }
        Insert: {
          commission_cents?: number
          driver_id: string
          gross_fare_cents?: number
          id?: string
          payout_cents?: number
          rides_count?: number
          updated_at?: string
          year_month: string
        }
        Update: {
          commission_cents?: number
          driver_id?: string
          gross_fare_cents?: number
          id?: string
          payout_cents?: number
          rides_count?: number
          updated_at?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_monthly_stats_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          auth_user_id: string
          background_check_status: string
          created_at: string
          dmv_check_status: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          status: string
          stripe_account_id: string | null
          training_completed: boolean
          updated_at: string
          vehicle_inspection_date: string | null
          vehicle_inspection_status: string
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
          vehicle_year: number | null
        }
        Insert: {
          auth_user_id: string
          background_check_status?: string
          created_at?: string
          dmv_check_status?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          status?: string
          stripe_account_id?: string | null
          training_completed?: boolean
          updated_at?: string
          vehicle_inspection_date?: string | null
          vehicle_inspection_status?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
        }
        Update: {
          auth_user_id?: string
          background_check_status?: string
          created_at?: string
          dmv_check_status?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          stripe_account_id?: string | null
          training_completed?: boolean
          updated_at?: string
          vehicle_inspection_date?: string | null
          vehicle_inspection_status?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
        }
        Relationships: []
      }
      fare_rate_cards: {
        Row: {
          active: boolean
          base_cents: number
          effective_from: string
          id: string
          market: string
          minimum_fare_cents: number
          per_mile_cents: number
          per_minute_cents: number
        }
        Insert: {
          active?: boolean
          base_cents: number
          effective_from: string
          id?: string
          market: string
          minimum_fare_cents: number
          per_mile_cents: number
          per_minute_cents: number
        }
        Update: {
          active?: boolean
          base_cents?: number
          effective_from?: string
          id?: string
          market?: string
          minimum_fare_cents?: number
          per_mile_cents?: number
          per_minute_cents?: number
        }
        Relationships: []
      }
      rides: {
        Row: {
          accepted_at: string | null
          canceled_at: string | null
          commission_cents: number | null
          commission_rate_bps: number | null
          completed_at: string | null
          created_at: string
          distance_meters: number | null
          driver_id: string | null
          driver_payout_cents: number | null
          dropoff_address: string | null
          dropoff_geog: unknown
          dropoff_lat: number | null
          dropoff_lng: number | null
          duration_seconds: number | null
          fare_cents: number
          id: string
          pickup_address: string | null
          pickup_geog: unknown
          pickup_lat: number | null
          pickup_lng: number | null
          requested_at: string
          rider_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          canceled_at?: string | null
          commission_cents?: number | null
          commission_rate_bps?: number | null
          completed_at?: string | null
          created_at?: string
          distance_meters?: number | null
          driver_id?: string | null
          driver_payout_cents?: number | null
          dropoff_address?: string | null
          dropoff_geog?: unknown
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          duration_seconds?: number | null
          fare_cents: number
          id?: string
          pickup_address?: string | null
          pickup_geog?: unknown
          pickup_lat?: number | null
          pickup_lng?: number | null
          requested_at?: string
          rider_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          canceled_at?: string | null
          commission_cents?: number | null
          commission_rate_bps?: number | null
          completed_at?: string | null
          created_at?: string
          distance_meters?: number | null
          driver_id?: string | null
          driver_payout_cents?: number | null
          dropoff_address?: string | null
          dropoff_geog?: unknown
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          duration_seconds?: number | null
          fare_cents?: number
          id?: string
          pickup_address?: string | null
          pickup_geog?: unknown
          pickup_lat?: number | null
          pickup_lng?: number | null
          requested_at?: string
          rider_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          driver_id: string
          fee_active: boolean
          flat_fee_cents: number
          id: string
          plan: string
          status: string
          stripe_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          current_period_end: string
          current_period_start: string
          driver_id: string
          fee_active?: boolean
          flat_fee_cents: number
          id?: string
          plan: string
          status?: string
          stripe_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          driver_id?: string
          fee_active?: boolean
          flat_fee_cents?: number
          id?: string
          plan?: string
          status?: string
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_commission_tiers: {
        Args: never
        Returns: {
          active: boolean
          effective_from: string
          id: string
          lower_bound_cents: number
          rate_bps: number
          tier_order: number
          upper_bound_cents: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "commission_tiers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      active_fare_rate_card: {
        Args: { p_market: string }
        Returns: {
          active: boolean
          base_cents: number
          effective_from: string
          id: string
          market: string
          minimum_fare_cents: number
          per_mile_cents: number
          per_minute_cents: number
        }[]
        SetofOptions: {
          from: "*"
          to: "fare_rate_cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      apply_ride_commission: {
        Args: {
          p_commission_cents: number
          p_commission_rate_bps: number
          p_driver_payout_cents: number
          p_expected_mtd_gross_cents: number
          p_expected_year_month: string
          p_ride_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["ride_commission_application"]
        SetofOptions: {
          from: "*"
          to: "ride_commission_application"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_month_to_date: {
        Args: { p_driver_id: string }
        Returns: {
          gross_fare_cents: number
          year_month: string
        }[]
      }
      reserve_driver_month: {
        Args: { p_completed_at: string; p_driver_id: string }
        Returns: {
          commission_cents: number
          driver_id: string
          gross_fare_cents: number
          id: string
          payout_cents: number
          rides_count: number
          updated_at: string
          year_month: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_monthly_stats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rido_year_month: { Args: { p_ts: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      ride_commission_application: {
        outcome: string | null
        ride_id: string | null
        ride_status: string | null
        fare_cents: number | null
        year_month: string | null
        mtd_gross_cents: number | null
        commission_rate_bps: number | null
        commission_cents: number | null
        driver_payout_cents: number | null
        completed_at: string | null
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
