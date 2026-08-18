UPDATE public.pending_manual_renewals p
SET server_name = COALESCE(p.server_name, s.server_name), server_host = COALESCE(p.server_host, s.host)
FROM public.servers s
WHERE s.id = p.server_id AND (p.server_name IS NULL OR p.server_host IS NULL);