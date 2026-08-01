-- 1) Add WITH CHECK to owner-scoped UPDATE policies
DROP POLICY IF EXISTS "Users can update own customers" ON public.customers;
CREATE POLICY "Users can update own customers" ON public.customers FOR UPDATE
  USING (is_admin() OR (auth.uid() = created_by))
  WITH CHECK (is_admin() OR (auth.uid() = created_by));

DROP POLICY IF EXISTS "Users can update own plans" ON public.plans;
CREATE POLICY "Users can update own plans" ON public.plans FOR UPDATE
  USING (is_admin() OR (auth.uid() = created_by))
  WITH CHECK (is_admin() OR (auth.uid() = created_by));

DROP POLICY IF EXISTS "Users can update own servers" ON public.servers;
CREATE POLICY "Users can update own servers" ON public.servers FOR UPDATE
  USING (is_admin() OR (auth.uid() = created_by))
  WITH CHECK (is_admin() OR (auth.uid() = created_by));

DROP POLICY IF EXISTS "Admins can update broadcast_logs" ON public.broadcast_logs;
CREATE POLICY "Admins can update broadcast_logs" ON public.broadcast_logs FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can manage reseller_access limits" ON public.reseller_access;
CREATE POLICY "Admins can manage reseller_access limits" ON public.reseller_access FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Resellers can update their sub-resellers" ON public.reseller_access;
CREATE POLICY "Resellers can update their sub-resellers" ON public.reseller_access FOR UPDATE
  USING (is_admin() OR (parent_reseller_id = auth.uid()))
  WITH CHECK (is_admin() OR (parent_reseller_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own schedule" ON public.billing_schedule;
CREATE POLICY "Users can update own schedule" ON public.billing_schedule FOR UPDATE
  USING ((auth.uid() = user_id) OR is_admin())
  WITH CHECK ((auth.uid() = user_id) OR is_admin());

DROP POLICY IF EXISTS "Users can update own activation_requests" ON public.activation_requests;
CREATE POLICY "Users can update own activation_requests" ON public.activation_requests FOR UPDATE
  USING ((auth.uid() = user_id) OR is_admin())
  WITH CHECK ((auth.uid() = user_id) OR is_admin());

DROP POLICY IF EXISTS "Owners can update own pending manual renewals" ON public.pending_manual_renewals;
CREATE POLICY "Owners can update own pending manual renewals" ON public.pending_manual_renewals FOR UPDATE
  USING ((auth.uid() = owner_id) OR is_admin())
  WITH CHECK ((auth.uid() = owner_id) OR is_admin());

-- 2) Stop bucket-wide listing of reseller-assets (public URLs still work)
DROP POLICY IF EXISTS "Public read access for reseller assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read reseller-assets" ON storage.objects;

-- 3) Restrict SECURITY DEFINER function execution
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats_optimized() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_monthly_revenue() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_plan_distribution() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_server_distribution() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_reseller_customer_counts() FROM anon;

REVOKE EXECUTE ON FUNCTION public.bulk_update_customers(text[], uuid[], date[], text[], integer[], uuid[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.batch_update_customers_natv() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_ai_knowledge_candidates(uuid, vector, double precision, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_ai_knowledge_entries(uuid, vector, double precision, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_ai_knowledge_items(uuid, public.ai_knowledge_kind, text, vector, double precision, integer) FROM anon, authenticated;