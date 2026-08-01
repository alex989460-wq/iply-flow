DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats_optimized() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_server_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reseller_customer_counts() TO authenticated;