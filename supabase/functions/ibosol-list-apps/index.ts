// Retorna a lista de apps do IBO Sol (com logos) usando o token do revendedor.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const API = "https://backend-apis.ibosol.com/api";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const jh = { ...cors, "Content-Type": "application/json" };
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jh });
    }
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jh });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: cred } = await admin
      .from("activation_panel_credentials")
      .select("password, is_enabled")
      .eq("user_id", user.id)
      .eq("panel_type", "ibosol")
      .maybeSingle();
    const token = String((cred as any)?.password || "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token IBO Sol não configurado", apps: [] }), { status: 200, headers: jh });
    }
    const headers = {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: "https://ibosol.com",
      Referer: "https://ibosol.com/multi-apps-activation",
      Authorization: `Bearer ${token}`,
    };
    const endpoints = ["/fetch-allowed-applications"];
    let raw: any = null;
    let status = 0;
    for (const ep of endpoints) {
      const r = await fetch(`${API}${ep}`, { method: "GET", headers });
      status = r.status;
      if (r.status === 401 || r.status === 403) {
        // Retorna 200 com apps vazio para não quebrar a UI; frontend mostra fallback.
        return new Response(JSON.stringify({ error: "Token IBO Sol expirado", expired: true, apps: [] }), { status: 200, headers: jh });
      }
      if (r.ok) { raw = await r.json().catch(() => null); if (raw) break; }
    }
    if (!raw) return new Response(JSON.stringify({ error: `IBO Sol HTTP ${status}`, apps: [] }), { status: 502, headers: jh });

    // Response format: { data: { ApplicationList: [{ id, app_name, app_disp_name, app_logo, ... }] } }
    const list: any[] =
      raw?.data?.ApplicationList ||
      (Array.isArray(raw?.data) ? raw.data : null) ||
      raw?.applications || raw?.apps ||
      (Array.isArray(raw) ? raw : []);
    const apps = list.map((a: any) => ({
      id: a.id ?? a.app_id ?? null,
      name: a.app_name || a.app_disp_name || a.name || a.module || a.selectedModule || "",
      logo: a.app_logo || a.logo || a.icon || a.image || a.img_url || a.logo_url || null,
    })).filter((a) => a.name);


    return new Response(JSON.stringify({ apps }), { headers: jh });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, apps: [] }), { status: 500, headers: jh });
  }
});
