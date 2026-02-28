-- Add source column to payments to distinguish manual vs automatic
ALTER TABLE public.payments ADD COLUMN source text NOT NULL DEFAULT 'manual';

-- Add auto_renew column to servers to control which ones get auto-renewed
ALTER TABLE public.servers ADD COLUMN auto_renew boolean NOT NULL DEFAULT false;