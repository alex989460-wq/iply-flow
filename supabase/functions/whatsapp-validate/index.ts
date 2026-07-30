// Valida a existência real de números no WhatsApp usando a Evolution (Baileys) do usuário.
// Suporta Evolution v2 (/instance/fetchInstances + /chat/whatsappNumbers/{instance})
// e Evolution Go (/instance/all + /user/check).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface CheckResult { phone: string; exists: boolean; jid?: string; error?: string }

function digitsOnly(s: string) { return String(s || "").replace(/\D/g, ""); }

function normalizeDigits(raw: string): string {
  const d = digitsOnly(raw);
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

// Números BR às vezes voltam sem o 9 (formato antigo).
function brVariants(phone: string): string[] {
  const set = new Set<string>([phone]);
  if (phone.startsWith("55") && phone.length === 13 && phone[4] === "9") {
    set.add("55" + phone.slice(2, 4) + phone.slice(5));
  }
  if (phone.startsWith("55") && phone.length === 12) {
    set.add("55" + phone.slice(2, 4) + "9" + phone.slice(4));
  }
  return [...set];
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: (e as Error).message } };
  } finally {
    clearTimeout(t);
  }
}

type Resolved = {
  mode: "v2" | "go";
  token: string;
  instanceId: string;
  name: string;
  status: string;
};

async function resolveInstance(baseUrl: string, apiKey: string, instanceName: string): Promise<Resolved | null> {
  const wanted = String(instanceName || "").trim().toLowerCase();

  // Evolution v2
  const v2 = await fetchJson(`${baseUrl}/instance/fetchInstances`, { headers: { apikey: apiKey } });
  if (v2.ok) {
    const rows: any[] = Array.isArray(v2.data) ? v2.data : Array.isArray(v2.data?.data) ? v2.data.data : [];
    const hit = rows.find((x) => String(x?.name || x?.instanceName || "").toLowerCase() === wanted)
      || rows.find((x) => String(x?.id || "").toLowerCase() === wanted)
      || (rows.length === 1 ? rows[0] : null);
    if (hit) {
      return {
        mode: "v2",
        token: String(hit.token || hit.hash || apiKey),
        instanceId: String(hit.id || ""),
        name: String(hit.name || hit.instanceName || instanceName),
        status: String(hit.connectionStatus || hit.status || ""),
      };
    }
  }

  // Evolution Go
  const go = await fetchJson(`${baseUrl}/instance/all`, { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } });
  if (go.ok) {
    const rows: any[] = Array.isArray(go.data?.data) ? go.data.data : Array.isArray(go.data) ? go.data : [];
    const hit = rows.find((x) => String(x?.name || x?.instanceName || "").toLowerCase() === wanted)
      || rows.find((x) => String(x?.id || "").toLowerCase() === wanted)
      || (rows.length === 1 ? rows[0] : null);
    if (hit) {
      return {
        mode: "go",
        token: String(hit.token || hit.hash || apiKey),
        instanceId: String(hit.id || hit.instanceId || ""),
        name: String(hit.name || hit.instanceName || instanceName),
        status: String(hit.connectionStatus || (hit.connected ? "open" : "")),
      };
    }
  }

  return null;
}

async function checkV2(baseUrl: string, inst: Resolved, phones: string[]): Promise<Map<string, CheckResult>> {
  const out = new Map<string, CheckResult>();
  const variantMap = new Map<string, string>(); // variante -> phone original
  const numbers: string[] = [];
  for (const p of phones) {
    for (const v of brVariants(p)) { variantMap.set(v, p); numbers.push(v); }
    out.set(p, { phone: p, exists: false });
  }

  const r = await fetchJson(`${baseUrl}/chat/whatsappNumbers/${encodeURIComponent(inst.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: inst.token },
    body: JSON.stringify({ numbers }),
  }, 30000);

  if (!r.ok) {
    const msg = r.data?.output?.payload?.message || r.data?.response?.message || r.data?.message || `HTTP ${r.status}`;
    throw new Error(String(msg));
  }

  const rows: any[] = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : [];
  for (const row of rows) {
    const exists = row?.exists === true || row?.numberExists === true;
    if (!exists) continue;
    const num = digitsOnly(String(row?.number || row?.jid || ""));
    const original = variantMap.get(num) || variantMap.get(digitsOnly(String(row?.number || "")));
    if (original) out.set(original, { phone: original, exists: true, jid: String(row?.jid || "") || undefined });
  }
  return out;
}

async function checkGoOne(baseUrl: string, inst: Resolved, phone: string): Promise<CheckResult> {
  const variants = brVariants(phone);
  const r = await fetchJson(`${baseUrl}/user/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: inst.token, instanceId: inst.instanceId },
    body: JSON.stringify({ number: variants, formatJid: true }),
  }, 20000);
  if (!r.ok) return { phone, exists: false, error: `HTTP ${r.status}` };
  const users: any[] = r.data?.data?.Users || r.data?.data || r.data?.Users || [];
  const hit = Array.isArray(users)
    ? users.find((u: any) => u?.IsInWhatsapp === true || u?.isInWhatsapp === true || u?.exists === true)
    : null;
  if (!hit) return { phone, exists: false };
  return { phone, exists: true, jid: String(hit.JID || hit.jid || "") || undefined };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { numbers = [] } = await req.json().catch(() => ({ numbers: [] }));
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return json({ error: "Informe ao menos um número." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Sessão expirada. Entre novamente." }, 401);

    const admin = createClient(supabaseUrl, service);
    let { data: s } = await admin
      .from("evolution_settings")
      .select("base_url, api_key, instance_name")
      .eq("user_id", u.user.id)
      .maybeSingle();

    // Fallback: revendedores (e admins sem chave própria) usam o servidor global configurado.
    if (!s?.base_url || !s?.api_key) {
      const { data: shared } = await admin
        .from("evolution_settings")
        .select("base_url, api_key, instance_name, user_id")
        .neq("base_url", "")
        .neq("api_key", "")
        .limit(5);
      const donor = (shared || [])[0];
      if (donor) {
        s = {
          base_url: s?.base_url || donor.base_url,
          api_key: s?.api_key || donor.api_key,
          instance_name: s?.instance_name || donor.instance_name,
        } as any;
      }
    }

    if (!s?.base_url || !s?.api_key) {
      return json({ error: "Configure a Evolution API (API Não Oficial) em Conexões para usar a validação real de WhatsApp." });
    }

    const baseUrl = String(s.base_url).replace(/\/$/, "");
    const inst = await resolveInstance(baseUrl, s.api_key, s.instance_name || "");
    if (!inst) {
      return json({
        error: `Instância "${s.instance_name || "(não definida)"}" não encontrada no servidor Evolution. Selecione uma instância em Conexões WhatsApp.`,
      });
    }
    if (inst.status && !["open", "connected", "logged"].includes(inst.status.toLowerCase())) {
      return json({
        error: `A instância "${inst.name}" não está conectada (status: ${inst.status}). Reconecte o QR Code em Conexões WhatsApp para validar números.`,
      });
    }

    const norm = Array.from(new Set(numbers.map(normalizeDigits).filter(Boolean)));
    const results: CheckResult[] = [];

    if (inst.mode === "v2") {
      const BATCH = 50;
      for (let i = 0; i < norm.length; i += BATCH) {
        const chunk = norm.slice(i, i + BATCH);
        const map = await checkV2(baseUrl, inst, chunk);
        results.push(...map.values());
      }
    } else {
      const BATCH = 10;
      for (let i = 0; i < norm.length; i += BATCH) {
        const chunk = norm.slice(i, i + BATCH);
        const part = await Promise.all(chunk.map((n) => checkGoOne(baseUrl, inst, n)));
        results.push(...part);
      }
    }

    const valid = results.filter((r) => r.exists).map((r) => r.phone);
    const invalid = results.filter((r) => !r.exists).map((r) => r.phone);

    return json({
      total: results.length,
      valid_count: valid.length,
      invalid_count: invalid.length,
      instance: inst.name,
      valid,
      invalid,
      results,
    });
  } catch (e) {
    return json({ error: (e as Error).message || "Falha ao validar números." });
  }
});
