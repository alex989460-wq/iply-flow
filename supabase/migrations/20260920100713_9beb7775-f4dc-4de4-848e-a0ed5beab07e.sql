CREATE OR REPLACE FUNCTION public.whatsapp_cost_report(_from timestamptz, _to timestamptz)
RETURNS TABLE (
  row_id text,
  customer_id uuid,
  contact_id text,
  contact_name text,
  message_id text,
  channel text,
  direction text,
  category text,
  billing_status text,
  cost_amount numeric,
  cost_currency text,
  message_timestamp timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH price AS (
  SELECT DISTINCT ON (category)
    category,
    CASE WHEN currency = 'BRL' THEN unit_price
         WHEN brl_exchange_rate IS NOT NULL THEN unit_price * brl_exchange_rate
         ELSE NULL END AS brl
  FROM public.whatsapp_pricing
  WHERE market = 'BR' AND active AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
  ORDER BY category, effective_from DESC
),
tpl AS (
  SELECT lower(name) AS name, lower(definition->>'category') AS category
  FROM public.meta_template_cache
),
tracked AS (
  SELECT 'cost:' || c.id::text AS row_id, c.customer_id, c.contact_id, NULL::text AS contact_name,
         c.message_id, c.channel, c.direction, c.category, c.billing_status,
         c.cost_amount, c.cost_currency, c.message_timestamp,
         coalesce(c.provider_message_id, c.message_id) AS dedup_key
  FROM public.whatsapp_message_costs c
  WHERE c.message_timestamp >= _from AND c.message_timestamp < _to
),
official AS (
  SELECT
    'log:' || m.id::text AS row_id,
    m.customer_id,
    m.customer_phone AS contact_id,
    m.customer_name AS contact_name,
    coalesce(m.whatsapp_response->'messages'->0->>'id', m.id::text) AS message_id,
    'official'::text AS channel,
    'outbound'::text AS direction,
    CASE WHEN m.message_type ILIKE '%template%' THEN coalesce(t.category, 'utility') ELSE NULL END AS category,
    CASE
      WHEN m.status NOT IN ('success', 'sent', 'delivered', 'read') THEN 'not_applicable'
      WHEN m.message_type ILIKE '%template%' THEN 'charged'
      ELSE 'free'
    END AS billing_status,
    m.created_at AS message_timestamp,
    coalesce(m.whatsapp_response->'messages'->0->>'id', 'log:' || m.id::text) AS dedup_key
  FROM public.message_logs m
  LEFT JOIN tpl t ON t.name = lower(coalesce(m.metadata->>'template_name', m.metadata->>'template', ''))
  WHERE m.created_at >= _from AND m.created_at < _to
),
broadcasts AS (
  SELECT
    'bc:' || b.id::text AS row_id,
    b.customer_id,
    b.phone_normalized AS contact_id,
    NULL::text AS contact_name,
    coalesce(b.wa_message_id, b.id::text) AS message_id,
    'official'::text AS channel,
    'outbound'::text AS direction,
    t.category AS category,
    CASE
      WHEN b.last_status IS NULL OR b.last_status IN ('failed', 'error', 'skipped') THEN 'not_applicable'
      WHEN t.category IS NULL THEN 'unknown'
      ELSE 'charged'
    END AS billing_status,
    coalesce(b.last_sent_at, b.created_at) AS message_timestamp,
    coalesce(b.wa_message_id, 'bc:' || b.id::text) AS dedup_key
  FROM public.broadcast_logs b
  LEFT JOIN tpl t ON t.name = lower(coalesce(b.template_name, ''))
  WHERE coalesce(b.last_sent_at, b.created_at) >= _from
    AND coalesce(b.last_sent_at, b.created_at) < _to
),
unofficial AS (
  SELECT
    'evo:' || e.id::text AS row_id,
    NULL::uuid AS customer_id,
    e.phone AS contact_id,
    e.contact_name,
    coalesce(e.external_id, e.id::text) AS message_id,
    'unofficial'::text AS channel,
    CASE WHEN e.direction = 'in' THEN 'inbound' ELSE 'outbound' END AS direction,
    NULL::text AS category,
    'not_applicable'::text AS billing_status,
    0::numeric AS cost_amount,
    'BRL'::text AS cost_currency,
    e.created_at AS message_timestamp,
    coalesce(e.external_id, 'evo:' || e.id::text) AS dedup_key
  FROM public.evolution_messages e
  WHERE e.created_at >= _from AND e.created_at < _to
),
derived AS (
  SELECT o.row_id, o.customer_id, o.contact_id, o.contact_name, o.message_id, o.channel, o.direction,
         o.category, o.billing_status,
         CASE WHEN o.billing_status = 'charged' THEN coalesce(p.brl, 0) ELSE 0 END AS cost_amount,
         'BRL'::text AS cost_currency, o.message_timestamp, o.dedup_key
  FROM official o LEFT JOIN price p ON p.category = coalesce(o.category, 'utility')
  UNION ALL
  SELECT b.row_id, b.customer_id, b.contact_id, b.contact_name, b.message_id, b.channel, b.direction,
         b.category, b.billing_status,
         CASE WHEN b.billing_status = 'charged' THEN coalesce(p.brl, 0) ELSE 0 END AS cost_amount,
         'BRL'::text AS cost_currency, b.message_timestamp, b.dedup_key
  FROM broadcasts b LEFT JOIN price p ON p.category = b.category
  UNION ALL
  SELECT u.row_id, u.customer_id, u.contact_id, u.contact_name, u.message_id, u.channel, u.direction,
         u.category, u.billing_status, u.cost_amount, u.cost_currency, u.message_timestamp, u.dedup_key
  FROM unofficial u
),
merged AS (
  SELECT * FROM tracked
  UNION ALL
  SELECT d.row_id, d.customer_id, d.contact_id, d.contact_name, d.message_id, d.channel, d.direction,
         d.category, d.billing_status, d.cost_amount, d.cost_currency, d.message_timestamp, d.dedup_key
  FROM derived d
  WHERE NOT EXISTS (SELECT 1 FROM tracked t WHERE t.dedup_key = d.dedup_key)
)
SELECT DISTINCT ON (dedup_key)
  row_id, customer_id, contact_id, contact_name, message_id, channel, direction,
  category, billing_status, cost_amount, cost_currency, message_timestamp
FROM merged
ORDER BY dedup_key, message_timestamp DESC;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_cost_report(timestamptz, timestamptz) TO authenticated, service_role;