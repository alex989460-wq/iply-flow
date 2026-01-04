-- Enable realtime for billing_logs table
ALTER TABLE public.billing_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.billing_logs;