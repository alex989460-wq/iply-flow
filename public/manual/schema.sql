-- ============================================================
-- SUPER GESTOR — ESQUEMA COMPLETO DO BANCO DE DADOS
-- Gerado automaticamente do projeto Supabase conectado
-- Execute este SQL no SQL Editor da Supabase
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- ============================================================
-- TIPOS ENUM
-- ============================================================
CREATE TYPE public.ai_knowledge_item_status AS ENUM ('pending','approved','rejected','merged');
CREATE TYPE public.ai_knowledge_kind AS ENUM ('procedure','flow','intent','official_answer','business_rule','tutorial');
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TYPE public.billing_type AS ENUM ('D-1','D0','D+1');
CREATE TYPE public.customer_status AS ENUM ('ativa','inativa','suspensa','bloqueado');
CREATE TYPE public.payment_method AS ENUM ('pix','dinheiro','transferencia','cartao_credito');
CREATE TYPE public.server_status AS ENUM ('online','offline','manutencao');


-- ============================================================
-- TABELAS
-- ============================================================
CREATE TABLE public.activation_apps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_name text NOT NULL,
  description text,
  icon text DEFAULT 'Smartphone'::text,
  requires_email boolean DEFAULT false,
  requires_mac boolean DEFAULT true,
  is_enabled boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  logo_url text,
  price_monthly numeric,
  price_quarterly numeric,
  price_annual numeric DEFAULT 25.00
);
CREATE TABLE public.activation_panel_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  panel_type text NOT NULL,
  username text NOT NULL DEFAULT ''::text,
  password text NOT NULL DEFAULT ''::text,
  is_enabled boolean NOT NULL DEFAULT true,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.activation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  app_name text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  mac_address text,
  email text,
  payment_method text,
  amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text,
  cakto_payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_knowledge_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  canonical_question text NOT NULL,
  similar_questions text[] DEFAULT '{}'::text[],
  best_answer text NOT NULL,
  category text DEFAULT 'outros'::text,
  tags text[] DEFAULT '{}'::text[],
  keywords text[] DEFAULT '{}'::text[],
  confidence numeric DEFAULT 0.5,
  usage_count integer DEFAULT 1,
  success_count integer DEFAULT 0,
  success_rate numeric DEFAULT 0,
  last_used_at timestamp with time zone,
  status text NOT NULL DEFAULT 'pending'::text,
  source_conversation_ids uuid[] DEFAULT '{}'::uuid[],
  embedding vector,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_knowledge_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'outros'::text,
  keywords text[] NOT NULL DEFAULT '{}'::text[],
  response_template text NOT NULL,
  requires_human boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  media_url text,
  media_mime text,
  media_type text,
  media_filename text,
  embedding vector,
  canonical_question text,
  success_rate numeric DEFAULT 0,
  usage_count integer DEFAULT 0
);
CREATE TABLE public.ai_knowledge_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind ai_knowledge_kind NOT NULL,
  subject text NOT NULL,
  problem text,
  solution text,
  steps jsonb DEFAULT '[]'::jsonb,
  flow_nodes jsonb DEFAULT '[]'::jsonb,
  category text NOT NULL DEFAULT 'outros'::text,
  devices text[] NOT NULL DEFAULT '{}'::text[],
  apps text[] NOT NULL DEFAULT '{}'::text[],
  tags text[] NOT NULL DEFAULT '{}'::text[],
  keywords text[] NOT NULL DEFAULT '{}'::text[],
  usage_count integer NOT NULL DEFAULT 1,
  resolved_count integer NOT NULL DEFAULT 0,
  success_rate numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0.4,
  last_used_at timestamp with time zone,
  operators jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_conversation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status ai_knowledge_item_status NOT NULL DEFAULT 'pending'::ai_knowledge_item_status,
  merged_into_id uuid,
  embedding vector,
  approved_at timestamp with time zone,
  approved_by uuid,
  knowledge_entry_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_training_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  contact_phone text,
  contact_name text,
  operator_id uuid,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  duration_seconds integer,
  message_count integer DEFAULT 0,
  status text DEFAULT 'imported'::text,
  tags text[] DEFAULT '{}'::text[],
  outcome text,
  raw jsonb NOT NULL DEFAULT '[]'::jsonb,
  analyzed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  problem_summary text,
  solution_summary text,
  resolved boolean,
  device text,
  app text,
  category text,
  signal_quality text,
  operator_name text,
  analysis_version integer DEFAULT 2
);
CREATE TABLE public.ai_training_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  source text,
  status text NOT NULL DEFAULT 'running'::text,
  total integer DEFAULT 0,
  processed integer DEFAULT 0,
  errors integer DEFAULT 0,
  message text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.auto_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trigger_keyword text NOT NULL,
  reply_message text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains'::text,
  is_enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.billing_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  billing_type billing_type NOT NULL,
  message text NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  whatsapp_status text,
  sent_date_br date
);
CREATE TABLE public.billing_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  send_time time without time zone NOT NULL DEFAULT '09:00:00'::time without time zone,
  send_d_minus_1 boolean NOT NULL DEFAULT true,
  send_d0 boolean NOT NULL DEFAULT true,
  send_d_plus_1 boolean NOT NULL DEFAULT true,
  last_run_at timestamp with time zone,
  last_run_status text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  template_d_minus_1 text DEFAULT 'vence_amanha'::text,
  template_d0 text DEFAULT 'hoje01'::text,
  template_d_plus_1 text DEFAULT 'vencido'::text
);
CREATE TABLE public.billing_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pix_key text DEFAULT ''::text,
  pix_key_type text DEFAULT 'celular'::text,
  monthly_price numeric DEFAULT 35.00,
  quarterly_price numeric DEFAULT 90.00,
  semiannual_price numeric DEFAULT 175.00,
  annual_price numeric DEFAULT 300.00,
  custom_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  vplay_integration_url text,
  vplay_key_message text DEFAULT 'XCLOUD'::text,
  meta_template_name text DEFAULT 'pedido_aprovado'::text,
  notification_phone text DEFAULT ''::text,
  renewal_message_template text DEFAULT '✅ Olá, *{{nome}}*. Obrigado por confirmar seu pagamento. Segue abaixo os dados da sua assinatura:

==========================
📅 Próx. Vencimento: *{{vencimento}} - {{hora}} hrs*
💰 Valor: *{{valor}}*
👤 Usuário: *{{usuario}}*
📦 Plano: *{{plano}}*
🔌 Status: *Ativo*
💎 Obs: -
⚡: *{{servidor}}*
=========================='::text,
  renewal_image_url text DEFAULT ''::text,
  use_evolution_billing boolean NOT NULL DEFAULT false,
  evolution_instance text,
  evolution_msg_d_minus_1 text,
  evolution_msg_d0 text,
  evolution_msg_d_plus_1 text,
  renewal_notification_target text NOT NULL DEFAULT 'both'::text,
  meta_phone_number_id text
);
CREATE TABLE public.bot_flow_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  phone text NOT NULL,
  flow_id uuid NOT NULL,
  current_step_id text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '24:00:00'::interval),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.bot_flows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  trigger_keywords text[] NOT NULL DEFAULT '{}'::text[],
  start_step_id text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.bot_triggers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trigger_type text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  days_offset integer DEFAULT 0,
  bot_department_id text,
  bot_department_name text,
  message_template text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.broadcast_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  phone_normalized text NOT NULL,
  template_name text NOT NULL,
  last_status text NOT NULL DEFAULT 'sent'::text,
  last_error text,
  last_sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.cakto_processed_events (
  cakto_id text NOT NULL,
  owner_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.crm_oficial_billing_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  send_time time without time zone NOT NULL DEFAULT '09:00:00'::time without time zone,
  send_d_minus_1 boolean NOT NULL DEFAULT true,
  send_d0 boolean NOT NULL DEFAULT true,
  send_d_plus_1 boolean NOT NULL DEFAULT true,
  message_d_minus_1 text NOT NULL DEFAULT 'Olá {{nome}}, sua mensalidade vence amanhã ({{vencimento}}). Valor: {{valor}}.'::text,
  message_d0 text NOT NULL DEFAULT 'Olá {{nome}}, sua mensalidade vence hoje ({{vencimento}}). Valor: {{valor}}.'::text,
  message_d_plus_1 text NOT NULL DEFAULT 'Olá {{nome}}, sua mensalidade venceu ontem ({{vencimento}}). Regularize hoje para evitar bloqueio.'::text,
  min_delay_seconds integer NOT NULL DEFAULT 15,
  max_delay_seconds integer NOT NULL DEFAULT 30,
  last_run_at timestamp with time zone,
  last_run_status text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  template_d_minus_1 text,
  template_d0 text,
  template_d_plus_1 text,
  template_lang_d_minus_1 text,
  template_lang_d0 text,
  template_lang_d_plus_1 text,
  channel_id text,
  phone_number_id text
);
CREATE TABLE public.crm_oficial_hidden_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id text,
  template_name text NOT NULL,
  language text,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.crm_oficial_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  api_key text,
  enabled boolean NOT NULL DEFAULT false,
  auto_signup boolean NOT NULL DEFAULT true,
  auto_test_chat boolean NOT NULL DEFAULT true,
  auto_renew_notify boolean NOT NULL DEFAULT true,
  last_test_at timestamp with time zone,
  last_test_ok boolean,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.customer_backups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  backup_data jsonb NOT NULL,
  total_customers integer NOT NULL DEFAULT 0,
  backup_type text NOT NULL DEFAULT 'auto'::text
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  server_id uuid,
  plan_id uuid,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  status customer_status NOT NULL DEFAULT 'ativa'::customer_status,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  custom_price numeric,
  username text,
  screens integer NOT NULL DEFAULT 1,
  extra_months integer NOT NULL DEFAULT 0,
  password text,
  extra_phone text,
  checkout_code text NOT NULL DEFAULT upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 10))
);
CREATE TABLE public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.device_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL,
  device_name text,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.efi_charges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  customer_id uuid,
  pending_id uuid,
  pending_kind text,
  txid text NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  environment text NOT NULL,
  pix_copia_cola text,
  qrcode_base64 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.efi_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox'::text,
  client_id text,
  client_secret text,
  pix_key text,
  cert_p12_base64 text,
  cert_password text NOT NULL DEFAULT ''::text,
  webhook_configured_at timestamp with time zone,
  last_verified_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.evolution_billing_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  send_time time without time zone NOT NULL DEFAULT '09:00:00'::time without time zone,
  send_d_minus_1 boolean NOT NULL DEFAULT true,
  send_d0 boolean NOT NULL DEFAULT true,
  send_d_plus_1 boolean NOT NULL DEFAULT true,
  message_d_minus_1 text DEFAULT 'Olá {{nome}}, sua assinatura vence amanhã ({{vencimento}}). Renove para continuar usando! 📺'::text,
  message_d0 text DEFAULT 'Olá {{nome}}, sua assinatura vence HOJE ({{vencimento}}). Renove agora! ⚠️'::text,
  message_d_plus_1 text DEFAULT 'Olá {{nome}}, sua assinatura venceu ontem ({{vencimento}}). Regularize hoje! 🚨'::text,
  min_delay_seconds integer NOT NULL DEFAULT 15,
  max_delay_seconds integer NOT NULL DEFAULT 30,
  last_run_at timestamp with time zone,
  last_run_status text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  image_url text,
  renew_button_enabled boolean NOT NULL DEFAULT false,
  renew_button_label text DEFAULT 'Renovar agora'::text,
  renew_button_url text
);
CREATE TABLE public.evolution_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  name text,
  profile_pic_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ai_category text,
  needs_human boolean NOT NULL DEFAULT false,
  last_classified_at timestamp with time zone
);
CREATE TABLE public.evolution_conversation_state (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  last_read_at timestamp with time zone,
  manual_unread boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.evolution_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  remote_jid text NOT NULL,
  phone text NOT NULL,
  contact_name text,
  direction text NOT NULL,
  content text NOT NULL DEFAULT ''::text,
  message_type text NOT NULL DEFAULT 'text'::text,
  external_id text,
  status text NOT NULL DEFAULT 'sent'::text,
  raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  media_url text,
  media_mime text,
  profile_pic_url text,
  instance_name text
);
CREATE TABLE public.evolution_presence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  presence text NOT NULL DEFAULT 'available'::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone
);
CREATE TABLE public.evolution_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  base_url text NOT NULL DEFAULT ''::text,
  api_key text NOT NULL DEFAULT ''::text,
  instance_name text NOT NULL DEFAULT ''::text,
  webhook_token text NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  autoreply_enabled boolean NOT NULL DEFAULT false,
  autoreply_system_prompt text NOT NULL DEFAULT 'Você é um atendente de suporte cordial e objetivo de uma loja de IPTV. Responda em português, de forma curta (máx. 2 parágrafos), educada e profissional. Se a pessoa pedir algo que você não saiba (preços específicos, status de pagamento, ativação, problema técnico complexo) avise que vai chamar um humano. Nunca invente dados de cliente.'::text,
  autoreply_only_outside_hours boolean NOT NULL DEFAULT false,
  autoreply_business_start text NOT NULL DEFAULT '08:00'::text,
  autoreply_business_end text NOT NULL DEFAULT '18:00'::text,
  autoreply_disabled_phones text[] NOT NULL DEFAULT '{}'::text[],
  autoreply_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview'::text,
  history_cutoff_at timestamp with time zone,
  autoreply_absence_enabled boolean NOT NULL DEFAULT false,
  autoreply_absence_message text NOT NULL DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Assim que possível responderemos sua mensagem. 🙏'::text,
  autoreply_absence_cooldown_hours integer NOT NULL DEFAULT 6
);
CREATE TABLE public.evolution_stickers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/webp'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  due_date date,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamp with time zone,
  recurring boolean NOT NULL DEFAULT false,
  recurring_day integer,
  icon text DEFAULT 'Receipt'::text,
  color text DEFAULT 'primary'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.goals_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customers_goal integer NOT NULL DEFAULT 200,
  revenue_goal numeric NOT NULL DEFAULT 10000,
  projection_goal numeric NOT NULL DEFAULT 15000,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.message_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  message_type text NOT NULL DEFAULT 'confirmation'::text,
  source text NOT NULL DEFAULT 'cakto'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  error_message text,
  whatsapp_response jsonb,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.panel_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  icon text DEFAULT 'ExternalLink'::text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_confirmations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid,
  customer_name text NOT NULL,
  customer_phone text,
  amount numeric NOT NULL DEFAULT 0,
  plan_name text,
  duration_days integer NOT NULL DEFAULT 30,
  new_due_date date NOT NULL,
  status text NOT NULL DEFAULT 'approved'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method payment_method NOT NULL DEFAULT 'pix'::payment_method,
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual'::text
);
CREATE TABLE public.pending_activation_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone_normalized text NOT NULL,
  app_name text NOT NULL,
  customer_name text NOT NULL,
  mac_address text,
  email text,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '01:00:00'::interval),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.pending_manual_renewals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  customer_id uuid,
  customer_name text NOT NULL,
  customer_phone text,
  username text,
  server_id uuid,
  server_name text,
  server_host text,
  plan_name text,
  amount numeric DEFAULT 0,
  new_due_date date,
  reason text NOT NULL DEFAULT 'manual'::text,
  error_details jsonb,
  source text DEFAULT 'cakto'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  locked_at timestamp with time zone
);
CREATE TABLE public.pending_new_customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  username text NOT NULL,
  server_id uuid,
  plan_id uuid,
  checkout_url text,
  used boolean DEFAULT false,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.pending_renewal_selections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone_normalized text NOT NULL,
  customer_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  used boolean NOT NULL DEFAULT false
);
CREATE TABLE public.plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_name text NOT NULL,
  duration_days integer NOT NULL,
  price numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  checkout_url text DEFAULT ''::text,
  card_checkout_url text
);
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.quick_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  content text NOT NULL,
  icon text DEFAULT 'MessageSquare'::text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE TABLE public.reseller_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  access_expires_at timestamp with time zone NOT NULL DEFAULT (now() + '30 days'::interval),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  parent_reseller_id uuid,
  credits integer NOT NULL DEFAULT 0,
  max_evolution_instances integer NOT NULL DEFAULT 1
);
CREATE TABLE public.reseller_access_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  days integer NOT NULL DEFAULT 30,
  created_by uuid NOT NULL,
  used_by uuid,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.reseller_api_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cakto_webhook_secret text DEFAULT ''::text,
  natv_api_key text DEFAULT ''::text,
  natv_base_url text DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  cakto_client_id text DEFAULT ''::text,
  cakto_client_secret text DEFAULT ''::text,
  the_best_base_url text DEFAULT ''::text,
  the_best_username text DEFAULT ''::text,
  the_best_password text DEFAULT ''::text,
  rush_username text DEFAULT ''::text,
  rush_password text DEFAULT ''::text,
  rush_token text DEFAULT ''::text,
  rush_base_url text DEFAULT ''::text,
  natv2_api_key text,
  natv2_base_url text,
  uniplay_username text,
  uniplay_password text,
  uniplay_base_url text
);
CREATE TABLE public.reseller_checkout_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text NOT NULL,
  display_name text,
  logo_url text,
  brand_color text NOT NULL DEFAULT '#e11d48'::text,
  headline text,
  subheadline text,
  enable_efi boolean NOT NULL DEFAULT true,
  enable_cakto boolean NOT NULL DEFAULT true,
  api_key text NOT NULL,
  webhook_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  activation_cakto_url text
);
CREATE TABLE public.servers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  server_name text NOT NULL,
  host text NOT NULL,
  description text,
  status server_status NOT NULL DEFAULT 'online'::server_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  auto_renew boolean NOT NULL DEFAULT false,
  is_public boolean DEFAULT false
);
CREATE TABLE public.user_evolution_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instance_name text NOT NULL,
  instance_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  advanced_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  webhook_events text[] NOT NULL DEFAULT ARRAY['MESSAGE'::text, 'SEND_MESSAGE'::text, 'CONNECTION'::text, 'PRESENCE'::text, 'CHAT_PRESENCE'::text],
  webhook_enabled boolean NOT NULL DEFAULT true,
  settings_updated_at timestamp with time zone,
  profile_pic_url text,
  profile_name text,
  owner_phone text,
  profile_updated_at timestamp with time zone
);
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL DEFAULT 'user'::app_role,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.vplay_servers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  server_name text NOT NULL,
  integration_url text NOT NULL,
  key_message text NOT NULL DEFAULT 'XCLOUD'::text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  phone_from text,
  phone_to text,
  message_content text,
  raw_payload jsonb,
  processed boolean NOT NULL DEFAULT false,
  auto_reply_sent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.xui_one_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  base_url text NOT NULL DEFAULT ''::text,
  api_key text NOT NULL DEFAULT ''::text,
  access_code text NOT NULL DEFAULT ''::text,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.zap_responder_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  api_base_url text NOT NULL DEFAULT 'https://api.zapresponder.com.br/v1'::text,
  selected_session_id text,
  selected_session_name text,
  selected_session_phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  selected_department_id text,
  selected_department_name text,
  user_id uuid,
  zap_api_token text,
  api_type text NOT NULL DEFAULT 'zap_responder'::text,
  instance_name text,
  meta_access_token text,
  meta_token_expires_at timestamp with time zone,
  meta_user_id text,
  meta_business_id text,
  meta_phone_number_id text,
  meta_display_phone text,
  meta_connected_at timestamp with time zone
);


-- ============================================================
-- CONSTRAINTS (PK, FK, UNIQUE, CHECK)
-- ============================================================
ALTER TABLE public.activation_apps ADD CONSTRAINT activation_apps_pkey PRIMARY KEY (id);
ALTER TABLE public.activation_panel_credentials ADD CONSTRAINT activation_panel_credentials_pkey PRIMARY KEY (id);
ALTER TABLE public.activation_panel_credentials ADD CONSTRAINT activation_panel_credentials_user_id_panel_type_key UNIQUE (user_id, panel_type);
ALTER TABLE public.activation_requests ADD CONSTRAINT activation_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_knowledge_candidates ADD CONSTRAINT ai_knowledge_candidates_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'merged'::text])));
ALTER TABLE public.ai_knowledge_candidates ADD CONSTRAINT ai_knowledge_candidates_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_knowledge_entries ADD CONSTRAINT ai_knowledge_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_knowledge_items ADD CONSTRAINT ai_knowledge_items_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_knowledge_items ADD CONSTRAINT ai_knowledge_items_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES ai_knowledge_items(id) ON DELETE SET NULL;
ALTER TABLE public.ai_training_conversations ADD CONSTRAINT ai_training_conversations_source_check CHECK ((source = ANY (ARRAY['evolution'::text, 'oficial'::text])));
ALTER TABLE public.ai_training_conversations ADD CONSTRAINT ai_training_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_training_jobs ADD CONSTRAINT ai_training_jobs_kind_check CHECK ((kind = ANY (ARRAY['import'::text, 'analyze'::text])));
ALTER TABLE public.ai_training_jobs ADD CONSTRAINT ai_training_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.auto_replies ADD CONSTRAINT auto_replies_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_logs ADD CONSTRAINT billing_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.billing_logs ADD CONSTRAINT billing_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_schedule ADD CONSTRAINT billing_schedule_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_schedule ADD CONSTRAINT unique_user_schedule UNIQUE (user_id);
ALTER TABLE public.billing_settings ADD CONSTRAINT billing_settings_renewal_notification_target_check CHECK ((renewal_notification_target = ANY (ARRAY['admin'::text, 'both'::text])));
ALTER TABLE public.billing_settings ADD CONSTRAINT billing_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_settings ADD CONSTRAINT billing_settings_user_id_key UNIQUE (user_id);
ALTER TABLE public.bot_flow_sessions ADD CONSTRAINT bot_flow_sessions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES bot_flows(id) ON DELETE CASCADE;
ALTER TABLE public.bot_flow_sessions ADD CONSTRAINT bot_flow_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.bot_flow_sessions ADD CONSTRAINT bot_flow_sessions_owner_id_phone_key UNIQUE (owner_id, phone);
ALTER TABLE public.bot_flows ADD CONSTRAINT bot_flows_pkey PRIMARY KEY (id);
ALTER TABLE public.bot_triggers ADD CONSTRAINT bot_triggers_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['inadimplente'::text, 'boas_vindas'::text, 'renovacao'::text, 'lembrete'::text])));
ALTER TABLE public.bot_triggers ADD CONSTRAINT bot_triggers_pkey PRIMARY KEY (id);
ALTER TABLE public.bot_triggers ADD CONSTRAINT bot_triggers_user_id_trigger_type_key UNIQUE (user_id, trigger_type);
ALTER TABLE public.broadcast_logs ADD CONSTRAINT broadcast_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.broadcast_logs ADD CONSTRAINT broadcast_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.broadcast_logs ADD CONSTRAINT broadcast_logs_phone_template_unique UNIQUE (phone_normalized, template_name);
ALTER TABLE public.cakto_processed_events ADD CONSTRAINT cakto_processed_events_pkey PRIMARY KEY (cakto_id);
ALTER TABLE public.crm_oficial_billing_schedule ADD CONSTRAINT crm_oficial_billing_schedule_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_oficial_billing_schedule ADD CONSTRAINT crm_oficial_billing_schedule_user_id_key UNIQUE (user_id);
ALTER TABLE public.crm_oficial_hidden_templates ADD CONSTRAINT crm_oficial_hidden_templates_target_check CHECK (((template_id IS NOT NULL) OR (template_name IS NOT NULL)));
ALTER TABLE public.crm_oficial_hidden_templates ADD CONSTRAINT crm_oficial_hidden_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.crm_oficial_hidden_templates ADD CONSTRAINT crm_oficial_hidden_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_oficial_hidden_templates ADD CONSTRAINT crm_oficial_hidden_templates_unique UNIQUE (user_id, template_name, language);
ALTER TABLE public.crm_oficial_settings ADD CONSTRAINT crm_oficial_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.crm_oficial_settings ADD CONSTRAINT crm_oficial_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_oficial_settings ADD CONSTRAINT crm_oficial_settings_user_id_key UNIQUE (user_id);
ALTER TABLE public.customer_backups ADD CONSTRAINT customer_backups_pkey PRIMARY KEY (id);
ALTER TABLE public.customers ADD CONSTRAINT customers_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD CONSTRAINT customers_server_id_fkey FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD CONSTRAINT customers_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE public.departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])));
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_user_id_token_key UNIQUE (user_id, token);
ALTER TABLE public.efi_charges ADD CONSTRAINT efi_charges_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'expired'::text, 'cancelled'::text])));
ALTER TABLE public.efi_charges ADD CONSTRAINT efi_charges_pending_kind_check CHECK ((pending_kind = ANY (ARRAY['new_customer'::text, 'manual_renewal'::text, 'manual'::text])));
ALTER TABLE public.efi_charges ADD CONSTRAINT efi_charges_pkey PRIMARY KEY (id);
ALTER TABLE public.efi_charges ADD CONSTRAINT efi_charges_txid_key UNIQUE (txid);
ALTER TABLE public.efi_settings ADD CONSTRAINT efi_settings_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text])));
ALTER TABLE public.efi_settings ADD CONSTRAINT efi_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.efi_settings ADD CONSTRAINT efi_settings_user_id_key UNIQUE (user_id);
ALTER TABLE public.evolution_billing_schedule ADD CONSTRAINT evolution_billing_schedule_pkey PRIMARY KEY (id);
ALTER TABLE public.evolution_billing_schedule ADD CONSTRAINT evolution_billing_schedule_user_id_key UNIQUE (user_id);
ALTER TABLE public.evolution_contacts ADD CONSTRAINT evolution_contacts_pkey PRIMARY KEY (id);
ALTER TABLE public.evolution_contacts ADD CONSTRAINT evolution_contacts_user_id_phone_key UNIQUE (user_id, phone);
ALTER TABLE public.evolution_conversation_state ADD CONSTRAINT evolution_conversation_state_pkey PRIMARY KEY (id);
ALTER TABLE public.evolution_conversation_state ADD CONSTRAINT evolution_conversation_state_user_id_phone_key UNIQUE (user_id, phone);
ALTER TABLE public.evolution_messages ADD CONSTRAINT evolution_messages_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])));
ALTER TABLE public.evolution_messages ADD CONSTRAINT evolution_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.evolution_presence ADD CONSTRAINT evolution_presence_pkey PRIMARY KEY (id);
ALTER TABLE public.evolution_presence ADD CONSTRAINT evolution_presence_user_id_phone_key UNIQUE (user_id, phone);
ALTER TABLE public.evolution_settings ADD CONSTRAINT evolution_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.evolution_settings ADD CONSTRAINT evolution_settings_user_id_key UNIQUE (user_id);
ALTER TABLE public.evolution_stickers ADD CONSTRAINT evolution_stickers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.evolution_stickers ADD CONSTRAINT evolution_stickers_pkey PRIMARY KEY (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.goals_settings ADD CONSTRAINT goals_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.goals_settings ADD CONSTRAINT goals_settings_user_id_key UNIQUE (user_id);
ALTER TABLE public.message_logs ADD CONSTRAINT message_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE public.message_logs ADD CONSTRAINT message_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.panel_links ADD CONSTRAINT panel_links_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_confirmations ADD CONSTRAINT payment_confirmations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE public.payment_confirmations ADD CONSTRAINT payment_confirmations_pkey PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_activation_data ADD CONSTRAINT pending_activation_data_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_manual_renewals ADD CONSTRAINT pending_manual_renewals_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_new_customers ADD CONSTRAINT pending_new_customers_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id);
ALTER TABLE public.pending_new_customers ADD CONSTRAINT pending_new_customers_server_id_fkey FOREIGN KEY (server_id) REFERENCES servers(id);
ALTER TABLE public.pending_new_customers ADD CONSTRAINT pending_new_customers_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_renewal_selections ADD CONSTRAINT pending_renewal_selections_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.pending_renewal_selections ADD CONSTRAINT pending_renewal_selections_pkey PRIMARY KEY (id);
ALTER TABLE public.plans ADD CONSTRAINT plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(user_id);
ALTER TABLE public.plans ADD CONSTRAINT plans_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
ALTER TABLE public.quick_messages ADD CONSTRAINT quick_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.quick_messages ADD CONSTRAINT quick_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.reseller_access ADD CONSTRAINT reseller_access_parent_reseller_id_fkey FOREIGN KEY (parent_reseller_id) REFERENCES reseller_access(user_id) ON DELETE SET NULL;
ALTER TABLE public.reseller_access ADD CONSTRAINT reseller_access_pkey PRIMARY KEY (id);
ALTER TABLE public.reseller_access ADD CONSTRAINT reseller_access_user_id_key UNIQUE (user_id);
ALTER TABLE public.reseller_access_codes ADD CONSTRAINT reseller_access_codes_pkey PRIMARY KEY (id);
ALTER TABLE public.reseller_access_codes ADD CONSTRAINT reseller_access_codes_code_key UNIQUE (code);
ALTER TABLE public.reseller_api_settings ADD CONSTRAINT reseller_api_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.reseller_api_settings ADD CONSTRAINT reseller_api_settings_user_id_key UNIQUE (user_id);
ALTER TABLE public.reseller_checkout_settings ADD CONSTRAINT reseller_checkout_slug_format CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'::text));
ALTER TABLE public.reseller_checkout_settings ADD CONSTRAINT reseller_checkout_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reseller_checkout_settings ADD CONSTRAINT reseller_checkout_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.reseller_checkout_settings ADD CONSTRAINT reseller_checkout_settings_api_key_key UNIQUE (api_key);
ALTER TABLE public.reseller_checkout_settings ADD CONSTRAINT reseller_checkout_settings_slug_key UNIQUE (slug);
ALTER TABLE public.reseller_checkout_settings ADD CONSTRAINT reseller_checkout_settings_user_id_key UNIQUE (user_id);
ALTER TABLE public.servers ADD CONSTRAINT servers_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(user_id);
ALTER TABLE public.servers ADD CONSTRAINT servers_pkey PRIMARY KEY (id);
ALTER TABLE public.user_evolution_instances ADD CONSTRAINT user_evolution_instances_pkey PRIMARY KEY (id);
ALTER TABLE public.user_evolution_instances ADD CONSTRAINT user_evolution_instances_instance_name_key UNIQUE (instance_name);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
ALTER TABLE public.vplay_servers ADD CONSTRAINT vplay_servers_pkey PRIMARY KEY (id);
ALTER TABLE public.webhook_logs ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.xui_one_settings ADD CONSTRAINT xui_one_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.xui_one_settings ADD CONSTRAINT xui_one_settings_user_id_key UNIQUE (user_id);
ALTER TABLE public.zap_responder_settings ADD CONSTRAINT zap_responder_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.zap_responder_settings ADD CONSTRAINT zap_responder_settings_pkey PRIMARY KEY (id);


-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE UNIQUE INDEX activation_panel_credentials_user_id_panel_type_key ON public.activation_panel_credentials USING btree (user_id, panel_type);
CREATE INDEX ai_knowledge_candidates_user_status ON public.ai_knowledge_candidates USING btree (user_id, status);
CREATE INDEX ai_knowledge_candidates_embedding ON public.ai_knowledge_candidates USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_ai_kb_user ON public.ai_knowledge_entries USING btree (user_id, sort_order);
CREATE INDEX ai_knowledge_entries_embedding ON public.ai_knowledge_entries USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_ai_ki_usage ON public.ai_knowledge_items USING btree (user_id, usage_count DESC);
CREATE INDEX ai_ki_embedding_idx ON public.ai_knowledge_items USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_ai_ki_user_status ON public.ai_knowledge_items USING btree (user_id, status, kind);
CREATE UNIQUE INDEX ai_training_conversations_dedup_idx ON public.ai_training_conversations USING btree (user_id, source, contact_phone, started_at, ended_at);
CREATE INDEX ai_training_conversations_user_analyzed ON public.ai_training_conversations USING btree (user_id, analyzed_at);
CREATE INDEX idx_ai_training_conversations_user_pending_created ON public.ai_training_conversations USING btree (user_id, created_at) WHERE (analyzed_at IS NULL);
CREATE INDEX ai_training_conversations_user_source ON public.ai_training_conversations USING btree (user_id, source);
CREATE INDEX ai_training_jobs_user ON public.ai_training_jobs USING btree (user_id, created_at DESC);
CREATE INDEX idx_auto_replies_user_enabled ON public.auto_replies USING btree (user_id, is_enabled);
CREATE INDEX idx_auto_replies_keyword ON public.auto_replies USING btree (trigger_keyword);
CREATE INDEX idx_billing_logs_sent_date_status_customer ON public.billing_logs USING btree (sent_date_br, whatsapp_status, customer_id);
CREATE UNIQUE INDEX billing_logs_one_sent_per_day_idx ON public.billing_logs USING btree (customer_id, billing_type, sent_date_br) WHERE (whatsapp_status = ANY (ARRAY['pending'::text, 'sent'::text]));
CREATE UNIQUE INDEX unique_user_schedule ON public.billing_schedule USING btree (user_id);
CREATE UNIQUE INDEX billing_settings_user_id_key ON public.billing_settings USING btree (user_id);
CREATE INDEX bot_flow_sessions_expires_idx ON public.bot_flow_sessions USING btree (expires_at);
CREATE INDEX bot_flow_sessions_owner_phone_idx ON public.bot_flow_sessions USING btree (owner_id, phone);
CREATE UNIQUE INDEX bot_flow_sessions_owner_id_phone_key ON public.bot_flow_sessions USING btree (owner_id, phone);
CREATE INDEX bot_flows_owner_idx ON public.bot_flows USING btree (owner_id);
CREATE UNIQUE INDEX bot_triggers_user_id_trigger_type_key ON public.bot_triggers USING btree (user_id, trigger_type);
CREATE INDEX idx_broadcast_logs_template_status ON public.broadcast_logs USING btree (template_name, last_status);
CREATE UNIQUE INDEX broadcast_logs_phone_template_unique ON public.broadcast_logs USING btree (phone_normalized, template_name);
CREATE UNIQUE INDEX crm_oficial_billing_schedule_user_id_key ON public.crm_oficial_billing_schedule USING btree (user_id);
CREATE UNIQUE INDEX crm_oficial_hidden_templates_unique ON public.crm_oficial_hidden_templates USING btree (user_id, template_name, language);
CREATE UNIQUE INDEX crm_oficial_settings_user_id_key ON public.crm_oficial_settings USING btree (user_id);
CREATE UNIQUE INDEX customers_created_by_checkout_code_key ON public.customers USING btree (created_by, checkout_code);
CREATE UNIQUE INDEX device_tokens_user_id_token_key ON public.device_tokens USING btree (user_id, token);
CREATE INDEX idx_device_tokens_user ON public.device_tokens USING btree (user_id);
CREATE INDEX efi_charges_owner_idx ON public.efi_charges USING btree (owner_id);
CREATE INDEX efi_charges_customer_idx ON public.efi_charges USING btree (customer_id);
CREATE UNIQUE INDEX efi_charges_txid_key ON public.efi_charges USING btree (txid);
CREATE INDEX efi_charges_status_idx ON public.efi_charges USING btree (status);
CREATE UNIQUE INDEX efi_settings_user_id_key ON public.efi_settings USING btree (user_id);
CREATE UNIQUE INDEX evolution_billing_schedule_user_id_key ON public.evolution_billing_schedule USING btree (user_id);
CREATE INDEX idx_evo_contacts_needs_human ON public.evolution_contacts USING btree (user_id, needs_human) WHERE (needs_human = true);
CREATE UNIQUE INDEX evolution_contacts_user_id_phone_key ON public.evolution_contacts USING btree (user_id, phone);
CREATE UNIQUE INDEX evolution_conversation_state_user_id_phone_key ON public.evolution_conversation_state USING btree (user_id, phone);
CREATE UNIQUE INDEX idx_evolution_messages_user_external_unique ON public.evolution_messages USING btree (user_id, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_evo_msg_user_instance ON public.evolution_messages USING btree (user_id, instance_name, created_at DESC);
CREATE INDEX idx_evolution_messages_user_created_at_id ON public.evolution_messages USING btree (user_id, created_at, id);
CREATE INDEX idx_evo_msg_user_phone ON public.evolution_messages USING btree (user_id, phone, created_at DESC);
CREATE UNIQUE INDEX evolution_presence_user_id_phone_key ON public.evolution_presence USING btree (user_id, phone);
CREATE UNIQUE INDEX evolution_settings_user_id_key ON public.evolution_settings USING btree (user_id);
CREATE INDEX evolution_stickers_user_idx ON public.evolution_stickers USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX goals_settings_user_id_key ON public.goals_settings USING btree (user_id);
CREATE INDEX idx_message_logs_user_id ON public.message_logs USING btree (user_id);
CREATE INDEX idx_message_logs_status ON public.message_logs USING btree (status);
CREATE INDEX idx_message_logs_created_at ON public.message_logs USING btree (created_at DESC);
CREATE INDEX idx_pmr_owner ON public.pending_manual_renewals USING btree (owner_id, created_at DESC);
CREATE INDEX idx_pmr_locked_at ON public.pending_manual_renewals USING btree (locked_at);
CREATE INDEX idx_pending_renewal_phone ON public.pending_renewal_selections USING btree (phone_normalized, used, expires_at);
CREATE UNIQUE INDEX profiles_user_id_key ON public.profiles USING btree (user_id);
CREATE INDEX idx_reseller_access_parent ON public.reseller_access USING btree (parent_reseller_id);
CREATE UNIQUE INDEX reseller_access_user_id_key ON public.reseller_access USING btree (user_id);
CREATE UNIQUE INDEX reseller_access_codes_code_key ON public.reseller_access_codes USING btree (code);
CREATE UNIQUE INDEX reseller_api_settings_user_id_key ON public.reseller_api_settings USING btree (user_id);
CREATE INDEX idx_reseller_checkout_api_key ON public.reseller_checkout_settings USING btree (api_key);
CREATE INDEX idx_reseller_checkout_slug ON public.reseller_checkout_settings USING btree (slug);
CREATE UNIQUE INDEX reseller_checkout_settings_api_key_key ON public.reseller_checkout_settings USING btree (api_key);
CREATE UNIQUE INDEX reseller_checkout_settings_slug_key ON public.reseller_checkout_settings USING btree (slug);
CREATE UNIQUE INDEX reseller_checkout_settings_user_id_key ON public.reseller_checkout_settings USING btree (user_id);
CREATE UNIQUE INDEX user_evolution_instances_instance_name_key ON public.user_evolution_instances USING btree (instance_name);
CREATE UNIQUE INDEX user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role);
CREATE INDEX idx_webhook_logs_user_created ON public.webhook_logs USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX xui_one_settings_user_id_key ON public.xui_one_settings USING btree (user_id);
CREATE INDEX idx_zap_responder_settings_selected_department_id ON public.zap_responder_settings USING btree (selected_department_id);
CREATE UNIQUE INDEX idx_zap_responder_settings_user_id ON public.zap_responder_settings USING btree (user_id) WHERE (user_id IS NOT NULL);


-- ============================================================
-- FUNÇÕES (apenas plpgsql/sql do projeto)
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_grant_first_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if this is the first user (no admin exists)
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.batch_update_customers_natv()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- This is a one-time function to batch update NATV customers
  -- It will be dropped after execution
  NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_update_customers(usernames text[], server_ids uuid[], due_dates date[], statuses text[], screen_counts integer[], plan_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count int := 0;
  i int;
BEGIN
  FOR i IN 1..array_length(usernames, 1) LOOP
    UPDATE customers SET
      server_id = server_ids[i],
      due_date = COALESCE(due_dates[i], due_date),
      status = statuses[i]::customer_status,
      screens = screen_counts[i],
      plan_id = plan_ids[i]
    WHERE username = usernames[i];
    IF FOUND THEN updated_count := updated_count + 1; END IF;
  END LOOP;
  RETURN updated_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_backups()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.customer_backups
  WHERE id NOT IN (
    SELECT id FROM public.customer_backups
    ORDER BY created_at DESC
    LIMIT 144
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_reseller_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
BEGIN
  -- Get the user's email from auth.users
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
  
  -- Only create reseller_access if user is not admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'admin') THEN
    INSERT INTO public.reseller_access (user_id, email, full_name, access_expires_at)
    VALUES (NEW.user_id, COALESCE(user_email, ''), NEW.full_name, now() + interval '30 days');
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_customer_checkout_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.checkout_code IS NULL OR btrim(NEW.checkout_code) = '' THEN
    NEW.checkout_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  ELSE
    NEW.checkout_code := upper(regexp_replace(NEW.checkout_code, '[^A-Za-z0-9]', '', 'g'));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats_optimized()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  sp_now TIMESTAMP := (NOW() AT TIME ZONE 'America/Sao_Paulo');
  today_date DATE := sp_now::date;
  tomorrow_date DATE := (sp_now + interval '1 day')::date;
  yesterday_date DATE := (sp_now - interval '1 day')::date;
  month_start DATE := date_trunc('month', sp_now)::date;
  current_user_id UUID := auth.uid();
BEGIN
  SELECT json_build_object(
    'totalCustomers', COALESCE(SUM(1), 0),
    'activeCustomers', COALESCE(SUM(CASE WHEN status = 'ativa' AND due_date >= today_date THEN 1 ELSE 0 END), 0),
    'inactiveCustomers', COALESCE(SUM(CASE WHEN status = 'inativa' THEN 1 ELSE 0 END), 0),
    'suspendedCustomers', COALESCE(SUM(CASE WHEN status = 'suspensa' THEN 1 ELSE 0 END), 0),
    'dueTodayCustomers', COALESCE(SUM(CASE WHEN due_date = today_date AND status IN ('ativa','inativa') THEN 1 ELSE 0 END), 0),
    'dueTomorrowCustomers', COALESCE(SUM(CASE WHEN due_date = tomorrow_date AND status IN ('ativa','inativa') THEN 1 ELSE 0 END), 0),
    'overdueOneDayCustomers', COALESCE(SUM(CASE WHEN due_date = yesterday_date AND status IN ('ativa','inativa') THEN 1 ELSE 0 END), 0),
    'overdueCustomers', COALESCE(SUM(CASE WHEN due_date < today_date AND status IN ('ativa','inativa') THEN 1 ELSE 0 END), 0),
    'newCustomersThisMonth', COALESCE(SUM(CASE WHEN created_at >= month_start THEN 1 ELSE 0 END), 0),
    'monthlyProjection', COALESCE(SUM(
      CASE WHEN status = 'ativa' AND due_date >= today_date THEN 
        COALESCE(custom_price, (SELECT price FROM plans WHERE plans.id = customers.plan_id), 0)
      ELSE 0 END
    ), 0)
  ) INTO result
  FROM customers
  WHERE created_by = current_user_id OR is_admin();
  
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  sp_now TIMESTAMP := (NOW() AT TIME ZONE 'America/Sao_Paulo');
  month_start DATE := date_trunc('month', sp_now)::date;
  today_date DATE := sp_now::date;
  current_user_id UUID := auth.uid();
BEGIN
  SELECT json_build_object(
    'monthlyRevenue', COALESCE(SUM(amount), 0),
    'todayRevenue', COALESCE(SUM(CASE WHEN payment_date = today_date THEN amount ELSE 0 END), 0),
    'todayPaymentCount', COALESCE(SUM(CASE WHEN payment_date = today_date THEN 1 ELSE 0 END), 0)
  ) INTO result
  FROM payments p
  WHERE payment_date >= month_start
    AND EXISTS (
      SELECT 1 FROM customers c 
      WHERE c.id = p.customer_id 
        AND (c.created_by = current_user_id OR is_admin())
    );
  
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_plan_distribution()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'name', COALESCE(plan_name, 'Sem plano'),
        'value', count
      )
    ), '[]'::json)
    FROM (
      SELECT 
        pl.plan_name,
        COUNT(c.id) as count
      FROM customers c
      LEFT JOIN plans pl ON pl.id = c.plan_id
      WHERE c.created_by = current_user_id OR is_admin()
      GROUP BY pl.plan_name
      ORDER BY count DESC
    ) sub
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_server_distribution()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  RETURN (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'name', COALESCE(server_name, 'Sem servidor'),
          'customers', count
        )
      ),
      '[]'::json
    )
    FROM (
      SELECT
        s.server_name,
        COUNT(c.id) AS count
      FROM customers c
      LEFT JOIN servers s ON s.id = c.server_id
      WHERE (c.created_by = current_user_id OR is_admin())
        AND c.status = 'ativa'
      GROUP BY s.server_name
      ORDER BY count DESC
    ) sub
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'admin')
$function$;

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_candidates(_user_id uuid, query_embedding vector, match_threshold double precision DEFAULT 0.86, match_count integer DEFAULT 3)
 RETURNS TABLE(id uuid, canonical_question text, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.canonical_question, 1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.ai_knowledge_candidates c
  WHERE c.user_id = _user_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$function$;

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_entries(_user_id uuid, query_embedding vector, match_threshold double precision DEFAULT 0.82, match_count integer DEFAULT 1)
 RETURNS TABLE(id uuid, title text, category text, response_template text, media_url text, media_mime text, media_type text, media_filename text, requires_human boolean, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.title, e.category, e.response_template,
         e.media_url, e.media_mime, e.media_type, e.media_filename,
         e.requires_human,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.ai_knowledge_entries e
  WHERE e.user_id = _user_id
    AND e.is_enabled = true
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) >= match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$function$;

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_items(_user_id uuid, _kind ai_knowledge_kind, _category text, query_embedding vector, match_threshold double precision DEFAULT 0.86, match_count integer DEFAULT 1)
 RETURNS TABLE(id uuid, subject text, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.id, i.subject, 1 - (i.embedding <=> query_embedding) AS similarity
  FROM public.ai_knowledge_items i
  WHERE i.user_id = _user_id
    AND i.kind = _kind
    AND (i.category = _category OR _category IS NULL)
    AND i.status IN ('pending','approved')
    AND i.embedding IS NOT NULL
    AND 1 - (i.embedding <=> query_embedding) >= match_threshold
  ORDER BY i.embedding <=> query_embedding
  LIMIT match_count;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_customer_username(_username text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT nullif(lower(btrim(coalesce(_username, ''))), '')
$function$;

CREATE OR REPLACE FUNCTION public.notify_pending_manual_renewal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM extensions.http_post(
    url := 'https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object(
      'type', 'pending_manual_renewal',
      'owner_id', NEW.owner_id,
      'title', 'Pendência de renovação',
      'body', COALESCE(NEW.customer_name,'Cliente') || ' — ' || COALESCE(NEW.server_name,''),
      'data', jsonb_build_object(
        'pending_id', NEW.id,
        'customer_id', NEW.customer_id,
        'username', NEW.username
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_customer_username()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  normalized_username text;
  conflict_name text;
BEGIN
  normalized_username := public.normalize_customer_username(NEW.username);
  IF normalized_username IS NULL OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.name INTO conflict_name
  FROM public.customers c
  WHERE c.created_by = NEW.created_by
    AND public.normalize_customer_username(c.username) = normalized_username
    AND c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF conflict_name IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_customer_username:%', normalized_username
      USING ERRCODE = '23505', DETAIL = 'Já existe cliente com este usuário para este revendedor.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_pending_customer_username()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  normalized_username text;
BEGIN
  normalized_username := public.normalize_customer_username(NEW.username);
  IF normalized_username IS NULL OR NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.created_by = NEW.owner_id
      AND public.normalize_customer_username(c.username) = normalized_username
  ) THEN
    RAISE EXCEPTION 'duplicate_customer_username:%', normalized_username
      USING ERRCODE = '23505', DETAIL = 'Este usuário já existe. Use a renovação de cliente existente.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pending_new_customers p
    WHERE p.owner_id = NEW.owner_id
      AND public.normalize_customer_username(p.username) = normalized_username
      AND p.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'duplicate_pending_username:%', normalized_username
      USING ERRCODE = '23505', DETAIL = 'Já existe um pedido pendente para este usuário.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.renew_customer_due_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  plan_duration INTEGER;
  months_to_add INTEGER;
  current_due DATE;
  new_due DATE;
  original_day INTEGER;
  sp_today DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  should_process BOOLEAN := false;
BEGIN
  IF NEW.confirmed = true THEN
    IF TG_OP = 'INSERT' THEN
      should_process := true;
    ELSIF TG_OP = 'UPDATE' AND OLD.confirmed = false THEN
      should_process := true;
    END IF;
  END IF;

  IF should_process THEN
    SELECT duration_days INTO plan_duration
    FROM public.plans p
    JOIN public.customers c ON c.plan_id = p.id
    WHERE c.id = NEW.customer_id;
    
    IF plan_duration IS NOT NULL THEN
      CASE plan_duration
        WHEN 30 THEN months_to_add := 1;
        WHEN 90 THEN months_to_add := 3;
        WHEN 180 THEN months_to_add := 6;
        WHEN 365 THEN months_to_add := 12;
        ELSE months_to_add := NULL;
      END CASE;

      SELECT due_date INTO current_due FROM public.customers WHERE id = NEW.customer_id;
      
      IF current_due IS NULL OR current_due < sp_today THEN
        current_due := sp_today;
      END IF;

      IF months_to_add IS NOT NULL THEN
        original_day := EXTRACT(DAY FROM current_due);
        new_due := current_due + (months_to_add || ' months')::interval;
        IF EXTRACT(DAY FROM new_due) <> original_day THEN
          new_due := (date_trunc('month', new_due))::date - 1;
        END IF;
      ELSE
        new_due := current_due + (plan_duration || ' days')::interval;
      END IF;

      UPDATE public.customers
      SET due_date = new_due, status = 'ativa'
      WHERE id = NEW.customer_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_billing_log_sent_date_br()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.sent_date_br := (COALESCE(NEW.sent_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;



-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER trg_activation_panel_credentials_updated_at BEFORE UPDATE ON public.activation_panel_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_ai_knowledge_candidates_updated BEFORE UPDATE ON public.ai_knowledge_candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER ai_knowledge_entries_updated_at BEFORE UPDATE ON public.ai_knowledge_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER ai_ki_updated_at BEFORE UPDATE ON public.ai_knowledge_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_ai_training_conversations_updated BEFORE UPDATE ON public.ai_training_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_auto_replies_updated_at BEFORE UPDATE ON public.auto_replies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_billing_log_sent_date_br_trigger BEFORE INSERT OR UPDATE OF sent_at ON public.billing_logs FOR EACH ROW EXECUTE FUNCTION set_billing_log_sent_date_br();
CREATE TRIGGER update_billing_schedule_updated_at BEFORE UPDATE ON public.billing_schedule FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_billing_settings_updated_at BEFORE UPDATE ON public.billing_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_bot_flow_sessions_updated BEFORE UPDATE ON public.bot_flow_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_bot_flows_updated BEFORE UPDATE ON public.bot_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bot_triggers_updated_at BEFORE UPDATE ON public.bot_triggers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_broadcast_logs_updated_at BEFORE UPDATE ON public.broadcast_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_crm_oficial_billing_schedule_updated_at BEFORE UPDATE ON public.crm_oficial_billing_schedule FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crm_oficial_hidden_templates_updated_at BEFORE UPDATE ON public.crm_oficial_hidden_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crm_oficial_settings_updated_at BEFORE UPDATE ON public.crm_oficial_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_cleanup_backups AFTER INSERT ON public.customer_backups FOR EACH STATEMENT EXECUTE FUNCTION cleanup_old_backups();
CREATE TRIGGER trg_prevent_duplicate_customer_username BEFORE INSERT OR UPDATE OF username, created_by ON public.customers FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_customer_username();
CREATE TRIGGER ensure_customer_checkout_code_trigger BEFORE INSERT OR UPDATE OF checkout_code ON public.customers FOR EACH ROW EXECUTE FUNCTION ensure_customer_checkout_code();
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_device_tokens_updated_at BEFORE UPDATE ON public.device_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER efi_charges_updated_at BEFORE UPDATE ON public.efi_charges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER efi_settings_updated_at BEFORE UPDATE ON public.efi_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_evolution_billing_schedule_updated_at BEFORE UPDATE ON public.evolution_billing_schedule FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_evolution_contacts_updated BEFORE UPDATE ON public.evolution_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_evolution_conversation_state_updated_at BEFORE UPDATE ON public.evolution_conversation_state FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_evolution_settings_updated BEFORE UPDATE ON public.evolution_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_panel_links_updated_at BEFORE UPDATE ON public.panel_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER on_payment_confirmed AFTER INSERT OR UPDATE OF confirmed ON public.payments FOR EACH ROW EXECUTE FUNCTION renew_customer_due_date();
CREATE TRIGGER trg_notify_pending_manual_renewal AFTER INSERT ON public.pending_manual_renewals FOR EACH ROW EXECUTE FUNCTION notify_pending_manual_renewal();
CREATE TRIGGER trg_prevent_duplicate_pending_customer_username BEFORE INSERT OR UPDATE OF username, owner_id ON public.pending_new_customers FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_pending_customer_username();
CREATE TRIGGER create_reseller_access_trigger AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION create_reseller_access();
CREATE TRIGGER grant_first_admin AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION auto_grant_first_admin();
CREATE TRIGGER update_quick_messages_updated_at BEFORE UPDATE ON public.quick_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reseller_access_updated_at BEFORE UPDATE ON public.reseller_access FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reseller_api_settings_updated_at BEFORE UPDATE ON public.reseller_api_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_reseller_checkout_settings_updated_at BEFORE UPDATE ON public.reseller_checkout_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vplay_servers_updated_at BEFORE UPDATE ON public.vplay_servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_xui_one_settings_updated_at BEFORE UPDATE ON public.xui_one_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.activation_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_panel_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_training_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_training_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_flow_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cakto_processed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_oficial_billing_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_oficial_hidden_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_oficial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.efi_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.efi_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_billing_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_conversation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_activation_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_manual_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_new_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_renewal_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_api_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_checkout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_evolution_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vplay_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xui_one_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zap_responder_settings ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- POLICIES (RLS)
-- ============================================================
CREATE POLICY "Users can delete own activation_apps" ON public.activation_apps FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own activation_apps" ON public.activation_apps FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own activation_apps" ON public.activation_apps FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own activation_apps" ON public.activation_apps FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own panel credentials" ON public.activation_panel_credentials FOR ALL TO public USING (((auth.uid() = user_id) OR is_admin())) WITH CHECK (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Service can insert activation_requests" ON public.activation_requests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can delete own activation_requests" ON public.activation_requests FOR DELETE TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can update own activation_requests" ON public.activation_requests FOR UPDATE TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can view own activation_requests" ON public.activation_requests FOR SELECT TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "own candidates" ON public.ai_knowledge_candidates FOR ALL TO public USING (((auth.uid() = user_id) OR is_admin())) WITH CHECK (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users manage own ai_knowledge_entries" ON public.ai_knowledge_entries FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own ai_knowledge_items" ON public.ai_knowledge_items FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "own conversations" ON public.ai_training_conversations FOR ALL TO public USING (((auth.uid() = user_id) OR is_admin())) WITH CHECK (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "own training jobs" ON public.ai_training_jobs FOR ALL TO public USING (((auth.uid() = user_id) OR is_admin())) WITH CHECK (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can delete own auto_replies" ON public.auto_replies FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own auto_replies" ON public.auto_replies FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own auto_replies" ON public.auto_replies FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own auto_replies" ON public.auto_replies FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Admins can delete billing_logs" ON public.billing_logs FOR DELETE TO public USING (is_admin());
CREATE POLICY "Admins can insert billing_logs" ON public.billing_logs FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can view billing_logs" ON public.billing_logs FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Users can delete own schedule" ON public.billing_schedule FOR DELETE TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can insert own schedule" ON public.billing_schedule FOR INSERT TO public WITH CHECK (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can update own schedule" ON public.billing_schedule FOR UPDATE TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can view own schedule" ON public.billing_schedule FOR SELECT TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can delete own billing_settings" ON public.billing_settings FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own billing_settings" ON public.billing_settings FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own billing_settings" ON public.billing_settings FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own billing_settings" ON public.billing_settings FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own bot flow sessions" ON public.bot_flow_sessions FOR ALL TO authenticated USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "owners manage own flows" ON public.bot_flows FOR ALL TO authenticated USING (((owner_id = auth.uid()) OR is_admin())) WITH CHECK (((owner_id = auth.uid()) OR is_admin()));
CREATE POLICY "Users can delete own bot_triggers" ON public.bot_triggers FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own bot_triggers" ON public.bot_triggers FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own bot_triggers" ON public.bot_triggers FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own bot_triggers" ON public.bot_triggers FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Admins can delete broadcast_logs" ON public.broadcast_logs FOR DELETE TO public USING (is_admin());
CREATE POLICY "Admins can insert broadcast_logs" ON public.broadcast_logs FOR INSERT TO public WITH CHECK (is_admin());
CREATE POLICY "Admins can update broadcast_logs" ON public.broadcast_logs FOR UPDATE TO public USING (is_admin());
CREATE POLICY "Admins can view broadcast_logs" ON public.broadcast_logs FOR SELECT TO public USING (is_admin());
CREATE POLICY "Service can manage cakto_processed_events" ON public.cakto_processed_events FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Users manage own crm billing schedule" ON public.crm_oficial_billing_schedule FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage their own hidden CRM templates" ON public.crm_oficial_hidden_templates FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins manage all crm_oficial_settings" ON public.crm_oficial_settings FOR ALL TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users manage their own crm_oficial_settings" ON public.crm_oficial_settings FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins can manage backups" ON public.customer_backups FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users can delete own customers" ON public.customers FOR DELETE TO public USING ((is_admin() OR (auth.uid() = created_by)));
CREATE POLICY "Users can insert own customers" ON public.customers FOR INSERT TO public WITH CHECK (((auth.uid() = created_by) OR is_admin()));
CREATE POLICY "Users can update own customers" ON public.customers FOR UPDATE TO public USING ((is_admin() OR (auth.uid() = created_by)));
CREATE POLICY "Users can view own customers" ON public.customers FOR SELECT TO public USING ((auth.uid() = created_by));
CREATE POLICY "Users can create their own departments" ON public.departments FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own departments" ON public.departments FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own departments" ON public.departments FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own departments" ON public.departments FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage their own device tokens" ON public.device_tokens FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Owners delete own charges" ON public.efi_charges FOR DELETE TO public USING (((auth.uid() = owner_id) OR is_admin()));
CREATE POLICY "Owners insert own charges" ON public.efi_charges FOR INSERT TO public WITH CHECK (((auth.uid() = owner_id) OR is_admin()));
CREATE POLICY "Owners update own charges" ON public.efi_charges FOR UPDATE TO public USING (((auth.uid() = owner_id) OR is_admin())) WITH CHECK (((auth.uid() = owner_id) OR is_admin()));
CREATE POLICY "Owners view own charges" ON public.efi_charges FOR SELECT TO public USING (((auth.uid() = owner_id) OR is_admin()));
CREATE POLICY "Admins manage all efi settings" ON public.efi_settings FOR ALL TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users manage own efi settings" ON public.efi_settings FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own evolution_billing_schedule" ON public.evolution_billing_schedule FOR ALL TO authenticated USING (((auth.uid() = user_id) OR is_admin())) WITH CHECK (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users manage own evolution_contacts" ON public.evolution_contacts FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own evolution conversation state" ON public.evolution_conversation_state FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Owner deletes own evolution_messages" ON public.evolution_messages FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Owner views own evolution_messages" ON public.evolution_messages FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Service inserts evolution_messages" ON public.evolution_messages FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service updates evolution_messages" ON public.evolution_messages FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Service manages presence" ON public.evolution_presence FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Users view own presence" ON public.evolution_presence FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own evolution_settings" ON public.evolution_settings FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "stickers_own" ON public.evolution_stickers FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Only admins can delete expenses" ON public.expenses FOR DELETE TO public USING ((is_admin() AND (auth.uid() = user_id)));
CREATE POLICY "Only admins can insert expenses" ON public.expenses FOR INSERT TO public WITH CHECK ((is_admin() AND (auth.uid() = user_id)));
CREATE POLICY "Only admins can update expenses" ON public.expenses FOR UPDATE TO public USING ((is_admin() AND (auth.uid() = user_id)));
CREATE POLICY "Only admins can view expenses" ON public.expenses FOR SELECT TO public USING ((is_admin() AND (auth.uid() = user_id)));
CREATE POLICY "Users can delete own goals" ON public.goals_settings FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own goals" ON public.goals_settings FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own goals" ON public.goals_settings FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own goals" ON public.goals_settings FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Admins can delete message_logs" ON public.message_logs FOR DELETE TO public USING (is_admin());
CREATE POLICY "Admins can view all message_logs" ON public.message_logs FOR SELECT TO public USING (is_admin());
CREATE POLICY "Service can insert message_logs" ON public.message_logs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can manage panel_links" ON public.panel_links FOR ALL TO public USING (is_admin());
CREATE POLICY "Authenticated users can view panel_links" ON public.panel_links FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can view payment confirmations by id" ON public.payment_confirmations FOR SELECT TO public USING (true);
CREATE POLICY "Users can delete payments for own customers" ON public.payments FOR DELETE TO public USING ((is_admin() OR (EXISTS ( SELECT 1
   FROM customers
  WHERE ((customers.id = payments.customer_id) AND (customers.created_by = auth.uid()))))));
CREATE POLICY "Users can insert payments for own customers" ON public.payments FOR INSERT TO public WITH CHECK ((is_admin() OR (EXISTS ( SELECT 1
   FROM customers
  WHERE ((customers.id = payments.customer_id) AND (customers.created_by = auth.uid()))))));
CREATE POLICY "Users can update payments for own customers" ON public.payments FOR UPDATE TO public USING ((is_admin() OR (EXISTS ( SELECT 1
   FROM customers
  WHERE ((customers.id = payments.customer_id) AND (customers.created_by = auth.uid()))))));
CREATE POLICY "Users can view payments for own customers" ON public.payments FOR SELECT TO public USING ((is_admin() OR (EXISTS ( SELECT 1
   FROM customers
  WHERE ((customers.id = payments.customer_id) AND (customers.created_by = auth.uid()))))));
CREATE POLICY "Anyone can insert pending_activation_data" ON public.pending_activation_data FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can read pending_activation_data" ON public.pending_activation_data FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can update pending_activation_data" ON public.pending_activation_data FOR UPDATE TO public USING (true);
CREATE POLICY "Owners can delete own pending manual renewals" ON public.pending_manual_renewals FOR DELETE TO public USING (((auth.uid() = owner_id) OR is_admin()));
CREATE POLICY "Owners can insert own pending manual renewals" ON public.pending_manual_renewals FOR INSERT TO authenticated WITH CHECK (((auth.uid() = owner_id) OR is_admin()));
CREATE POLICY "Owners can update own pending manual renewals" ON public.pending_manual_renewals FOR UPDATE TO public USING (((auth.uid() = owner_id) OR is_admin()));
CREATE POLICY "Owners can view own pending manual renewals" ON public.pending_manual_renewals FOR SELECT TO public USING (((auth.uid() = owner_id) OR is_admin()));
CREATE POLICY "Anyone can insert pending_new_customers" ON public.pending_new_customers FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can read pending_new_customers" ON public.pending_new_customers FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can update pending_new_customers" ON public.pending_new_customers FOR UPDATE TO public USING (true);
CREATE POLICY "Users can delete own plans" ON public.plans FOR DELETE TO public USING ((is_admin() OR (auth.uid() = created_by)));
CREATE POLICY "Users can insert own plans" ON public.plans FOR INSERT TO public WITH CHECK (((auth.uid() = created_by) OR is_admin()));
CREATE POLICY "Users can update own plans" ON public.plans FOR UPDATE TO public USING ((is_admin() OR (auth.uid() = created_by)));
CREATE POLICY "Users can view own plans" ON public.plans FOR SELECT TO public USING ((auth.uid() = created_by));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can delete own quick_messages" ON public.quick_messages FOR DELETE TO public USING ((auth.uid() = created_by));
CREATE POLICY "Users can insert own quick_messages" ON public.quick_messages FOR INSERT TO public WITH CHECK ((auth.uid() = created_by));
CREATE POLICY "Users can update own quick_messages" ON public.quick_messages FOR UPDATE TO public USING ((auth.uid() = created_by));
CREATE POLICY "Users can view own quick_messages" ON public.quick_messages FOR SELECT TO public USING ((auth.uid() = created_by));
CREATE POLICY "Admins can manage reseller_access limits" ON public.reseller_access FOR UPDATE TO public USING (is_admin());
CREATE POLICY "Resellers can create sub-resellers" ON public.reseller_access FOR INSERT TO public WITH CHECK ((is_admin() OR ((parent_reseller_id = auth.uid()) AND (( SELECT reseller_access_1.credits
   FROM reseller_access reseller_access_1
  WHERE (reseller_access_1.user_id = auth.uid())) >= 1))));
CREATE POLICY "Resellers can delete their sub-resellers" ON public.reseller_access FOR DELETE TO public USING ((is_admin() OR (parent_reseller_id = auth.uid())));
CREATE POLICY "Resellers can update their sub-resellers" ON public.reseller_access FOR UPDATE TO public USING ((is_admin() OR (parent_reseller_id = auth.uid())));
CREATE POLICY "Resellers can view their sub-resellers" ON public.reseller_access FOR SELECT TO public USING (((parent_reseller_id = auth.uid()) OR (user_id = auth.uid()) OR is_admin()));
CREATE POLICY "Users can view own access" ON public.reseller_access FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Delete own unused access codes" ON public.reseller_access_codes FOR DELETE TO authenticated USING ((((created_by = auth.uid()) AND (used_by IS NULL)) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Insert own access codes" ON public.reseller_access_codes FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Update access codes admin only" ON public.reseller_access_codes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "View own access codes" ON public.reseller_access_codes FOR SELECT TO authenticated USING (((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can delete own api settings" ON public.reseller_api_settings FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own api settings" ON public.reseller_api_settings FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own api settings" ON public.reseller_api_settings FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own api settings" ON public.reseller_api_settings FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Admins manage all checkout settings" ON public.reseller_checkout_settings FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Owner manages checkout settings" ON public.reseller_checkout_settings FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own servers" ON public.servers FOR DELETE TO public USING ((is_admin() OR (auth.uid() = created_by)));
CREATE POLICY "Users can insert own servers" ON public.servers FOR INSERT TO public WITH CHECK (((auth.uid() = created_by) OR is_admin()));
CREATE POLICY "Users can update own servers" ON public.servers FOR UPDATE TO public USING ((is_admin() OR (auth.uid() = created_by)));
CREATE POLICY "Users can view own servers" ON public.servers FOR SELECT TO public USING ((auth.uid() = created_by));
CREATE POLICY "Admins update evo instances" ON public.user_evolution_instances FOR UPDATE TO public USING (is_admin());
CREATE POLICY "Users delete own evo instances" ON public.user_evolution_instances FOR DELETE TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users insert own evo instances" ON public.user_evolution_instances FOR INSERT TO public WITH CHECK (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users view own evo instances" ON public.user_evolution_instances FOR SELECT TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can delete own vplay_servers" ON public.vplay_servers FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own vplay_servers" ON public.vplay_servers FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own vplay_servers" ON public.vplay_servers FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own vplay_servers" ON public.vplay_servers FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Service can insert webhook_logs" ON public.webhook_logs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can view own webhook_logs" ON public.webhook_logs FOR SELECT TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can delete own xui_one_settings" ON public.xui_one_settings FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own xui_one_settings" ON public.xui_one_settings FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own xui_one_settings" ON public.xui_one_settings FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own xui_one_settings" ON public.xui_one_settings FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can delete own zap_responder_settings" ON public.zap_responder_settings FOR DELETE TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can insert own zap_responder_settings" ON public.zap_responder_settings FOR INSERT TO public WITH CHECK (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can update own zap_responder_settings" ON public.zap_responder_settings FOR UPDATE TO public USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY "Users can view own zap_responder_settings" ON public.zap_responder_settings FOR SELECT TO public USING (((auth.uid() = user_id) OR is_admin()));


-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('reseller-assets','reseller-assets', true),
  ('evolution-media','evolution-media', false),
  ('evolution-stickers','evolution-stickers', false)
ON CONFLICT (id) DO NOTHING;

-- Policies de Storage
CREATE POLICY "Authenticated can update meta-template-uploads" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'reseller-assets'::text) AND ((storage.foldername(name))[1] = 'meta-template-uploads'::text)));
CREATE POLICY "Authenticated can upload meta-template-uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'reseller-assets'::text) AND ((storage.foldername(name))[1] = 'meta-template-uploads'::text)));
CREATE POLICY "Public read access for reseller assets" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'reseller-assets'::text));
CREATE POLICY "Public read reseller-assets" ON storage.objects FOR SELECT TO anon,authenticated USING ((bucket_id = 'reseller-assets'::text));
CREATE POLICY "Users can delete own evolution media" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'evolution-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users can delete own reseller assets" ON storage.objects FOR DELETE TO public USING (((bucket_id = 'reseller-assets'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users can read own evolution media" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'evolution-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users can update own evolution media" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'evolution-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))) WITH CHECK (((bucket_id = 'evolution-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users can update own reseller assets" ON storage.objects FOR UPDATE TO public USING (((bucket_id = 'reseller-assets'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users can upload own evolution media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'evolution-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users can upload own reseller assets" ON storage.objects FOR INSERT TO public WITH CHECK (((bucket_id = 'reseller-assets'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "stickers_delete_own" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'evolution-stickers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "stickers_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'evolution-stickers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "stickers_select_own" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'evolution-stickers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "stickers_update_own" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'evolution-stickers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
