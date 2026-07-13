export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      checkins: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string | null
          gym_id: string | null
          id: string
          member_id: string | null
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          gym_id?: string | null
          id?: string
          member_id?: string | null
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          gym_id?: string | null
          id?: string
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_enrollments: {
        Row: {
          class_id: string | null
          created_at: string | null
          gym_id: string | null
          id: string
          member_id: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          gym_id?: string | null
          id?: string
          member_id?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          gym_id?: string | null
          id?: string
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          capacity: number | null
          created_at: string | null
          end_time: string | null
          gym_id: string | null
          id: string
          instructor_id: string | null
          name: string
          start_time: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string | null
          end_time?: string | null
          gym_id?: string | null
          id?: string
          instructor_id?: string | null
          name: string
          start_time?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string | null
          end_time?: string | null
          gym_id?: string | null
          id?: string
          instructor_id?: string | null
          name?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_instructor_id_fkey"
            columns: ["instructor_id"]
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
      gym_feature_settings: {
        Row: {
          flags: Json
          gym_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          flags?: Json
          gym_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          flags?: Json
          gym_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gym_feature_settings_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_feature_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_role_permission_defaults: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      gym_user_permission_overrides: {
        Row: {
          granted: boolean
          granted_by: string | null
          gym_id: string
          permission: string
          updated_at: string
          user_id: string
        }
        Insert: {
          granted: boolean
          granted_by?: string | null
          gym_id: string
          permission: string
          updated_at?: string
          user_id: string
        }
        Update: {
          granted?: boolean
          granted_by?: string | null
          gym_id?: string
          permission?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_user_permission_overrides_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
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
          code: string
          cover_focal: Json
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
          secondary_color: string | null
          section_visibility: Json
          social_links: Json | null
          tagline: string | null
          team_members: Json | null
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          brand_color?: string | null
          code: string
          cover_focal?: Json
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
          secondary_color?: string | null
          section_visibility?: Json
          social_links?: Json | null
          tagline?: string | null
          team_members?: Json | null
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          brand_color?: string | null
          code?: string
          cover_focal?: Json
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
          secondary_color?: string | null
          section_visibility?: Json
          social_links?: Json | null
          tagline?: string | null
          team_members?: Json | null
        }
        Relationships: []
      }
      member_notification_preferences: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          inactivity_nudges_enabled: boolean
          member_id: string
          streak_notifications_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          inactivity_nudges_enabled?: boolean
          member_id: string
          streak_notifications_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          inactivity_nudges_enabled?: boolean
          member_id?: string
          streak_notifications_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notification_preferences_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notification_preferences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_onboarding_events: {
        Row: {
          created_at: string
          created_by: string
          email: string
          gym_id: string
          id: string
          magic_link_url: string | null
          member_id: string
          qr_code: string
          sent_at: string
          sent_via: string
        }
        Insert: {
          created_at?: string
          created_by: string
          email: string
          gym_id: string
          id?: string
          magic_link_url?: string | null
          member_id: string
          qr_code: string
          sent_at?: string
          sent_via?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string
          gym_id?: string
          id?: string
          magic_link_url?: string | null
          member_id?: string
          qr_code?: string
          sent_at?: string
          sent_via?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_onboarding_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_onboarding_events_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_onboarding_events_member_id_fkey"
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
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
      notification_cooldowns: {
        Row: {
          daily_count: number
          daily_count_date: string
          gym_id: string
          id: string
          inactivity_nudge_count: number
          last_sent_at: string
          member_id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          daily_count?: number
          daily_count_date?: string
          gym_id: string
          id?: string
          inactivity_nudge_count?: number
          last_sent_at?: string
          member_id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          daily_count?: number
          daily_count_date?: string
          gym_id?: string
          id?: string
          inactivity_nudge_count?: number
          last_sent_at?: string
          member_id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_cooldowns_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_cooldowns_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          notification_type:
            | Database["public"]["Enums"]["notification_type"]
            | null
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
          notification_type?:
            | Database["public"]["Enums"]["notification_type"]
            | null
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
          notification_type?:
            | Database["public"]["Enums"]["notification_type"]
            | null
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
      payments: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          gym_id: string | null
          id: string
          member_id: string | null
          method: string | null
          payment_date: string | null
          recorded_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          gym_id?: string | null
          id?: string
          member_id?: string | null
          method?: string | null
          payment_date?: string | null
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          gym_id?: string | null
          id?: string
          member_id?: string | null
          method?: string | null
          payment_date?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_users: {
        Row: { gym_id: string; user_id: string; role: Database["public"]["Enums"]["user_role"]; status: Database["public"]["Enums"]["profile_status"]; added_by: string | null; created_at: string; updated_at: string }
        Insert: { gym_id: string; user_id: string; role?: Database["public"]["Enums"]["user_role"]; status?: Database["public"]["Enums"]["profile_status"]; added_by?: string | null; created_at?: string; updated_at?: string }
        Update: { gym_id?: string; user_id?: string; role?: Database["public"]["Enums"]["user_role"]; status?: Database["public"]["Enums"]["profile_status"]; added_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "gym_users_gym_id_fkey"; columns: ["gym_id"]; isOneToOne: false; referencedRelation: "gyms"; referencedColumns: ["id"] },
          { foreignKeyName: "gym_users_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "gym_users_added_by_fkey"; columns: ["added_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      gym_verification_reminders: {
        Row: {
          created_at: string
          gym_id: string
          last_sent_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          last_sent_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          last_sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_verification_reminders_gym_user_fkey"
            columns: ["gym_id", "user_id"]
            isOneToOne: false
            referencedRelation: "gym_users"
            referencedColumns: ["gym_id", "user_id"]
          },
        ]
      }
      saved_gyms: {
        Row: {
          created_at: string
          gym_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_gyms_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_gyms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_gym_id: string | null
          avatar_change_count: number
          avatar_change_locked_until: string | null
          avatar_required: boolean
          avatar_updated_at: string | null
          avatar_url: string | null
          contact_number: string | null
          created_at: string | null
          email: string
          id: string
          name: string
          qr_code: string | null
        }
        Insert: {
          active_gym_id?: string | null
          avatar_change_count?: number
          avatar_change_locked_until?: string | null
          avatar_required?: boolean
          avatar_updated_at?: string | null
          avatar_url?: string | null
          contact_number?: string | null
          created_at?: string | null
          email: string
          id: string
          name: string
          qr_code?: string | null
        }
        Update: {
          active_gym_id?: string | null
          avatar_change_count?: number
          avatar_change_locked_until?: string | null
          avatar_required?: boolean
          avatar_updated_at?: string | null
          avatar_url?: string | null
          contact_number?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          qr_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_gym_id_fkey"
            columns: ["active_gym_id"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_dashboard_stats: { Args: never; Returns: Json }
      admin_reports_data: { Args: { p_days?: number }; Returns: Json }
      calculate_avg_visit_interval: {
        Args: { p_member_id: string }
        Returns: number
      }
      can_send_member_notification: {
        Args: {
          p_member_id: string
          p_notification_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: boolean
      }
      confirm_membership_verification: {
        Args: { p_gym_id: string; p_user_id: string }
        Returns: Json
      }
      create_gym: { Args: { p_code: string; p_name: string }; Returns: Database["public"]["Tables"]["gyms"]["Row"] }
      create_member_notification: {
        Args: {
          p_body: string
          p_gym_id: string
          p_member_id: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: string
      }
      escape_ilike: { Args: { p_input: string }; Returns: string }
      generate_secure_gym_suffix: {
        Args: { p_length?: number }
        Returns: string
      }
      get_gym_by_code: { Args: { p_code: string }; Returns: Json }
      get_gym_id: { Args: never; Returns: string }
      get_my_access: { Args: never; Returns: Json }
      get_my_membership_verifications: {
        Args: never
        Returns: {
          address: string | null
          code: string
          gym_id: string
          last_reminded_at: string | null
          logo_url: string | null
          name: string
          status: Database["public"]["Enums"]["profile_status"]
          submitted_at: string
        }[]
      }
      get_my_saved_gyms: {
        Args: never
        Returns: {
          address: string | null
          code: string
          gym_id: string
          logo_url: string | null
          name: string
          saved_at: string
        }[]
      }
      get_my_gyms: {
        Args: never
        Returns: { gym_id: string; code: string; name: string; logo_url: string | null; role: Database["public"]["Enums"]["user_role"]; status: Database["public"]["Enums"]["profile_status"] }[]
      }
      get_user_role: { Args: never; Returns: string }
      gym_feature_enabled: {
        Args: { p_feature: string; p_gym_id?: string }
        Returns: boolean
      }
      has_gym_permission: {
        Args: { p_gym_id?: string; p_permission: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_gym_saved: { Args: { p_gym_id: string }; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      join_gym: { Args: { p_gym_id: string }; Returns: Json }
      kiosk_access_allowed: { Args: { p_gym_id: string }; Returns: boolean }
      kiosk_checkin: { Args: { p_qr_code: string; p_gym_id: string }; Returns: Json }
      kiosk_checkin_by_member: { Args: { p_member_id: string; p_gym_id: string }; Returns: Json }
      kiosk_checkout: { Args: { p_attendance_id: string; p_gym_id: string }; Returns: Json }
      kiosk_get_checked_in: {
        Args: { p_gym_id: string }
        Returns: {
          attendance_id: string
          check_in: string
          member_id: string
          member_name: string
        }[]
      }
      kiosk_search_members: {
        Args: { p_query: string; p_gym_id: string }
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
      set_active_gym: { Args: { p_gym_id: string }; Returns: Json }
      leaderboard_longest_member: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          member_id: string
          member_name: string
          value: number
        }[]
      }
      leaderboard_week_streak: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          member_id: string
          member_name: string
          value: number
        }[]
      }
      leaderboard_workouts: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          member_id: string
          member_name: string
          value: number
        }[]
      }
      member_home_stats: { Args: never; Returns: Json }
      process_daily_notifications: { Args: never; Returns: Json }
      process_expiry_notifications: { Args: never; Returns: number }
      process_inactivity_notifications: { Args: never; Returns: number }
      record_notification_sent: {
        Args: {
          p_gym_id: string
          p_member_id: string
          p_notification_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: undefined
      }
      save_gym: { Args: { p_gym_id: string }; Returns: Json }
      search_gyms: {
        Args: { p_query: string }
        Returns: {
          address: string
          code: string
          id: string
          name: string
        }[]
      }
      set_member_avatar_with_cooldown: {
        Args: {
          p_avatar_url: string
          p_lock_days?: number
          p_member_id: string
        }
        Returns: {
          message: string
          next_allowed_at: string
          updated: boolean
        }[]
      }
      send_membership_verification_reminder: {
        Args: { p_gym_id: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unsave_gym: { Args: { p_gym_id: string }; Returns: Json }
      verify_gym_membership: { Args: { p_gym_id: string }; Returns: Json }
      withdraw_membership_verification: {
        Args: { p_gym_id: string }
        Returns: Json
      }
    }
    Enums: {
      feed_item_type:
        | "check_in"
        | "check_out"
        | "badge"
        | "challenge"
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
  storage: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      feed_item_type: [
        "check_in",
        "check_out",
        "badge",
        "challenge",
        "announcement",
        "streak_milestone",
      ],
      membership_status: ["active", "expired", "frozen"],
      notification_type: [
        "membership_expiry_7d",
        "membership_expiry_0d",
        "streak_milestone",
        "inactivity_nudge",
        "announcement",
      ],
      payment_method: ["cash", "gcash"],
      profile_status: ["pending", "active", "rejected"],
      promo_type: ["student_pass", "new_member", "birthday", "custom"],
      user_role: ["member", "admin", "staff", "owner"],
    },
  },
  storage: {
    Enums: {},
  },
} as const
