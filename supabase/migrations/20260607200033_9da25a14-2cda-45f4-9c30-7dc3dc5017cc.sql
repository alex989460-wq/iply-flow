
ALTER TABLE public.evolution_settings
  ADD COLUMN IF NOT EXISTS autoreply_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autoreply_system_prompt text NOT NULL DEFAULT 'Você é um atendente de suporte cordial e objetivo de uma loja de IPTV. Responda em português, de forma curta (máx. 2 parágrafos), educada e profissional. Se a pessoa pedir algo que você não saiba (preços específicos, status de pagamento, ativação, problema técnico complexo) avise que vai chamar um humano. Nunca invente dados de cliente.',
  ADD COLUMN IF NOT EXISTS autoreply_only_outside_hours boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autoreply_business_start text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS autoreply_business_end text NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS autoreply_disabled_phones text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS autoreply_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview';
