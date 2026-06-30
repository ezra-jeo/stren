export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          created_at: string | null
          created_by: string | null
          gym_id: string | null
          id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by?: string | null
          gym_id?: string | null
          id?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string | null
          gym_id?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          check_in: string | null
          check_out: string | null
          duration_min: number | null
          gym_id: string | null
          id: string
          member_id: string | null
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          duration_min?: number | null
          gym_id?: string | null
          id?: string
          member_id?: string | null
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          duration_min?: number | null
          gym_id?: string | null
          id?: string
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_items: {
        Row: {
          created_at: string | null
          description: string | null
          gym_id: string | null
          id: string
          kudos_count: number | null
          member_id: string | null
          metadata: Json | null
          title: string
          type: Database["public"]["Enums"]["feed_item_type"]
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          gym_id?: string | null
          id?: string
          kudos_count?: number | null
          member_id?: string | null
          metadata?: Json | null
          title: string
          type: Database["public"]["Enums"]["feed_item_type"]
        }
        Update: {
          created_at?: string | null
          description?: string | null
          gym_id?: string | null
          id?: string
          kudos_count?: number | null
          member_id?: string | null
          metadata?: Json | null
          title?: string
          type?: Database["public"]["Enums"]["feed_item_type"]
        }
        Relationships: [
          {
            foreignKeyName: "feed_items_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gyms: {
        Row: {
          address: string | null
          amenities: string[] | null
          brand_color: string | null
          secondary_color: string | null
          code: string
          cover_path: string | null
          cover_url: string | null
          created_at: string | null
          description: string | null
          directions: string | null
          id: string
          is_published: boolean | null
          logo_path: string | null
          logo_url: string | null
          map_embed_url: string | null
          name: string
          operating_hours: Json | null
          phone: string | null
          pricing_packages: Json | null
          social_links: Json | null
          tagline: string | null
          team_members: Json | null
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          brand_color?: string | null
          secondary_color?: string | null
          code: string
          cover_path?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          directions?: string | null
          id?: string
          is_published?: boolean | null
          logo_path?: string | null
          logo_url?: string | null
          map_embed_url?: string | null
          name: string
          operating_hours?: Json | null
          phone?: string | null
          pricing_packages?: Json | null
          social_links?: Json | null
          tagline?: string | null
          team_members?: Json | null
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          brand_color?: string | null
          secondary_color?: string | null
          code?: string
          cover_path?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          directions?: string | null
          id?: string
          is_published?: boolean | null
          logo_path?: string | null
          logo_url?: string | null
          map_embed_url?: string | null
          name?: string
          operating_hours?: Json | null
          phone?: string | null
          pricing_packages?: Json | null
          social_links?: Json | null
          tagline?: string | null
          team_members?: Json | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          for_member: boolean | null
          gym_id: string
          id: string
          is_read: boolean | null
          member_id: string | null
          notification_type: Database["public"]["Enums"]["notification_type"] | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          for_member?: boolean | null
          gym_id: string
          id?: string
          is_read?: boolean | null
          member_id?: string | null
          notification_type?: Database["public"]["Enums"]["notification_type"] | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          for_member?: boolean | null
          gym_id?: string
          id?: string
          is_read?: boolean | null
          member_id?: string | null
          notification_type?: Database["public"]["Enums"]["notification_type"] | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          description: string | null
          duration_days: number
          gym_id: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          sort_order: number | null
        }
        Insert: {
          description?: string | null
          duration_days: number
          gym_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price: number
          sort_order?: number | null
        }
        Update: {
          description?: string | null
          duration_days?: number
          gym_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          amount_paid: number
          created_at: string | null
          end_date: string
          gym_id: string | null
          id: string
          member_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          plan_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["membership_status"] | null
        }
        Insert: {
          amount_paid: number
          created_at?: string | null
          end_date: string
          gym_id?: string | null
          id?: string
          member_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          plan_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["membership_status"] | null
        }
        Update: {
          amount_paid?: number
          created_at?: string | null
          end_date?: string
          gym_id?: string | null
          id?: string
          member_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          plan_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["membership_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          contact_number: string | null
          created_at: string | null
          email: string
          gym_id: string | null
          id: string
          name: string
          qr_code: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          status: Database["public"]["Enums"]["profile_status"] | null
        }
        Insert: {
          avatar_url?: string | null
          contact_number?: string | null
          created_at?: string | null
          email: string
          gym_id?: string | null
          id: string
          name: string
          qr_code?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          status?: Database["public"]["Enums"]["profile_status"] | null
        }
        Update: {
          avatar_url?: string | null
          contact_number?: string | null
          created_at?: string | null
          email?: string
          gym_id?: string | null
          id?: string
          name?: string
          qr_code?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          status?: Database["public"]["Enums"]["profile_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      promos: {
        Row: {
          created_at: string | null
          description: string | null
          discount_type: string
          discount_value: number
          gym_id: string
          id: string
          is_active: boolean | null
          name: string
          plan_id: string | null
          type: Database["public"]["Enums"]["promo_type"]
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          gym_id: string
          id?: string
          is_active?: boolean | null
          name: string
          plan_id?: string | null
          type?: Database["public"]["Enums"]["promo_type"]
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          gym_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          plan_id?: string | null
          type?: Database["public"]["Enums"]["promo_type"]
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promos_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promos_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      streaks: {
        Row: {
          avg_visit_interval_days: number | null
          best_streak: number | null
          current_streak: number | null
          first_visit_date: string | null
          gym_id: string | null
          id: string
          last_visit_date: string | null
          member_id: string | null
          total_visits: number | null
        }
        Insert: {
          avg_visit_interval_days?: number | null
          best_streak?: number | null
          current_streak?: number | null
          first_visit_date?: string | null
          gym_id?: string | null
          id?: string
          last_visit_date?: string | null
          member_id?: string | null
          total_visits?: number | null
        }
        Update: {
          avg_visit_interval_days?: number | null
          best_streak?: number | null
          current_streak?: number | null
          first_visit_date?: string | null
          gym_id?: string | null
          id?: string
          last_visit_date?: string | null
          member_id?: string | null
          total_visits?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "streaks_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streaks_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_notification_preferences: {
        Row: {
          id: string
          member_id: string
          gym_id: string
          inactivity_nudges_enabled: boolean
          streak_notifications_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_id: string
          gym_id: string
          inactivity_nudges_enabled?: boolean
          streak_notifications_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          gym_id?: string
          inactivity_nudges_enabled?: boolean
          streak_notifications_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notification_preferences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notification_preferences_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_cooldowns: {
        Row: {
          id: string
          member_id: string
          gym_id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          last_sent_at: string
          inactivity_nudge_count: number
          daily_count: number
          daily_count_date: string
        }
        Insert: {
          id?: string
          member_id: string
          gym_id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          last_sent_at?: string
          inactivity_nudge_count?: number
          daily_count?: number
          daily_count_date?: string
        }
        Update: {
          id?: string
          member_id?: string
          gym_id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          last_sent_at?: string
          inactivity_nudge_count?: number
          daily_count?: number
          daily_count_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_cooldowns_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_cooldowns_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      // ── Auth helpers ──
      check_gym_membership: {
        Args: { p_email: string; p_gym_code: string }
        Returns: boolean
      }
      get_gym_id: { Args: Record<string, never>; Returns: string }
      get_user_role: { Args: Record<string, never>; Returns: string }
      is_manager: { Args: Record<string, never>; Returns: boolean }

      // ── Gym signup ──
      create_gym_and_owner: {
        Args: {
          p_email: string
          p_gym_address?: string
          p_gym_code: string
          p_gym_name: string
          p_gym_phone?: string
          p_name: string
          p_user_id: string
        }
        Returns: Json
      }

      // ── Kiosk RPCs (callable by anon key, no auth session required) ──
      kiosk_checkin: { Args: { p_qr_code: string }; Returns: Json }
      kiosk_checkin_by_member: { Args: { p_member_id: string }; Returns: Json }
      kiosk_checkout: { Args: { p_attendance_id: string }; Returns: Json }
      kiosk_get_checked_in: {
        // No args = authenticated member portal (gym derived from session)
        // p_gym_id arg = unauthenticated kiosk path
        Args: { p_gym_id?: string } | Record<string, never>
        Returns: {
          attendance_id: string
          check_in: string
          member_id: string
          member_name: string
        }[]
      }
      kiosk_search_members: {
        Args: { p_query: string }
        Returns: {
          contact_number: string
          email: string
          end_date: string
          id: string
          membership_status: string
          name: string
          plan_name: string
        }[]
      }
      kiosk_update_streak: {
        Args: { p_gym_id: string; p_member_id: string }
        Returns: undefined
      }

      // ── Admin RPCs ──
      admin_dashboard_stats: {
        Args: Record<string, never>
        Returns: {
          currently_in: { id: string; member_id: string; check_in: string; name: string }[]
          today_visits: number
          total_members: number
          pending_count: number
          active_plans: number
          expired_plans: number
          frozen_plans: number
          today_revenue: number
          month_revenue: number
          attendance_7d: { day: string; date: string; visits: number }[]
          revenue_7d: { day: string; date: string; revenue: number }[]
        }
      }
      admin_reports_data: {
        Args: { p_days?: number }
        Returns: {
          active_count: number
          expired_count: number
          month_revenue: number
          attendance_by_day: { date: string; visits: number }[]
          revenue_by_day: { date: string; revenue: number }[]
          peak_hours: { hour: number; label: string; count: number }[]
          revenue_by_dom: { day: number; amount: number }[]
          method_breakdown: {
            cash_total: number
            cash_count: number
            gcash_total: number
            gcash_count: number
          }
        }
      }

      // ── Leaderboard RPCs ──
      leaderboard_workouts: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string | null
          member_id: string
          member_name: string
          value: number
        }[]
      }
      leaderboard_longest_member: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string | null
          member_id: string
          member_name: string
          value: number
        }[]
      }
      leaderboard_week_streak: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string | null
          member_id: string
          member_name: string
          value: number
        }[]
      }

      // ── Member RPCs ──
      member_home_stats: {
        Args: Record<string, never>
        Returns: {
          total_visits: number
          monthly_visits: number
          avg_session_minutes: number
          streak: {
            current_streak: number
            best_streak: number
            last_visit_date: string | null
          } | null
          recent_visits: { date: string; duration_min: number | null }[]
          calendar_dates: string[]
          membership?: {
            plan_name: string
            status: string
            end_date: string
            days_left: number
          }
        }
      }

      // ── Public RPCs ──
      get_gym_by_code: {
        Args: { p_code: string }
        Returns: {
          id: string
          name: string
          code: string
          address: string | null
          phone: string | null
          tagline: string | null
          description: string | null
          logo_url: string | null
          cover_url: string | null
          brand_color: string
          secondary_color: string | null
          operating_hours: Json | null
          amenities: string[] | null
          social_links: Json | null
          team_members: Json | null
          pricing_packages: Json | null
          map_embed_url: string | null
          directions: string | null
          member_count: number
          is_published: boolean
        } | null
      }
      search_gyms: {
        Args: { p_query: string }
        Returns: {
          address: string
          code: string
          id: string
          name: string
        }[]
      }

      // ── Internal trigger functions (not called directly from the client) ──
      handle_new_user: { Args: Record<string, never>; Returns: unknown }
      handle_checkin_notification: { Args: Record<string, never>; Returns: unknown }
      handle_pending_member_notification: { Args: Record<string, never>; Returns: unknown }

      // ── Notification system functions ──
      calculate_avg_visit_interval: { Args: { p_member_id: string }; Returns: number | null }
      can_send_member_notification: { 
        Args: { p_member_id: string; p_notification_type: Database["public"]["Enums"]["notification_type"] }
        Returns: boolean 
      }
      create_member_notification: {
        Args: { 
          p_member_id: string
          p_gym_id: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_title: string
          p_body: string
        }
        Returns: string | null
      }
      process_daily_notifications: {
        Args: Record<string, never>
        Returns: {
          expiry_notifications: number
          inactivity_notifications: number
          processed_at: string
        }
      }
      process_expiry_notifications: { Args: Record<string, never>; Returns: number }
      process_inactivity_notifications: { Args: Record<string, never>; Returns: number }
    }
    Enums: {
      feed_item_type:
        | "check_in"
        | "check_out"
        | "announcement"
        | "streak_milestone"
      membership_status: "active" | "expired" | "frozen"
      notification_type:
        | "membership_expiry_7d"
        | "membership_expiry_0d"
        | "streak_milestone"
        | "inactivity_nudge"
        | "announcement"
      payment_method: "cash" | "gcash"
      profile_status: "pending" | "active" | "rejected"
      promo_type: "student_pass" | "new_member" | "birthday" | "custom"
      user_role: "member" | "admin" | "staff" | "owner"
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
    Enums: {
      feed_item_type: [
        "check_in",
        "check_out",
        "announcement",
        "streak_milestone",
      ],
      membership_status: ["active", "expired", "frozen"],
      payment_method: ["cash", "gcash"],
      profile_status: ["pending", "active", "rejected"],
      promo_type: ["student_pass", "new_member", "birthday", "custom"],
      user_role: ["member", "admin", "staff", "owner"],
    },
  },
} as const