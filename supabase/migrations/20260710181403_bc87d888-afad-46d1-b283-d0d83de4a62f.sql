CREATE OR REPLACE FUNCTION public.notify_pending_manual_renewal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM extensions.http_post(
    url := 'https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object(
      'type', 'pending_manual_renewal',
      'owner_id', NEW.owner_id,
      'title', 'Pendência de renovação',
      'body', COALESCE(NEW.customer_name,'Cliente') || ' — ' || COALESCE(NEW.server_name,''),
      'data', jsonb_build_object(
        'pending_id', NEW.id,
        'customer_id', NEW.customer_id,
        'username', NEW.username
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;