ALTER TABLE public.activation_apps ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Popular logos conhecidas
UPDATE public.activation_apps SET logo_url = 'https://iboplayer.pro/m3u/logo-512.png' WHERE upper(app_name) = 'IBOPLAYERPRO' AND (logo_url IS NULL OR logo_url = '');
UPDATE public.activation_apps SET logo_url = 'https://play-lh.googleusercontent.com/8H7uUpBv6vN0h5tK7Bmz-i3T1lYQK3-8kQ5rXk8u_4vP=w240' WHERE upper(app_name) = 'IBOPLAYER' AND (logo_url IS NULL OR logo_url = '');