// Validate WhatsApp number existence using the user's Evolution (Baileys) instance.
// This replicates how tools like umnico.com check numbers: via the WhatsApp Web
// protocol's `onWhatsApp` lookup. No cost, no Meta conversation opened.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CheckResult { phone: string; exists: boolean; jid?: string; error?: string }

function normalizeDigits(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return "55" + d; // BR sem DDI
  return d;
}

async function evolutionCheck(baseUrl: string, apiKey: string, instance: string, numbers: string[]): Promise<CheckResult[]> {
  const base = baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/whatsappNumbers/${encodeURIComponent(instance)}`;
  const headers = { "Content-Type": "application/json", apikey: apiKey };

  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ numbers }) });
  if (r.ok) {
    const data = await r.json().catch(() => null);
    const arr: any[] = Array.isArray(data) ? data : (data?.numbers || data?.data || []);
    if (Array.isArray(arr) && arr.length) {
      return numbers.map((n) => {
        const hit = arr.find((x: any) => {
          const num = String(x?.number || x?.jid || "").replace(/\D/g, "");
          return num === n || num.endsWith(n) || n.endsWith(num);
        });
        if (!hit) return { phone: n, exists: false };
        const exists = hit?.exists === true || hit?.isInWhatsapp === true || !!hit?.jid;
        return { phone: n, exists, jid: hit?.jid };
      });
    }
  }

  // Fallback: Evolution Go / user/check (one by one).
  const out: CheckResult[] = [];
  for (const n of numbers) {
    try {
      const res = await fetch(`${base}/user/check`, {
        method: "POST", headers, body: JSON.stringify({ number: [n], formatJid: true }),
      });
      const j = await res.json().catch(() => null);
      const list: any[] = j?.data || j?.results || j || [];
      const hit = Array.isArray(list) ? list[0] : list;
      const jid = String(hit?.jid || hit?.JID || "");
      out.push({ phone: n, exists: !!jid && jid.includes("@"), jid: jid || undefined });
    } catch (e) {
      out.push({ phone: n, exists: false, error: (e as Error).message });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { numbers = [] } = await req.json();
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return new Response(JSON.stringify({ error: "numbers[] obrigatório" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, service);
    const { data: s } = await admin
      .from("evolution_settings")
      .select("base_url, api_key, instance_name, is_enabled")
      .eq("user_id", u.user.id)
      .maybeSingle();

    if (!s?.base_url || !s?.api_key || !s?.instance_name) {
      return new Response(JSON.stringify({
        error: "Configure a Evolution API (API Não Oficial) em Conexões para usar a validação real de WhatsApp.",
      }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Normalize and dedupe.
    const norm = Array.from(new Set(numbers.map(normalizeDigits).filter(Boolean)));

    // Process in chunks of 50 to be safe.
    const results: CheckResult[] = [];
    for (let i = 0; i < norm.length; i += 50) {
      const chunk = norm.slice(i, i + 50);
      try {
        const part = await evolutionCheck(s.base_url, s.api_key, s.instance_name, chunk);
        results.push(...part);
      } catch (e) {
        for (const n of chunk) results.push({ phone: n, exists: false, error: (e as Error).message });
      }
    }

    const valid = results.filter((r) => r.exists).map((r) => r.phone);
    const invalid = results.filter((r) => !r.exists).map((r) => r.phone);

    return new Response(JSON.stringify({ total: results.length, valid_count: valid.length, invalid_count: invalid.length, valid, invalid, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
