DROP POLICY IF EXISTS "Service can manage cakto_processed_events" ON public.cakto_processed_events;
REVOKE ALL ON public.cakto_processed_events FROM anon, authenticated;
GRANT ALL ON public.cakto_processed_events TO service_role;

DROP POLICY IF EXISTS "Anyone can read pending_new_customers" ON public.pending_new_customers;
DROP POLICY IF EXISTS "Anyone can update pending_new_customers" ON public.pending_new_customers;
DROP POLICY IF EXISTS "Anyone can insert pending_new_customers" ON public.pending_new_customers;
REVOKE ALL ON public.pending_new_customers FROM anon, authenticated;
GRANT ALL ON public.pending_new_customers TO service_role;

DROP POLICY IF EXISTS "Anyone can read pending_activation_data" ON public.pending_activation_data;
DROP POLICY IF EXISTS "Anyone can update pending_activation_data" ON public.pending_activation_data;
DROP POLICY IF EXISTS "Anyone can insert pending_activation_data" ON public.pending_activation_data;
REVOKE ALL ON public.pending_activation_data FROM anon, authenticated;
GRANT ALL ON public.pending_activation_data TO service_role;

DROP POLICY IF EXISTS "Service inserts evolution_messages" ON public.evolution_messages;
DROP POLICY IF EXISTS "Service updates evolution_messages" ON public.evolution_messages;
REVOKE INSERT, UPDATE ON public.evolution_messages FROM anon, authenticated;
GRANT ALL ON public.evolution_messages TO service_role;

DROP POLICY IF EXISTS "Service manages presence" ON public.evolution_presence;
REVOKE INSERT, UPDATE, DELETE ON public.evolution_presence FROM anon, authenticated;
GRANT ALL ON public.evolution_presence TO service_role;

DROP POLICY IF EXISTS "Service can insert webhook_logs" ON public.webhook_logs;
REVOKE INSERT ON public.webhook_logs FROM anon, authenticated;
GRANT ALL ON public.webhook_logs TO service_role;

DROP POLICY IF EXISTS "Service can insert message_logs" ON public.message_logs;
REVOKE INSERT ON public.message_logs FROM anon, authenticated;
GRANT ALL ON public.message_logs TO service_role;

DROP POLICY IF EXISTS "Service can insert activation_requests" ON public.activation_requests;
REVOKE INSERT ON public.activation_requests FROM anon, authenticated;
GRANT ALL ON public.activation_requests TO service_role;

DROP POLICY IF EXISTS "Anyone can view payment confirmations by id" ON public.payment_confirmations;
REVOKE SELECT ON public.payment_confirmations FROM anon;
GRANT ALL ON public.payment_confirmations TO service_role;