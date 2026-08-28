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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      activation_apps: {
        Row: {
          app_name: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_enabled: boolean | null
          logo_url: string | null
          price_annual: number | null
          price_monthly: number | null
          price_quarterly: number | null
          requires_email: boolean | null
          requires_mac: boolean | null
          sort_order: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_name: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_enabled?: boolean | null
          logo_url?: string | null
          price_annual?: number | null
          price_monthly?: number | null
          price_quarterly?: number | null
          requires_email?: boolean | null
          requires_mac?: boolean | null
          sort_order?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_name?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_enabled?: boolean | null
          logo_url?: string | null
          price_annual?: number | null
          price_monthly?: number | null
          price_quarterly?: number | null
          requires_email?: boolean | null
          requires_mac?: boolean | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      activation_panel_credentials: {
        Row: {
          created_at: string
          extra: Json
          id: string
          is_enabled: boolean
          panel_type: string
          password: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          extra?: Json
          id?: string
          is_enabled?: boolean
          panel_type: string
          password?: string
          updated_at?: string
          user_id: string
          username?: string
        }
        Update: {
          created_at?: string
          extra?: Json
          id?: string
          is_enabled?: boolean
          panel_type?: string
          password?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      activation_requests: {
        Row: {
          amount: number | null
          app_name: string
          cakto_payload: Json | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          email: string | null
          id: string
          mac_address: string | null
          payment_method: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          app_name: string
          cakto_payload?: Json | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          email?: string | null
          id?: string
          mac_address?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          app_name?: string
          cakto_payload?: Json | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          email?: string | null
          id?: string
          mac_address?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_automation_rules: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string | null
          id: string
          intent_name: string
          is_enabled: boolean | null
          user_id: string
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          created_at?: string | null
          id?: string
          intent_name: string
          is_enabled?: boolean | null
          user_id: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string | null
          id?: string
          intent_name?: string
          is_enabled?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      ai_knowledge_candidates: {
        Row: {
          best_answer: string
          canonical_question: string
          category: string | null
          confidence: number | null
          created_at: string
          embedding: string | null
          id: string
          keywords: string[] | null
          last_used_at: string | null
          similar_questions: string[] | null
          source_conversation_ids: string[] | null
          status: string
          success_count: number | null
          success_rate: number | null
          tags: string[] | null
          updated_at: string
          usage_count: number | null
          user_id: string
        }
        Insert: {
          best_answer: string
          canonical_question: string
          category?: string | null
          confidence?: number | null
          created_at?: string
          embedding?: string | null
          id?: string
          keywords?: string[] | null
          last_used_at?: string | null
          similar_questions?: string[] | null
          source_conversation_ids?: string[] | null
          status?: string
          success_count?: number | null
          success_rate?: number | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number | null
          user_id: string
        }
        Update: {
          best_answer?: string
          canonical_question?: string
          category?: string | null
          confidence?: number | null
          created_at?: string
          embedding?: string | null
          id?: string
          keywords?: string[] | null
          last_used_at?: string | null
          similar_questions?: string[] | null
          source_conversation_ids?: string[] | null
          status?: string
          success_count?: number | null
          success_rate?: number | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ai_knowledge_entries: {
        Row: {
          canonical_question: string | null
          category: string
          created_at: string
          embedding: string | null
          id: string
          is_enabled: boolean
          keywords: string[]
          media_filename: string | null
          media_mime: string | null
          media_type: string | null
          media_url: string | null
          requires_human: boolean
          response_template: string
          sort_order: number
          success_rate: number | null
          title: string
          updated_at: string
          usage_count: number | null
          user_id: string
        }
        Insert: {
          canonical_question?: string | null
          category?: string
          created_at?: string
          embedding?: string | null
          id?: string
          is_enabled?: boolean
          keywords?: string[]
          media_filename?: string | null
          media_mime?: string | null
          media_type?: string | null
          media_url?: string | null
          requires_human?: boolean
          response_template: string
          sort_order?: number
          success_rate?: number | null
          title: string
          updated_at?: string
          usage_count?: number | null
          user_id: string
        }
        Update: {
          canonical_question?: string | null
          category?: string
          created_at?: string
          embedding?: string | null
          id?: string
          is_enabled?: boolean
          keywords?: string[]
          media_filename?: string | null
          media_mime?: string | null
          media_type?: string | null
          media_url?: string | null
          requires_human?: boolean
          response_template?: string
          sort_order?: number
          success_rate?: number | null
          title?: string
          updated_at?: string
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ai_knowledge_items: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          apps: string[]
          category: string
          confidence: number
          created_at: string
          devices: string[]
          embedding: string | null
          flow_nodes: Json | null
          id: string
          keywords: string[]
          kind: Database["public"]["Enums"]["ai_knowledge_kind"]
          knowledge_entry_id: string | null
          last_used_at: string | null
          merged_into_id: string | null
          operators: Json
          problem: string | null
          resolved_count: number
          solution: string | null
          source_conversation_ids: string[]
          status: Database["public"]["Enums"]["ai_knowledge_item_status"]
          steps: Json | null
          subject: string
          success_rate: number
          tags: string[]
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          apps?: string[]
          category?: string
          confidence?: number
          created_at?: string
          devices?: string[]
          embedding?: string | null
          flow_nodes?: Json | null
          id?: string
          keywords?: string[]
          kind: Database["public"]["Enums"]["ai_knowledge_kind"]
          knowledge_entry_id?: string | null
          last_used_at?: string | null
          merged_into_id?: string | null
          operators?: Json
          problem?: string | null
          resolved_count?: number
          solution?: string | null
          source_conversation_ids?: string[]
          status?: Database["public"]["Enums"]["ai_knowledge_item_status"]
          steps?: Json | null
          subject: string
          success_rate?: number
          tags?: string[]
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          apps?: string[]
          category?: string
          confidence?: number
          created_at?: string
          devices?: string[]
          embedding?: string | null
          flow_nodes?: Json | null
          id?: string
          keywords?: string[]
          kind?: Database["public"]["Enums"]["ai_knowledge_kind"]
          knowledge_entry_id?: string | null
          last_used_at?: string | null
          merged_into_id?: string | null
          operators?: Json
          problem?: string | null
          resolved_count?: number
          solution?: string | null
          source_conversation_ids?: string[]
          status?: Database["public"]["Enums"]["ai_knowledge_item_status"]
          steps?: Json | null
          subject?: string
          success_rate?: number
          tags?: string[]
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_items_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_training_conversations: {
        Row: {
          analysis_version: number | null
          analyzed_at: string | null
          app: string | null
          category: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          device: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          message_count: number | null
          operator_id: string | null
          operator_name: string | null
          outcome: string | null
          problem_summary: string | null
          raw: Json
          resolved: boolean | null
          signal_quality: string | null
          solution_summary: string | null
          source: string
          started_at: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_version?: number | null
          analyzed_at?: string | null
          app?: string | null
          category?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          device?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          message_count?: number | null
          operator_id?: string | null
          operator_name?: string | null
          outcome?: string | null
          problem_summary?: string | null
          raw?: Json
          resolved?: boolean | null
          signal_quality?: string | null
          solution_summary?: string | null
          source: string
          started_at?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_version?: number | null
          analyzed_at?: string | null
          app?: string | null
          category?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          device?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          message_count?: number | null
          operator_id?: string | null
          operator_name?: string | null
          outcome?: string | null
          problem_summary?: string | null
          raw?: Json
          resolved?: boolean | null
          signal_quality?: string | null
          solution_summary?: string | null
          source?: string
          started_at?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_training_jobs: {
        Row: {
          created_at: string
          errors: number | null
          finished_at: string | null
          id: string
          kind: string
          message: string | null
          processed: number | null
          source: string | null
          started_at: string
          status: string
          total: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          errors?: number | null
          finished_at?: string | null
          id?: string
          kind: string
          message?: string | null
          processed?: number | null
          source?: string | null
          started_at?: string
          status?: string
          total?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          errors?: number | null
          finished_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          processed?: number | null
          source?: string | null
          started_at?: string
          status?: string
          total?: number | null
          user_id?: string
        }
        Relationships: []
      }
      audit_accounts: {
        Row: {
          created_at: string
          id: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_verification_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          purpose: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          purpose?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          purpose?: string
        }
        Relationships: []
      }
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
      backup_settings: {
        Row: {
          enabled: boolean
          id: string
          interval_hours: number
          interval_minutes: number
          last_run_at: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          interval_hours?: number
          interval_minutes?: number
          last_run_at?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          interval_hours?: number
          interval_minutes?: number
          last_run_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      billing_logs: {
        Row: {
          billing_type: Database["public"]["Enums"]["billing_type"]
          customer_id: string
          id: string
          message: string
          provider: string
          sent_at: string
          sent_date_br: string | null
          whatsapp_status: string | null
        }
        Insert: {
          billing_type: Database["public"]["Enums"]["billing_type"]
          customer_id: string
          id?: string
          message: string
          provider?: string
          sent_at?: string
          sent_date_br?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          customer_id?: string
          id?: string
          message?: string
          provider?: string
          sent_at?: string
          sent_date_br?: string | null
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
          template_d_minus_1: string | null
          template_d_plus_1: string | null
          template_d0: string | null
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
          template_d_minus_1?: string | null
          template_d_plus_1?: string | null
          template_d0?: string | null
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
          template_d_minus_1?: string | null
          template_d_plus_1?: string | null
          template_d0?: string | null
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
          email_from_name: string | null
          email_logo_url: string | null
          email_msg_d_minus_1: string | null
          email_msg_d_plus_1: string | null
          email_msg_d0: string | null
          email_reply_to: string | null
          email_subject: string | null
          evolution_instance: string | null
          evolution_msg_d_minus_1: string | null
          evolution_msg_d_plus_1: string | null
          evolution_msg_d0: string | null
          id: string
          meta_phone_number_id: string | null
          meta_template_name: string | null
          monthly_price: number | null
          notification_phone: string | null
          pix_key: string | null
          pix_key_type: string | null
          quarterly_price: number | null
          renewal_image_url: string | null
          renewal_message_template: string | null
          renewal_notification_target: string
          semiannual_price: number | null
          updated_at: string
          use_email_billing: boolean
          use_evolution_billing: boolean
          user_id: string
          vplay_integration_url: string | null
          vplay_key_message: string | null
        }
        Insert: {
          annual_price?: number | null
          created_at?: string
          custom_message?: string | null
          email_from_name?: string | null
          email_logo_url?: string | null
          email_msg_d_minus_1?: string | null
          email_msg_d_plus_1?: string | null
          email_msg_d0?: string | null
          email_reply_to?: string | null
          email_subject?: string | null
          evolution_instance?: string | null
          evolution_msg_d_minus_1?: string | null
          evolution_msg_d_plus_1?: string | null
          evolution_msg_d0?: string | null
          id?: string
          meta_phone_number_id?: string | null
          meta_template_name?: string | null
          monthly_price?: number | null
          notification_phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          quarterly_price?: number | null
          renewal_image_url?: string | null
          renewal_message_template?: string | null
          renewal_notification_target?: string
          semiannual_price?: number | null
          updated_at?: string
          use_email_billing?: boolean
          use_evolution_billing?: boolean
          user_id: string
          vplay_integration_url?: string | null
          vplay_key_message?: string | null
        }
        Update: {
          annual_price?: number | null
          created_at?: string
          custom_message?: string | null
          email_from_name?: string | null
          email_logo_url?: string | null
          email_msg_d_minus_1?: string | null
          email_msg_d_plus_1?: string | null
          email_msg_d0?: string | null
          email_reply_to?: string | null
          email_subject?: string | null
          evolution_instance?: string | null
          evolution_msg_d_minus_1?: string | null
          evolution_msg_d_plus_1?: string | null
          evolution_msg_d0?: string | null
          id?: string
          meta_phone_number_id?: string | null
          meta_template_name?: string | null
          monthly_price?: number | null
          notification_phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          quarterly_price?: number | null
          renewal_image_url?: string | null
          renewal_message_template?: string | null
          renewal_notification_target?: string
          semiannual_price?: number | null
          updated_at?: string
          use_email_billing?: boolean
          use_evolution_billing?: boolean
          user_id?: string
          vplay_integration_url?: string | null
          vplay_key_message?: string | null
        }
        Relationships: []
      }
      bot_flow_sessions: {
        Row: {
          created_at: string
          current_step_id: string | null
          expires_at: string
          flow_id: string
          id: string
          owner_id: string
          phone: string
          updated_at: string
          variables: Json
        }
        Insert: {
          created_at?: string
          current_step_id?: string | null
          expires_at?: string
          flow_id: string
          id?: string
          owner_id: string
          phone: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          current_step_id?: string | null
          expires_at?: string
          flow_id?: string
          id?: string
          owner_id?: string
          phone?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bot_flow_sessions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "bot_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_flows: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          name: string
          owner_id: string
          start_step_id: string | null
          steps: Json
          trigger_keywords: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          owner_id: string
          start_step_id?: string | null
          steps?: Json
          trigger_keywords?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          owner_id?: string
          start_step_id?: string | null
          steps?: Json
          trigger_keywords?: string[]
          updated_at?: string
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
      broadcast_campaigns: {
        Row: {
          audience_mode: string
          created_at: string
          delivered_count: number
          error_count: number
          exclude_active_phones: boolean
          filter_config: Json
          finished_at: string | null
          id: string
          name: string
          owner_id: string
          paused_at: string | null
          pending_customer_ids: Json
          phone_number_id: string | null
          read_count: number
          replied_count: number
          sent_count: number
          skipped_count: number
          started_at: string
          status: string
          template_language: string | null
          template_name: string
          total_targets: number
          updated_at: string
        }
        Insert: {
          audience_mode?: string
          created_at?: string
          delivered_count?: number
          error_count?: number
          exclude_active_phones?: boolean
          filter_config?: Json
          finished_at?: string | null
          id?: string
          name: string
          owner_id: string
          paused_at?: string | null
          pending_customer_ids?: Json
          phone_number_id?: string | null
          read_count?: number
          replied_count?: number
          sent_count?: number
          skipped_count?: number
          started_at?: string
          status?: string
          template_language?: string | null
          template_name: string
          total_targets?: number
          updated_at?: string
        }
        Update: {
          audience_mode?: string
          created_at?: string
          delivered_count?: number
          error_count?: number
          exclude_active_phones?: boolean
          filter_config?: Json
          finished_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          paused_at?: string | null
          pending_customer_ids?: Json
          phone_number_id?: string | null
          read_count?: number
          replied_count?: number
          sent_count?: number
          skipped_count?: number
          started_at?: string
          status?: string
          template_language?: string | null
          template_name?: string
          total_targets?: number
          updated_at?: string
        }
        Relationships: []
      }
      broadcast_logs: {
        Row: {
          campaign_id: string | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          id: string
          last_error: string | null
          last_sent_at: string | null
          last_status: string
          phone_normalized: string
          read_at: string | null
          replied_at: string | null
          template_name: string
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          last_status?: string
          phone_normalized: string
          read_at?: string | null
          replied_at?: string | null
          template_name: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          last_status?: string
          phone_normalized?: string
          read_at?: string | null
          replied_at?: string | null
          template_name?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "broadcast_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      cakto_contacts: {
        Row: {
          created_at: string
          email: string
          id: string
          last_seen_at: string
          name: string | null
          owner_id: string | null
          phone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          last_seen_at?: string
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_seen_at?: string
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      cakto_processed_events: {
        Row: {
          cakto_id: string
          created_at: string
          owner_id: string | null
        }
        Insert: {
          cakto_id: string
          created_at?: string
          owner_id?: string | null
        }
        Update: {
          cakto_id?: string
          created_at?: string
          owner_id?: string | null
        }
        Relationships: []
      }
      crm_oficial_billing_schedule: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          is_enabled: boolean
          last_run_at: string | null
          last_run_status: string | null
          max_delay_seconds: number
          message_d_minus_1: string
          message_d_plus_1: string
          message_d0: string
          min_delay_seconds: number
          phone_number_id: string | null
          send_d_minus_1: boolean
          send_d_plus_1: boolean
          send_d0: boolean
          send_time: string
          template_d_minus_1: string | null
          template_d_plus_1: string | null
          template_d0: string | null
          template_lang_d_minus_1: string | null
          template_lang_d_plus_1: string | null
          template_lang_d0: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          max_delay_seconds?: number
          message_d_minus_1?: string
          message_d_plus_1?: string
          message_d0?: string
          min_delay_seconds?: number
          phone_number_id?: string | null
          send_d_minus_1?: boolean
          send_d_plus_1?: boolean
          send_d0?: boolean
          send_time?: string
          template_d_minus_1?: string | null
          template_d_plus_1?: string | null
          template_d0?: string | null
          template_lang_d_minus_1?: string | null
          template_lang_d_plus_1?: string | null
          template_lang_d0?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          max_delay_seconds?: number
          message_d_minus_1?: string
          message_d_plus_1?: string
          message_d0?: string
          min_delay_seconds?: number
          phone_number_id?: string | null
          send_d_minus_1?: boolean
          send_d_plus_1?: boolean
          send_d0?: boolean
          send_time?: string
          template_d_minus_1?: string | null
          template_d_plus_1?: string | null
          template_d0?: string | null
          template_lang_d_minus_1?: string | null
          template_lang_d_plus_1?: string | null
          template_lang_d0?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_oficial_hidden_templates: {
        Row: {
          created_at: string
          id: string
          language: string | null
          reason: string | null
          template_id: string | null
          template_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          reason?: string | null
          template_id?: string | null
          template_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
          reason?: string | null
          template_id?: string | null
          template_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_oficial_settings: {
        Row: {
          api_key: string | null
          auto_renew_notify: boolean
          auto_signup: boolean
          auto_test_chat: boolean
          created_at: string
          enabled: boolean
          id: string
          last_test_at: string | null
          last_test_ok: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          auto_renew_notify?: boolean
          auto_signup?: boolean
          auto_test_chat?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          last_test_at?: string | null
          last_test_ok?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          auto_renew_notify?: boolean
          auto_signup?: boolean
          auto_test_chat?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          last_test_at?: string | null
          last_test_ok?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_backups: {
        Row: {
          backup_data: Json
          backup_type: string
          created_at: string
          id: string
          total_customers: number
        }
        Insert: {
          backup_data: Json
          backup_type?: string
          created_at?: string
          id?: string
          total_customers?: number
        }
        Update: {
          backup_data?: Json
          backup_type?: string
          created_at?: string
          id?: string
          total_customers?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          checkout_code: string
          created_at: string
          created_by: string | null
          custom_price: number | null
          due_date: string
          email: string | null
          extra_months: number
          extra_phone: string | null
          id: string
          name: string
          notes: string | null
          password: string | null
          phone: string
          plan_id: string | null
          screens: number
          server_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["customer_status"]
          username: string | null
        }
        Insert: {
          checkout_code?: string
          created_at?: string
          created_by?: string | null
          custom_price?: number | null
          due_date: string
          email?: string | null
          extra_months?: number
          extra_phone?: string | null
          id?: string
          name: string
          notes?: string | null
          password?: string | null
          phone: string
          plan_id?: string | null
          screens?: number
          server_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["customer_status"]
          username?: string | null
        }
        Update: {
          checkout_code?: string
          created_at?: string
          created_by?: string | null
          custom_price?: number | null
          due_date?: string
          email?: string | null
          extra_months?: number
          extra_phone?: string | null
          id?: string
          name?: string
          notes?: string | null
          password?: string | null
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
      device_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      discount_coupons: {
        Row: {
          applies_to: string
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          owner_id: string
          updated_at: string
          used_count: number
        }
        Insert: {
          applies_to?: string
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          owner_id: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          applies_to?: string
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          owner_id?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      efi_charges: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          environment: string
          expires_at: string | null
          id: string
          metadata: Json
          owner_id: string
          paid_at: string | null
          pending_id: string | null
          pending_kind: string | null
          pix_copia_cola: string | null
          provider: string
          provider_payment_id: string | null
          qrcode_base64: string | null
          status: string
          txid: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id?: string | null
          environment: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          owner_id: string
          paid_at?: string | null
          pending_id?: string | null
          pending_kind?: string | null
          pix_copia_cola?: string | null
          provider?: string
          provider_payment_id?: string | null
          qrcode_base64?: string | null
          status?: string
          txid: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          owner_id?: string
          paid_at?: string | null
          pending_id?: string | null
          pending_kind?: string | null
          pix_copia_cola?: string | null
          provider?: string
          provider_payment_id?: string | null
          qrcode_base64?: string | null
          status?: string
          txid?: string
          updated_at?: string
        }
        Relationships: []
      }
      efi_settings: {
        Row: {
          cert_p12_base64: string | null
          cert_password: string
          client_id: string | null
          client_secret: string | null
          created_at: string
          enabled: boolean
          environment: string
          id: string
          last_error: string | null
          last_verified_at: string | null
          pix_key: string | null
          updated_at: string
          user_id: string
          webhook_configured_at: string | null
        }
        Insert: {
          cert_p12_base64?: string | null
          cert_password?: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          enabled?: boolean
          environment?: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          pix_key?: string | null
          updated_at?: string
          user_id: string
          webhook_configured_at?: string | null
        }
        Update: {
          cert_p12_base64?: string | null
          cert_password?: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          enabled?: boolean
          environment?: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          pix_key?: string | null
          updated_at?: string
          user_id?: string
          webhook_configured_at?: string | null
        }
        Relationships: []
      }
      email_opens: {
        Row: {
          first_opened_at: string
          id: string
          last_opened_at: string
          message_id: string
          open_count: number
          owner_id: string | null
          recipient_email: string | null
          template_name: string | null
          user_agent: string | null
        }
        Insert: {
          first_opened_at?: string
          id?: string
          last_opened_at?: string
          message_id: string
          open_count?: number
          owner_id?: string | null
          recipient_email?: string | null
          template_name?: string | null
          user_agent?: string | null
        }
        Update: {
          first_opened_at?: string
          id?: string
          last_opened_at?: string
          message_id?: string
          open_count?: number
          owner_id?: string | null
          recipient_email?: string | null
          template_name?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      evolution_billing_rules: {
        Row: {
          button_enabled: boolean
          button_label: string | null
          button_url: string | null
          created_at: string
          days_offset: number
          id: string
          image_url: string | null
          is_enabled: boolean
          label: string
          message: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          button_enabled?: boolean
          button_label?: string | null
          button_url?: string | null
          created_at?: string
          days_offset?: number
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          label: string
          message?: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          button_enabled?: boolean
          button_label?: string | null
          button_url?: string | null
          created_at?: string
          days_offset?: number
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          label?: string
          message?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evolution_billing_schedule: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_enabled: boolean
          last_run_at: string | null
          last_run_status: string | null
          max_delay_seconds: number
          message_d_minus_1: string | null
          message_d_plus_1: string | null
          message_d0: string | null
          min_delay_seconds: number
          renew_button_enabled: boolean
          renew_button_label: string | null
          renew_button_url: string | null
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
          image_url?: string | null
          is_enabled?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          max_delay_seconds?: number
          message_d_minus_1?: string | null
          message_d_plus_1?: string | null
          message_d0?: string | null
          min_delay_seconds?: number
          renew_button_enabled?: boolean
          renew_button_label?: string | null
          renew_button_url?: string | null
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
          image_url?: string | null
          is_enabled?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          max_delay_seconds?: number
          message_d_minus_1?: string | null
          message_d_plus_1?: string | null
          message_d0?: string | null
          min_delay_seconds?: number
          renew_button_enabled?: boolean
          renew_button_label?: string | null
          renew_button_url?: string | null
          send_d_minus_1?: boolean
          send_d_plus_1?: boolean
          send_d0?: boolean
          send_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evolution_contacts: {
        Row: {
          ai_category: string | null
          created_at: string
          id: string
          last_classified_at: string | null
          name: string | null
          needs_human: boolean
          phone: string
          profile_pic_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_category?: string | null
          created_at?: string
          id?: string
          last_classified_at?: string | null
          name?: string | null
          needs_human?: boolean
          phone: string
          profile_pic_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_category?: string | null
          created_at?: string
          id?: string
          last_classified_at?: string | null
          name?: string | null
          needs_human?: boolean
          phone?: string
          profile_pic_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evolution_conversation_state: {
        Row: {
          created_at: string
          id: string
          last_read_at: string | null
          manual_unread: boolean
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_read_at?: string | null
          manual_unread?: boolean
          phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_read_at?: string | null
          manual_unread?: boolean
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evolution_messages: {
        Row: {
          contact_name: string | null
          content: string
          created_at: string
          direction: string
          external_id: string | null
          id: string
          instance_name: string | null
          media_mime: string | null
          media_url: string | null
          message_type: string
          phone: string
          profile_pic_url: string | null
          raw: Json | null
          remote_jid: string
          status: string
          user_id: string
        }
        Insert: {
          contact_name?: string | null
          content?: string
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          instance_name?: string | null
          media_mime?: string | null
          media_url?: string | null
          message_type?: string
          phone: string
          profile_pic_url?: string | null
          raw?: Json | null
          remote_jid: string
          status?: string
          user_id: string
        }
        Update: {
          contact_name?: string | null
          content?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          instance_name?: string | null
          media_mime?: string | null
          media_url?: string | null
          message_type?: string
          phone?: string
          profile_pic_url?: string | null
          raw?: Json | null
          remote_jid?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      evolution_presence: {
        Row: {
          id: string
          last_seen_at: string | null
          phone: string
          presence: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_seen_at?: string | null
          phone: string
          presence?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_seen_at?: string | null
          phone?: string
          presence?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evolution_settings: {
        Row: {
          api_key: string
          autoreply_absence_cooldown_hours: number
          autoreply_absence_enabled: boolean
          autoreply_absence_message: string
          autoreply_business_end: string
          autoreply_business_start: string
          autoreply_disabled_phones: string[]
          autoreply_enabled: boolean
          autoreply_model: string
          autoreply_only_outside_hours: boolean
          autoreply_system_prompt: string
          base_url: string
          created_at: string
          history_cutoff_at: string | null
          id: string
          instance_name: string
          is_enabled: boolean
          updated_at: string
          user_id: string
          webhook_token: string
        }
        Insert: {
          api_key?: string
          autoreply_absence_cooldown_hours?: number
          autoreply_absence_enabled?: boolean
          autoreply_absence_message?: string
          autoreply_business_end?: string
          autoreply_business_start?: string
          autoreply_disabled_phones?: string[]
          autoreply_enabled?: boolean
          autoreply_model?: string
          autoreply_only_outside_hours?: boolean
          autoreply_system_prompt?: string
          base_url?: string
          created_at?: string
          history_cutoff_at?: string | null
          id?: string
          instance_name?: string
          is_enabled?: boolean
          updated_at?: string
          user_id: string
          webhook_token?: string
        }
        Update: {
          api_key?: string
          autoreply_absence_cooldown_hours?: number
          autoreply_absence_enabled?: boolean
          autoreply_absence_message?: string
          autoreply_business_end?: string
          autoreply_business_start?: string
          autoreply_disabled_phones?: string[]
          autoreply_enabled?: boolean
          autoreply_model?: string
          autoreply_only_outside_hours?: boolean
          autoreply_system_prompt?: string
          base_url?: string
          created_at?: string
          history_cutoff_at?: string | null
          id?: string
          instance_name?: string
          is_enabled?: boolean
          updated_at?: string
          user_id?: string
          webhook_token?: string
        }
        Relationships: []
      }
      evolution_stickers: {
        Row: {
          created_at: string
          id: string
          mime_type: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string
          storage_path?: string
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
      koffice_panel_connections: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          api_key: string
          base_url: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      lead_history: {
        Row: {
          action: string
          created_at: string
          id: string
          lead_id: string
          metadata: Json | null
          result: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          lead_id: string
          metadata?: Json | null
          result?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_list_items: {
        Row: {
          created_at: string
          id: string
          last_sent_at: string | null
          lead_id: string
          list_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_sent_at?: string | null
          lead_id: string
          list_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_sent_at?: string | null
          lead_id?: string
          list_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_list_items_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_lists: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          created_at: string
          first_sent_at: string | null
          id: string
          last_result: string | null
          last_sent_at: string | null
          name: string | null
          notes: string | null
          phone: string
          score: string | null
          send_count: number
          site: string | null
          source_query: string | null
          status: string
          updated_at: string
          user_id: string
          whatsapp_available: boolean | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          first_sent_at?: string | null
          id?: string
          last_result?: string | null
          last_sent_at?: string | null
          name?: string | null
          notes?: string | null
          phone: string
          score?: string | null
          send_count?: number
          site?: string | null
          source_query?: string | null
          status?: string
          updated_at?: string
          user_id: string
          whatsapp_available?: boolean | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          first_sent_at?: string | null
          id?: string
          last_result?: string | null
          last_sent_at?: string | null
          name?: string | null
          notes?: string | null
          phone?: string
          score?: string | null
          send_count?: number
          site?: string | null
          source_query?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp_available?: boolean | null
        }
        Relationships: []
      }
      mercadopago_settings: {
        Row: {
          access_token: string | null
          created_at: string
          enabled: boolean
          environment: string
          id: string
          payer_email: string | null
          public_key: string | null
          updated_at: string
          user_id: string
          webhook_configured_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          enabled?: boolean
          environment?: string
          id?: string
          payer_email?: string | null
          public_key?: string | null
          updated_at?: string
          user_id: string
          webhook_configured_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          enabled?: boolean
          environment?: string
          id?: string
          payer_email?: string | null
          public_key?: string | null
          updated_at?: string
          user_id?: string
          webhook_configured_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: []
      }
      message_logs: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          error_message: string | null
          id: string
          message_type: string
          metadata: Json | null
          source: string
          status: string
          user_id: string | null
          whatsapp_response: Json | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          message_type?: string
          metadata?: Json | null
          source?: string
          status?: string
          user_id?: string | null
          whatsapp_response?: Json | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          message_type?: string
          metadata?: Json | null
          source?: string
          status?: string
          user_id?: string | null
          whatsapp_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_template_cache: {
        Row: {
          definition: Json
          id: string
          language: string
          name: string
          updated_at: string
        }
        Insert: {
          definition: Json
          id?: string
          language: string
          name: string
          updated_at?: string
        }
        Update: {
          definition?: Json
          id?: string
          language?: string
          name?: string
          updated_at?: string
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
      panel_stats_cache: {
        Row: {
          credits: number | null
          error: string | null
          id: string
          online: number | null
          panel: string | null
          server_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          credits?: number | null
          error?: string | null
          id?: string
          online?: number | null
          panel?: string | null
          server_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          credits?: number | null
          error?: string | null
          id?: string
          online?: number | null
          panel?: string | null
          server_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "panel_stats_cache_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
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
      pending_activation_data: {
        Row: {
          app_name: string
          created_at: string
          customer_name: string
          email: string | null
          expires_at: string
          id: string
          mac_address: string | null
          phone_normalized: string
          used: boolean
        }
        Insert: {
          app_name: string
          created_at?: string
          customer_name: string
          email?: string | null
          expires_at?: string
          id?: string
          mac_address?: string | null
          phone_normalized: string
          used?: boolean
        }
        Update: {
          app_name?: string
          created_at?: string
          customer_name?: string
          email?: string | null
          expires_at?: string
          id?: string
          mac_address?: string | null
          phone_normalized?: string
          used?: boolean
        }
        Relationships: []
      }
      pending_manual_renewals: {
        Row: {
          amount: number | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          error_details: Json | null
          id: string
          locked_at: string | null
          new_due_date: string | null
          owner_id: string
          plan_name: string | null
          reason: string
          server_host: string | null
          server_id: string | null
          server_name: string | null
          source: string | null
          username: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          error_details?: Json | null
          id?: string
          locked_at?: string | null
          new_due_date?: string | null
          owner_id: string
          plan_name?: string | null
          reason?: string
          server_host?: string | null
          server_id?: string | null
          server_name?: string | null
          source?: string | null
          username?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          error_details?: Json | null
          id?: string
          locked_at?: string | null
          new_due_date?: string | null
          owner_id?: string
          plan_name?: string | null
          reason?: string
          server_host?: string | null
          server_id?: string | null
          server_name?: string | null
          source?: string | null
          username?: string | null
        }
        Relationships: []
      }
      pending_new_customers: {
        Row: {
          checkout_url: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          name: string
          owner_id: string
          phone: string
          plan_id: string | null
          server_id: string | null
          used: boolean | null
          username: string
        }
        Insert: {
          checkout_url?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          name: string
          owner_id: string
          phone: string
          plan_id?: string | null
          server_id?: string | null
          used?: boolean | null
          username: string
        }
        Update: {
          checkout_url?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          phone?: string
          plan_id?: string | null
          server_id?: string | null
          used?: boolean | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_new_customers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_new_customers_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_renewal_selections: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          phone_normalized: string
          used: boolean
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at?: string
          id?: string
          phone_normalized: string
          used?: boolean
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          phone_normalized?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pending_renewal_selections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          card_checkout_url: string | null
          checkout_url: string | null
          created_at: string
          created_by: string | null
          duration_days: number
          id: string
          plan_name: string
          price: number
        }
        Insert: {
          card_checkout_url?: string | null
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          duration_days: number
          id?: string
          plan_name: string
          price: number
        }
        Update: {
          card_checkout_url?: string | null
          checkout_url?: string | null
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
      platform_settings: {
        Row: {
          ai_api_key: string | null
          ai_automation_enabled: boolean | null
          ai_provider: string | null
          created_at: string
          devtools_protection_enabled: boolean
          id: string
          recaptcha_enabled: boolean
          recaptcha_min_score: number
          recaptcha_secret_key: string | null
          recaptcha_site_key: string | null
          require_email_confirmation: boolean
          trial_days: number
          two_factor_enabled: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_api_key?: string | null
          ai_automation_enabled?: boolean | null
          ai_provider?: string | null
          created_at?: string
          devtools_protection_enabled?: boolean
          id?: string
          recaptcha_enabled?: boolean
          recaptcha_min_score?: number
          recaptcha_secret_key?: string | null
          recaptcha_site_key?: string | null
          require_email_confirmation?: boolean
          trial_days?: number
          two_factor_enabled?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_api_key?: string | null
          ai_automation_enabled?: boolean | null
          ai_provider?: string | null
          created_at?: string
          devtools_protection_enabled?: boolean
          id?: string
          recaptcha_enabled?: boolean
          recaptcha_min_score?: number
          recaptcha_secret_key?: string | null
          recaptcha_site_key?: string | null
          require_email_confirmation?: boolean
          trial_days?: number
          two_factor_enabled?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      playlist_templates: {
        Row: {
          created_at: string
          default_host: string | null
          epg_url_template: string | null
          id: string
          is_default: boolean
          m3u_url_template: string
          name: string
          pin: string | null
          playlist_name: string
          send_tv: boolean
          send_vod: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_host?: string | null
          epg_url_template?: string | null
          id?: string
          is_default?: boolean
          m3u_url_template: string
          name: string
          pin?: string | null
          playlist_name?: string
          send_tv?: boolean
          send_vod?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_host?: string | null
          epg_url_template?: string | null
          id?: string
          is_default?: boolean
          m3u_url_template?: string
          name?: string
          pin?: string | null
          playlist_name?: string
          send_tv?: boolean
          send_vod?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          max_evolution_instances: number
          max_official_channels: number
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
          max_evolution_instances?: number
          max_official_channels?: number
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
          max_evolution_instances?: number
          max_official_channels?: number
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
      reseller_access_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          days: number
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          days?: number
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          days?: number
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
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
          natv2_api_key: string | null
          natv2_base_url: string | null
          p2cine_api_key: string | null
          p2cine_base_url: string | null
          p2cine_password: string | null
          p2cine_session_at: string | null
          p2cine_session_cookie: string | null
          p2cine_username: string | null
          rush_base_url: string | null
          rush_password: string | null
          rush_token: string | null
          rush_username: string | null
          sigma_base_url: string | null
          sigma_password: string | null
          sigma_proxy_secret: string | null
          sigma_proxy_url: string | null
          sigma_username: string | null
          the_best_api_key: string | null
          the_best_base_url: string | null
          the_best_password: string | null
          the_best_username: string | null
          uniplay_base_url: string | null
          uniplay_password: string | null
          uniplay_session_at: string | null
          uniplay_session_pass: string | null
          uniplay_session_token: string | null
          uniplay_username: string | null
          updated_at: string
          user_id: string
          vplay_mysql_database: string | null
          vplay_mysql_host: string | null
          vplay_mysql_password: string | null
          vplay_mysql_port: number | null
          vplay_mysql_user: string | null
          vplay_panel_password: string | null
          vplay_panel_username: string | null
        }
        Insert: {
          cakto_client_id?: string | null
          cakto_client_secret?: string | null
          cakto_webhook_secret?: string | null
          created_at?: string
          id?: string
          natv_api_key?: string | null
          natv_base_url?: string | null
          natv2_api_key?: string | null
          natv2_base_url?: string | null
          p2cine_api_key?: string | null
          p2cine_base_url?: string | null
          p2cine_password?: string | null
          p2cine_session_at?: string | null
          p2cine_session_cookie?: string | null
          p2cine_username?: string | null
          rush_base_url?: string | null
          rush_password?: string | null
          rush_token?: string | null
          rush_username?: string | null
          sigma_base_url?: string | null
          sigma_password?: string | null
          sigma_proxy_secret?: string | null
          sigma_proxy_url?: string | null
          sigma_username?: string | null
          the_best_api_key?: string | null
          the_best_base_url?: string | null
          the_best_password?: string | null
          the_best_username?: string | null
          uniplay_base_url?: string | null
          uniplay_password?: string | null
          uniplay_session_at?: string | null
          uniplay_session_pass?: string | null
          uniplay_session_token?: string | null
          uniplay_username?: string | null
          updated_at?: string
          user_id: string
          vplay_mysql_database?: string | null
          vplay_mysql_host?: string | null
          vplay_mysql_password?: string | null
          vplay_mysql_port?: number | null
          vplay_mysql_user?: string | null
          vplay_panel_password?: string | null
          vplay_panel_username?: string | null
        }
        Update: {
          cakto_client_id?: string | null
          cakto_client_secret?: string | null
          cakto_webhook_secret?: string | null
          created_at?: string
          id?: string
          natv_api_key?: string | null
          natv_base_url?: string | null
          natv2_api_key?: string | null
          natv2_base_url?: string | null
          p2cine_api_key?: string | null
          p2cine_base_url?: string | null
          p2cine_password?: string | null
          p2cine_session_at?: string | null
          p2cine_session_cookie?: string | null
          p2cine_username?: string | null
          rush_base_url?: string | null
          rush_password?: string | null
          rush_token?: string | null
          rush_username?: string | null
          sigma_base_url?: string | null
          sigma_password?: string | null
          sigma_proxy_secret?: string | null
          sigma_proxy_url?: string | null
          sigma_username?: string | null
          the_best_api_key?: string | null
          the_best_base_url?: string | null
          the_best_password?: string | null
          the_best_username?: string | null
          uniplay_base_url?: string | null
          uniplay_password?: string | null
          uniplay_session_at?: string | null
          uniplay_session_pass?: string | null
          uniplay_session_token?: string | null
          uniplay_username?: string | null
          updated_at?: string
          user_id?: string
          vplay_mysql_database?: string | null
          vplay_mysql_host?: string | null
          vplay_mysql_password?: string | null
          vplay_mysql_port?: number | null
          vplay_mysql_user?: string | null
          vplay_panel_password?: string | null
          vplay_panel_username?: string | null
        }
        Relationships: []
      }
      reseller_checkout_settings: {
        Row: {
          activation_cakto_url: string | null
          api_key: string
          brand_color: string
          created_at: string
          display_name: string | null
          enable_cakto: boolean
          enable_efi: boolean
          enable_mercadopago: boolean
          headline: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          slug: string
          subheadline: string | null
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          activation_cakto_url?: string | null
          api_key: string
          brand_color?: string
          created_at?: string
          display_name?: string | null
          enable_cakto?: boolean
          enable_efi?: boolean
          enable_mercadopago?: boolean
          headline?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          slug: string
          subheadline?: string | null
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          activation_cakto_url?: string | null
          api_key?: string
          brand_color?: string
          created_at?: string
          display_name?: string | null
          enable_cakto?: boolean
          enable_efi?: boolean
          enable_mercadopago?: boolean
          headline?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          slug?: string
          subheadline?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      servers: {
        Row: {
          auto_renew: boolean
          created_at: string
          created_by: string | null
          credit_cost: number
          description: string | null
          host: string
          id: string
          is_public: boolean | null
          koffice_connection_id: string | null
          panel_type: string | null
          server_name: string
          sigma_connection_id: string | null
          status: Database["public"]["Enums"]["server_status"]
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          created_by?: string | null
          credit_cost?: number
          description?: string | null
          host: string
          id?: string
          is_public?: boolean | null
          koffice_connection_id?: string | null
          panel_type?: string | null
          server_name: string
          sigma_connection_id?: string | null
          status?: Database["public"]["Enums"]["server_status"]
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          created_by?: string | null
          credit_cost?: number
          description?: string | null
          host?: string
          id?: string
          is_public?: boolean | null
          koffice_connection_id?: string | null
          panel_type?: string | null
          server_name?: string
          sigma_connection_id?: string | null
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
          {
            foreignKeyName: "servers_koffice_connection_id_fkey"
            columns: ["koffice_connection_id"]
            isOneToOne: false
            referencedRelation: "koffice_panel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servers_sigma_connection_id_fkey"
            columns: ["sigma_connection_id"]
            isOneToOne: false
            referencedRelation: "sigma_panel_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      sigma_bridge_jobs: {
        Row: {
          action: string
          created_at: string | null
          error_message: string | null
          expires_at: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          response_payload: Json | null
          sigma_connection_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          response_payload?: Json | null
          sigma_connection_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          response_payload?: Json | null
          sigma_connection_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sigma_bridge_jobs_sigma_connection_id_fkey"
            columns: ["sigma_connection_id"]
            isOneToOne: false
            referencedRelation: "sigma_panel_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      sigma_panel_connections: {
        Row: {
          base_url: string
          bridge_token: string | null
          created_at: string
          id: string
          is_active: boolean
          last_bridge_seen_at: string | null
          name: string
          password: string
          proxy_secret: string | null
          proxy_url: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          base_url: string
          bridge_token?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_bridge_seen_at?: string | null
          name: string
          password: string
          proxy_secret?: string | null
          proxy_url?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          base_url?: string
          bridge_token?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_bridge_seen_at?: string | null
          name?: string
          password?: string
          proxy_secret?: string | null
          proxy_url?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tutorials: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          is_published: boolean
          sort_order: number
          steps: Json
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_published?: boolean
          sort_order?: number
          steps?: Json
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_published?: boolean
          sort_order?: number
          steps?: Json
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      user_evolution_instances: {
        Row: {
          advanced_settings: Json
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string
          owner_phone: string | null
          profile_name: string | null
          profile_pic_url: string | null
          profile_updated_at: string | null
          settings_updated_at: string | null
          user_id: string
          webhook_enabled: boolean
          webhook_events: string[]
        }
        Insert: {
          advanced_settings?: Json
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name: string
          owner_phone?: string | null
          profile_name?: string | null
          profile_pic_url?: string | null
          profile_updated_at?: string | null
          settings_updated_at?: string | null
          user_id: string
          webhook_enabled?: boolean
          webhook_events?: string[]
        }
        Update: {
          advanced_settings?: Json
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          owner_phone?: string | null
          profile_name?: string | null
          profile_pic_url?: string | null
          profile_updated_at?: string | null
          settings_updated_at?: string | null
          user_id?: string
          webhook_enabled?: boolean
          webhook_events?: string[]
        }
        Relationships: []
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
          api_key: string | null
          created_at: string
          id: string
          integration_url: string | null
          is_default: boolean
          key_message: string | null
          server_name: string
          server_type: string
          test_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id?: string
          integration_url?: string | null
          is_default?: boolean
          key_message?: string | null
          server_name: string
          server_type?: string
          test_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          integration_url?: string | null
          is_default?: boolean
          key_message?: string | null
          server_name?: string
          server_type?: string
          test_minutes?: number
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
      whatsapp_extract_tokens: {
        Row: {
          created_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_group_contacts: {
        Row: {
          created_at: string
          group_jid: string | null
          group_name: string | null
          id: string
          is_admin_member: boolean
          name: string | null
          phone: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_jid?: string | null
          group_name?: string | null
          id?: string
          is_admin_member?: boolean
          name?: string | null
          phone: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_jid?: string | null
          group_name?: string | null
          id?: string
          is_admin_member?: boolean
          name?: string | null
          phone?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_utility_attempts: {
        Row: {
          attempt_no: number
          body: string
          category: string | null
          evaluated_at: string | null
          id: string
          outcome: string | null
          previous_category: string | null
          rejection_reason: string | null
          session_id: string
          status: string | null
          strictness_level: number
          submitted_at: string
          template_id: string | null
          template_name: string
        }
        Insert: {
          attempt_no: number
          body: string
          category?: string | null
          evaluated_at?: string | null
          id?: string
          outcome?: string | null
          previous_category?: string | null
          rejection_reason?: string | null
          session_id: string
          status?: string | null
          strictness_level: number
          submitted_at?: string
          template_id?: string | null
          template_name: string
        }
        Update: {
          attempt_no?: number
          body?: string
          category?: string | null
          evaluated_at?: string | null
          id?: string
          outcome?: string | null
          previous_category?: string | null
          rejection_reason?: string | null
          session_id?: string
          status?: string | null
          strictness_level?: number
          submitted_at?: string
          template_id?: string | null
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_utility_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_utility_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_utility_sessions: {
        Row: {
          base_name: string
          business_purpose: string
          completed_at: string | null
          context: Json
          created_at: string
          final_outcome: string | null
          id: string
          language: string | null
          started_at: string
          trigger_event: string
          user_id: string
          utility_risk: string
        }
        Insert: {
          base_name: string
          business_purpose: string
          completed_at?: string | null
          context: Json
          created_at?: string
          final_outcome?: string | null
          id?: string
          language?: string | null
          started_at?: string
          trigger_event: string
          user_id: string
          utility_risk: string
        }
        Update: {
          base_name?: string
          business_purpose?: string
          completed_at?: string | null
          context?: Json
          created_at?: string
          final_outcome?: string | null
          id?: string
          language?: string | null
          started_at?: string
          trigger_event?: string
          user_id?: string
          utility_risk?: string
        }
        Relationships: []
      }
      whatsapp_utility_summary: {
        Row: {
          anti_patterns: Json
          clusters: Json
          id: string
          session_count: number
          summarized_at: string
          user_id: string
        }
        Insert: {
          anti_patterns: Json
          clusters: Json
          id?: string
          session_count: number
          summarized_at?: string
          user_id: string
        }
        Update: {
          anti_patterns?: Json
          clusters?: Json
          id?: string
          session_count?: number
          summarized_at?: string
          user_id?: string
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
      batch_update_customers_natv: { Args: never; Returns: undefined }
      bulk_update_customers: {
        Args: {
          due_dates: string[]
          plan_ids: string[]
          screen_counts: number[]
          server_ids: string[]
          statuses: string[]
          usernames: string[]
        }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_dashboard_stats_optimized: { Args: never; Returns: Json }
      get_email_tracking: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          error_message: string
          first_opened_at: string
          message_id: string
          open_count: number
          opened: boolean
          recipient_email: string
          sent_at: string
          status: string
          template_name: string
        }[]
      }
      get_monthly_revenue: { Args: never; Returns: Json }
      get_plan_distribution: { Args: never; Returns: Json }
      get_reseller_customer_counts: {
        Args: never
        Returns: {
          active_customers: number
          owner_id: string
          total_customers: number
        }[]
      }
      get_server_distribution: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_inactive_auditor: { Args: never; Returns: boolean }
      match_ai_knowledge_candidates: {
        Args: {
          _user_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          canonical_question: string
          id: string
          similarity: number
        }[]
      }
      match_ai_knowledge_entries: {
        Args: {
          _user_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          id: string
          media_filename: string
          media_mime: string
          media_type: string
          media_url: string
          requires_human: boolean
          response_template: string
          similarity: number
          title: string
        }[]
      }
      match_ai_knowledge_items: {
        Args: {
          _category: string
          _kind: Database["public"]["Enums"]["ai_knowledge_kind"]
          _user_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
          subject: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_customer_username: {
        Args: { _username: string }
        Returns: string
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      ai_knowledge_item_status: "pending" | "approved" | "rejected" | "merged"
      ai_knowledge_kind:
        | "procedure"
        | "flow"
        | "intent"
        | "official_answer"
        | "business_rule"
        | "tutorial"
      app_role: "admin" | "user"
      billing_type: "D-1" | "D0" | "D+1"
      customer_status: "ativa" | "inativa" | "suspensa" | "bloqueado"
      payment_method: "pix" | "dinheiro" | "transferencia" | "cartao_credito"
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
      ai_knowledge_item_status: ["pending", "approved", "rejected", "merged"],
      ai_knowledge_kind: [
        "procedure",
        "flow",
        "intent",
        "official_answer",
        "business_rule",
        "tutorial",
      ],
      app_role: ["admin", "user"],
      billing_type: ["D-1", "D0", "D+1"],
      customer_status: ["ativa", "inativa", "suspensa", "bloqueado"],
      payment_method: ["pix", "dinheiro", "transferencia", "cartao_credito"],
      server_status: ["online", "offline", "manutencao"],
    },
  },
} as const
