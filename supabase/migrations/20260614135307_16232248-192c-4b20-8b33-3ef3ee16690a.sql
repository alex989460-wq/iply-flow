ALTER TABLE public.evolution_settings
  ADD COLUMN IF NOT EXISTS autoreply_absence_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autoreply_absence_message text NOT NULL DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Assim que possível responderemos sua mensagem. 🙏',
  ADD COLUMN IF NOT EXISTS autoreply_absence_cooldown_hours integer NOT NULL DEFAULT 6;