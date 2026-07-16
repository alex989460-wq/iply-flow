ALTER TABLE public.billing_settings
ADD COLUMN IF NOT EXISTS renewal_notification_target text NOT NULL DEFAULT 'both'
CHECK (renewal_notification_target IN ('admin','both'));