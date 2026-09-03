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
      driver_payouts: {
        Row: {
          amount_cents: number
          attempt_count: number
          created_at: string
          driver_id: string
          failure_reason: string | null
          id: string
          ride_id: string | null
          settling: boolean
          settling_since: string | null
          status: string
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          attempt_count?: number
          created_at?: string
          driver_id: string
          failure_reason?: string | null
          id?: string
          ride_id?: string | null
          settling?: boolean
          settling_since?: string | null
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          attempt_count?: number
          created_at?: string
          driver_id?: string
          failure_reason?: string | null
          id?: string
          ride_id?: string | null
          settling?: boolean
          settling_since?: string | null
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_payouts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_payouts_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          accepting_rides: boolean
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
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
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
          accepting_rides?: boolean
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
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
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
          accepting_rides?: boolean
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
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
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
          authorization_buffer_bps: number
          base_cents: number
          cancellation_fee_cents: number
          cancellation_grace_seconds: number
          effective_from: string
          id: string
          market: string
          minimum_fare_cents: number
          per_mile_cents: number
          per_minute_cents: number
        }
        Insert: {
          active?: boolean
          authorization_buffer_bps?: number
          base_cents: number
          cancellation_fee_cents?: number
          cancellation_grace_seconds?: number
          effective_from: string
          id?: string
          market: string
          minimum_fare_cents: number
          per_mile_cents: number
          per_minute_cents: number
        }
        Update: {
          active?: boolean
          authorization_buffer_bps?: number
          base_cents?: number
          cancellation_fee_cents?: number
          cancellation_grace_seconds?: number
          effective_from?: string
          id?: string
          market?: string
          minimum_fare_cents?: number
          per_mile_cents?: number
          per_minute_cents?: number
        }
        Relationships: []
      }
      ride_charges: {
        Row: {
          attempt_count: number
          authorized_cents: number
          captured_cents: number | null
          created_at: string
          failure_reason: string | null
          id: string
          ride_id: string
          rider_id: string
          settling: boolean
          settling_since: string | null
          status: string
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          authorized_cents: number
          captured_cents?: number | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          ride_id: string
          rider_id: string
          settling?: boolean
          settling_since?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          authorized_cents?: number
          captured_cents?: number | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          ride_id?: string
          rider_id?: string
          settling?: boolean
          settling_since?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_charges_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_declines: {
        Row: {
          declined_at: string
          driver_id: string
          ride_id: string
        }
        Insert: {
          declined_at?: string
          driver_id: string
          ride_id: string
        }
        Update: {
          declined_at?: string
          driver_id?: string
          ride_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_declines_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_declines_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_payment_profiles: {
        Row: {
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          created_at: string
          default_payment_method_id: string | null
          rider_id: string
          stripe_customer_id: string
          updated_at: string
        }
        Insert: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string
          default_payment_method_id?: string | null
          rider_id: string
          stripe_customer_id: string
          updated_at?: string
        }
        Update: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string
          default_payment_method_id?: string | null
          rider_id?: string
          stripe_customer_id?: string
          updated_at?: string
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
          rider_total_cents: number | null
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
          rider_total_cents?: number | null
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
          rider_total_cents?: number | null
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
          authorization_buffer_bps: number
          base_cents: number
          cancellation_fee_cents: number
          cancellation_grace_seconds: number
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
      claim_driver_payout_attempt: {
        Args: { p_payout_id: string }
        Returns: number
      }
      claim_ride_charge_attempt: {
        Args: { p_charge_id: string }
        Returns: number
      }
      driver_month_to_date: {
        Args: { p_driver_id: string }
        Returns: {
          gross_fare_cents: number
          year_month: string
        }[]
      }
      release_driver_payout_attempt: {
        Args: { p_payout_id: string }
        Returns: undefined
      }
      release_ride_charge_attempt: {
        Args: { p_charge_id: string }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
