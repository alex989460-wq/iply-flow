// Validate WhatsApp number existence using the user's Evolution (Baileys) instance.
// Replicates the umnico.com technique via the WhatsApp Web protocol (`onWhatsApp`).
// No cost, no Meta conversation opened.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CheckResult { phone: string; exists: boolean; jid?: string; error?: string }

function digitsOnly(s: string) { return String(s || "").replace(/\D/g, ""); }

function normalizeDigits(raw: string): string {
  const d = digitsOnly(raw);
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

// BR numbers sometimes come back without the leading 9 (old format).
// Build candidate variants so we can match the response back to the input.
function brVariants(phone: string): string[] {
  const set = new Set<string>([phone]);
  if (phone.startsWith("55") && phone.length === 13 && phone[4] === "9") {
    set.add("55" + phone.slice(2, 4) + phone.slice(5)); // drop the 9
  }
  if (phone.startsWith("55") && phone.length === 12) {
    set.add("55" + phone.slice(2, 4) + "9" + phone.slice(4)); // add the 9
  }
  return [...set];
}

async function resolveInstance(baseUrl: string, apiKey: string, instanceName: string): Promise<{ token: string; jid?: string } | null> {
  const r = await fetch(`${baseUrl}/instance/all`, { headers: { apikey: apiKey } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const list: any[] = j?.data || j || [];
  const hit = list.find((x: any) => x?.name === instanceName || x?.id === instanceName);
  if (!hit) return null;
  return { token: String(hit.token || hit.apiKey || ""), jid: hit.jid };
}

async function checkOne(baseUrl: string, instanceToken: string, phone: string): Promise<CheckResult> {
  const variants = brVariants(phone);
  try {
    const r = await fetch(`${baseUrl}/user/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instanceToken },
      body: JSON.stringify({ number: variants, formatJid: true }),
    });
    if (!r.ok) return { phone, exists: false, error: `HTTP ${r.status}` };
    const j = await r.json().catch(() => null);
    const users: any[] = j?.data?.Users || j?.data || j?.Users || [];
    // STRICT: only consider a hit when Evolution explicitly says IsInWhatsapp === true.
    // Evolution sometimes returns a JID even for invalid numbers (it just normalizes the
    // queried number); using JID as a fallback caused every number to appear valid.
    const hit = Array.isArray(users)
      ? users.find((u: any) => u?.IsInWhatsapp === true || u?.isInWhatsapp === true || u?.exists === true)
      : null;
    if (!hit) return { phone, exists: false };
    return { phone, exists: true, jid: String(hit.JID || hit.jid || "") || undefined };
  } catch (e) {
    return { phone, exists: false, error: (e as Error).message };
  }
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
      .select("base_url, api_key, instance_name")
      .eq("user_id", u.user.id)
      .maybeSingle();

    if (!s?.base_url || !s?.api_key || !s?.instance_name) {
      return new Response(JSON.stringify({
        error: "Configure a Evolution API (API Não Oficial) em Conexões para usar a validação real de WhatsApp.",
      }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const baseUrl = String(s.base_url).replace(/\/$/, "");
    const inst = await resolveInstance(baseUrl, s.api_key, s.instance_name);
    if (!inst?.token) {
      return new Response(JSON.stringify({
        error: `Instância "${s.instance_name}" não encontrada na Evolution. Reconecte em Conexões.`,
      }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const norm = Array.from(new Set(numbers.map(normalizeDigits).filter(Boolean)));

    // Run in parallel batches of 10 to avoid overloading Evolution.
    const results: CheckResult[] = [];
    const BATCH = 10;
    for (let i = 0; i < norm.length; i += BATCH) {
      const chunk = norm.slice(i, i + BATCH);
      const part = await Promise.all(chunk.map((n) => checkOne(baseUrl, inst.token, n)));
      results.push(...part);
    }

    const valid = results.filter((r) => r.exists).map((r) => r.phone);
    const invalid = results.filter((r) => !r.exists).map((r) => r.phone);

    return new Response(JSON.stringify({
      total: results.length,
      valid_count: valid.length,
      invalid_count: invalid.length,
      valid,
      invalid,
      results,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
