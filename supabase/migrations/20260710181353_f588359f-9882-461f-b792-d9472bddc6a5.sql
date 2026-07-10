CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DROP TRIGGER IF EXISTS trg_notify_pending_manual_renewal ON public.pending_manual_renewals;
CREATE TRIGGER trg_notify_pending_manual_renewal
AFTER INSERT ON public.pending_manual_renewals
FOR EACH ROW EXECUTE FUNCTION public.notify_pending_manual_renewal();