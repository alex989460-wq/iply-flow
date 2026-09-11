// Função temporária de migração: exporta dados para a nova infraestrutura.
// Protegida por segredo próprio. Remover após a virada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-migration-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = Deno.env.get("MIGRATION_EXPORT_KEY") ?? Deno.env.get("MIGRATION_EXPORT_SECRET");
  if (!secret || req.headers.get("x-migration-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "env";

    if (action === "env") {
      // apenas nomes presentes, nunca valores
      const names = ["SUPABASE_DB_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]
        .filter((n) => !!Deno.env.get(n));
      return json({ present: names });
    }

    if (action === "tables") {
      const { data, error } = await supabase.rpc("migration_list_tables");
      if (error) throw error;
      return json({ tables: data });
    }

    if (action === "rows") {
      const table: string = body.table;
      const offset: number = body.offset ?? 0;
      const limit: number = Math.min(body.limit ?? 1000, 5000);
      const { data, error } = await supabase.rpc("migration_dump_rows", {
        p_table: table,
        p_offset: offset,
        p_limit: limit,
      });
      if (error) throw error;
      return json({ rows: data ?? [] });
    }

    if (action === "auth-rows") {
      const { data, error } = await supabase.rpc("migration_dump_auth", {
        p_table: body.table,
        p_offset: body.offset ?? 0,
        p_limit: Math.min(body.limit ?? 1000, 5000),
      });
      if (error) throw error;
      return json({ rows: data ?? [] });
    }

    if (action === "storage-list") {
      const { data, error } = await supabase.rpc("migration_list_objects", {
        p_offset: body.offset ?? 0,
        p_limit: Math.min(body.limit ?? 500, 2000),
      });
      if (error) throw error;
      return json({ objects: data ?? [] });
    }

    if (action === "storage-url") {
      const { data, error } = await supabase.storage
        .from(body.bucket)
        .createSignedUrl(body.name, 3600);
      if (error) throw error;
      return json({ url: data?.signedUrl });
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
