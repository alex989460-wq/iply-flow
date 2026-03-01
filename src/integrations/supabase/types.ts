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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      auto_replies: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          match_type: string
          priority: number
          reply_message: string
          trigger_keyword: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          match_type?: string
          priority?: number
          reply_message: string
          trigger_keyword: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          match_type?: string
          priority?: number
          reply_message?: string
          trigger_keyword?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_logs: {
        Row: {
          billing_type: Database["public"]["Enums"]["billing_type"]
          customer_id: string
          id: string
          message: string
          sent_at: string
          whatsapp_status: string | null
        }
        Insert: {
          billing_type: Database["public"]["Enums"]["billing_type"]
          customer_id: string
          id?: string
          message: string
          sent_at?: string
          whatsapp_status?: string | null
        }
        Update: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          customer_id?: string
          id?: string
          message?: string
          sent_at?: string
          whatsapp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_schedule: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          last_run_at: string | null
          last_run_status: string | null
          send_d_minus_1: boolean
          send_d_plus_1: boolean
          send_d0: boolean
          send_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          send_d_minus_1?: boolean
          send_d_plus_1?: boolean
          send_d0?: boolean
          send_time?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          send_d_minus_1?: boolean
          send_d_plus_1?: boolean
          send_d0?: boolean
          send_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          annual_price: number | null
          created_at: string
          custom_message: string | null
          id: string
          meta_template_name: string | null
          monthly_price: number | null
          notification_phone: string | null
          pix_key: string | null
          pix_key_type: string | null
          quarterly_price: number | null
          renewal_image_url: string | null
          renewal_message_template: string | null
          semiannual_price: number | null
          updated_at: string
          user_id: string
          vplay_integration_url: string | null
          vplay_key_message: string | null
        }
        Insert: {
          annual_price?: number | null
          created_at?: string
          custom_message?: string | null
          id?: string
          meta_template_name?: string | null
          monthly_price?: number | null
          notification_phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          quarterly_price?: number | null
          renewal_image_url?: string | null
          renewal_message_template?: string | null
          semiannual_price?: number | null
          updated_at?: string
          user_id: string
          vplay_integration_url?: string | null
          vplay_key_message?: string | null
        }
        Update: {
          annual_price?: number | null
          created_at?: string
          custom_message?: string | null
          id?: string
          meta_template_name?: string | null
          monthly_price?: number | null
          notification_phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          quarterly_price?: number | null
          renewal_image_url?: string | null
          renewal_message_template?: string | null
          semiannual_price?: number | null
          updated_at?: string
          user_id?: string
          vplay_integration_url?: string | null
          vplay_key_message?: string | null
        }
        Relationships: []
      }
      bot_triggers: {
        Row: {
          bot_department_id: string | null
          bot_department_name: string | null
          created_at: string
          days_offset: number | null
          id: string
          is_enabled: boolean
          message_template: string | null
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_department_id?: string | null
          bot_department_name?: string | null
          created_at?: string
          days_offset?: number | null
          id?: string
          is_enabled?: boolean
          message_template?: string | null
          trigger_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_department_id?: string | null
          bot_department_name?: string | null
          created_at?: string
          days_offset?: number | null
          id?: string
          is_enabled?: boolean
          message_template?: string | null
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      broadcast_logs: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          last_error: string | null
          last_sent_at: string | null
          last_status: string
          phone_normalized: string
          template_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          last_status?: string
          phone_normalized: string
          template_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          last_status?: string
          phone_normalized?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          created_by: string | null
          custom_price: number | null
          due_date: string
          extra_months: number
          id: string
          name: string
          notes: string | null
          phone: string
          plan_id: string | null
          screens: number
          server_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["customer_status"]
          username: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_price?: number | null
          due_date: string
          extra_months?: number
          id?: string
          name: string
          notes?: string | null
          phone: string
          plan_id?: string | null
          screens?: number
          server_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["customer_status"]
          username?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_price?: number | null
          due_date?: string
          extra_months?: number
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          plan_id?: string | null
          screens?: number
          server_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["customer_status"]
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_profiles_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          color: string | null
          created_at: string
          description: string
          due_date: string | null
          icon: string | null
          id: string
          notes: string | null
          paid: boolean
          paid_at: string | null
          recurring: boolean
          recurring_day: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          color?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          icon?: string | null
          id?: string
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          recurring?: boolean
          recurring_day?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          color?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          icon?: string | null
          id?: string
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          recurring?: boolean
          recurring_day?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goals_settings: {
        Row: {
          created_at: string
          customers_goal: number
          id: string
          projection_goal: number
          revenue_goal: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customers_goal?: number
          id?: string
          projection_goal?: number
          revenue_goal?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customers_goal?: number
          id?: string
          projection_goal?: number
          revenue_goal?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      panel_links: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      payment_confirmations: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          duration_days: number
          id: string
          new_due_date: string
          plan_name: string | null
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          duration_days?: number
          id?: string
          new_due_date: string
          plan_name?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          duration_days?: number
          id?: string
          new_due_date?: string
          plan_name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_confirmations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          confirmed: boolean
          created_at: string
          customer_id: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          payment_date: string
          source: string
        }
        Insert: {
          amount: number
          confirmed?: boolean
          created_at?: string
          customer_id: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          payment_date?: string
          source?: string
        }
        Update: {
          amount?: number
          confirmed?: boolean
          created_at?: string
          customer_id?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          payment_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          created_by: string | null
          duration_days: number
          id: string
          plan_name: string
          price: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_days: number
          id?: string
          plan_name: string
          price: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_days?: number
          id?: string
          plan_name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      quick_messages: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      reseller_access: {
        Row: {
          access_expires_at: string
          created_at: string
          credits: number
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          parent_reseller_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_expires_at?: string
          created_at?: string
          credits?: number
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          parent_reseller_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_expires_at?: string
          created_at?: string
          credits?: number
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          parent_reseller_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_access_parent_reseller_id_fkey"
            columns: ["parent_reseller_id"]
            isOneToOne: false
            referencedRelation: "reseller_access"
            referencedColumns: ["user_id"]
          },
        ]
      }
      reseller_api_settings: {
        Row: {
          cakto_client_id: string | null
          cakto_client_secret: string | null
          cakto_webhook_secret: string | null
          created_at: string
          id: string
          natv_api_key: string | null
          natv_base_url: string | null
          rush_base_url: string | null
          rush_password: string | null
          rush_token: string | null
          rush_username: string | null
          the_best_base_url: string | null
          the_best_password: string | null
          the_best_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cakto_client_id?: string | null
          cakto_client_secret?: string | null
          cakto_webhook_secret?: string | null
          created_at?: string
          id?: string
          natv_api_key?: string | null
          natv_base_url?: string | null
          rush_base_url?: string | null
          rush_password?: string | null
          rush_token?: string | null
          rush_username?: string | null
          the_best_base_url?: string | null
          the_best_password?: string | null
          the_best_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cakto_client_id?: string | null
          cakto_client_secret?: string | null
          cakto_webhook_secret?: string | null
          created_at?: string
          id?: string
          natv_api_key?: string | null
          natv_base_url?: string | null
          rush_base_url?: string | null
          rush_password?: string | null
          rush_token?: string | null
          rush_username?: string | null
          the_best_base_url?: string | null
          the_best_password?: string | null
          the_best_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      servers: {
        Row: {
          auto_renew: boolean
          created_at: string
          created_by: string | null
          description: string | null
          host: string
          id: string
          server_name: string
          status: Database["public"]["Enums"]["server_status"]
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          host: string
          id?: string
          server_name: string
          status?: Database["public"]["Enums"]["server_status"]
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          host?: string
          id?: string
          server_name?: string
          status?: Database["public"]["Enums"]["server_status"]
        }
        Relationships: [
          {
            foreignKeyName: "servers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vplay_servers: {
        Row: {
          created_at: string
          id: string
          integration_url: string
          is_default: boolean
          key_message: string
          server_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_url: string
          is_default?: boolean
          key_message?: string
          server_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_url?: string
          is_default?: boolean
          key_message?: string
          server_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          auto_reply_sent: boolean
          created_at: string
          event_type: string
          id: string
          message_content: string | null
          phone_from: string | null
          phone_to: string | null
          processed: boolean
          raw_payload: Json | null
          user_id: string | null
        }
        Insert: {
          auto_reply_sent?: boolean
          created_at?: string
          event_type: string
          id?: string
          message_content?: string | null
          phone_from?: string | null
          phone_to?: string | null
          processed?: boolean
          raw_payload?: Json | null
          user_id?: string | null
        }
        Update: {
          auto_reply_sent?: boolean
          created_at?: string
          event_type?: string
          id?: string
          message_content?: string | null
          phone_from?: string | null
          phone_to?: string | null
          processed?: boolean
          raw_payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      xui_one_settings: {
        Row: {
          access_code: string
          api_key: string
          base_url: string
          created_at: string
          id: string
          is_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          access_code?: string
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          access_code?: string
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zap_responder_settings: {
        Row: {
          api_base_url: string
          api_type: string
          created_at: string
          id: string
          instance_name: string | null
          meta_access_token: string | null
          meta_business_id: string | null
          meta_connected_at: string | null
          meta_display_phone: string | null
          meta_phone_number_id: string | null
          meta_token_expires_at: string | null
          meta_user_id: string | null
          selected_department_id: string | null
          selected_department_name: string | null
          selected_session_id: string | null
          selected_session_name: string | null
          selected_session_phone: string | null
          updated_at: string
          user_id: string | null
          zap_api_token: string | null
        }
        Insert: {
          api_base_url?: string
          api_type?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          meta_access_token?: string | null
          meta_business_id?: string | null
          meta_connected_at?: string | null
          meta_display_phone?: string | null
          meta_phone_number_id?: string | null
          meta_token_expires_at?: string | null
          meta_user_id?: string | null
          selected_department_id?: string | null
          selected_department_name?: string | null
          selected_session_id?: string | null
          selected_session_name?: string | null
          selected_session_phone?: string | null
          updated_at?: string
          user_id?: string | null
          zap_api_token?: string | null
        }
        Update: {
          api_base_url?: string
          api_type?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          meta_access_token?: string | null
          meta_business_id?: string | null
          meta_connected_at?: string | null
          meta_display_phone?: string | null
          meta_phone_number_id?: string | null
          meta_token_expires_at?: string | null
          meta_user_id?: string | null
          selected_department_id?: string | null
          selected_department_name?: string | null
          selected_session_id?: string | null
          selected_session_name?: string | null
          selected_session_phone?: string | null
          updated_at?: string
          user_id?: string | null
          zap_api_token?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_dashboard_stats_optimized: { Args: never; Returns: Json }
      get_monthly_revenue: { Args: never; Returns: Json }
      get_plan_distribution: { Args: never; Returns: Json }
      get_server_distribution: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      billing_type: "D-1" | "D0" | "D+1"
      customer_status: "ativa" | "inativa" | "suspensa"
      payment_method: "pix" | "dinheiro" | "transferencia"
      server_status: "online" | "offline" | "manutencao"
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
      app_role: ["admin", "user"],
      billing_type: ["D-1", "D0", "D+1"],
      customer_status: ["ativa", "inativa", "suspensa"],
      payment_method: ["pix", "dinheiro", "transferencia"],
      server_status: ["online", "offline", "manutencao"],
    },
  },
} as const
