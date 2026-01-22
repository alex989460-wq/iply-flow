CREATE OR REPLACE FUNCTION public.get_server_distribution()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  RETURN (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'name', COALESCE(server_name, 'Sem servidor'),
          'customers', count
        )
      ),
      '[]'::json
    )
    FROM (
      SELECT
        s.server_name,
        COUNT(c.id) AS count
      FROM customers c
      LEFT JOIN servers s ON s.id = c.server_id
      WHERE (c.created_by = current_user_id OR is_admin())
        AND c.status = 'ativa'
      GROUP BY s.server_name
      ORDER BY count DESC
    ) sub
  );
END;
$$;