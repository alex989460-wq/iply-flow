DELETE FROM public.user_evolution_instances WHERE instance_name = 'pc';
UPDATE public.evolution_settings SET instance_name = '' WHERE instance_name = 'pc';