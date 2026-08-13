// Integração com Painéis Sigma (ex.: https://painel.newbr.top)
// Ações:
//   { action: "test" }                                    -> valida credenciais e lista servidores/pacotes
//   { action: "servers" }                                 -> lista servidores + pacotes (normal e teste)
//   { action: "trial", server_id, package_id?, hours? }   -> gera teste e devolve usuário/senha/lista
//   { action: "renew", username, months?, package_id?, connections? } -> renova cliente
//
// Credenciais por revendedor em reseller_api_settings (sigma_base_url/username/password).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function normBase(u: string) {
  let s = String(u || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/api$/i, "");
}

async function sigmaLogin(base: string, username: string, password: string) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      username,
      password,
      captcha: "not-a-robot",
      captchaChecked: true,
      twofactor_code: "",
      twofactor_recovery_code: "",
      twofactor_trusted_device_id: "",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.token) {
    throw new Error(
      body?.message
        ? `Painel Sigma recusou o login: ${body.message}`
        : "Não foi possível autenticar no Painel Sigma. Confira URL, usuário e senha.",
    );
  }
  return { token: String(body.token), me: body };
}

async function sigmaFetch(base: string, token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

function pkgDurationDays(p: any): number {
  const d = Number(p?.duration || 0);
  const unit = String(p?.duration_in || "").toUpperCase();
  if (unit === "HOURS") return d / 24;
  if (unit === "MONTHS") return d * 30;
  if (unit === "YEARS") return d * 365;
  return d; // DAYS
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action || "renew");

    // ---- identifica o revendedor ----
    let ownerId = String(body.owner_id || "");
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user?.id) ownerId = userData.user.id;
    }
    if (!ownerId) return json({ error: "Não foi possível identificar o revendedor (faça login novamente)." }, 401);

    const { data: cfg } = await admin
      .from("reseller_api_settings")
      .select("sigma_base_url, sigma_username, sigma_password")
      .eq("user_id", ownerId)
      .maybeSingle();

    const base = normBase((cfg as any)?.sigma_base_url || "");
    const user = String((cfg as any)?.sigma_username || "").trim();
    const pass = String((cfg as any)?.sigma_password || "");
    if (!base || !user || !pass) {
      return json({ error: "Credenciais do Painel Sigma não configuradas. Preencha URL, usuário e senha em Configurações → APIs." }, 400);
    }

    const { token, me } = await sigmaLogin(base, user, pass);

    // ---- servidores/pacotes ----
    const loadServers = async () => {
      const r = await sigmaFetch(base, token, "/api/servers");
      const list = Array.isArray(r.body?.data) ? r.body.data : [];
      return list.map((s: any) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        connection_type: s.connection_type,
        packages: (s.packages || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          is_trial: String(p.is_trial || "NO").toUpperCase() === "YES",
          duration: p.duration,
          duration_in: p.duration_in,
          duration_days: pkgDurationDays(p),
          credits: p.credits,
          plan_price: p.plan_price,
        })),
      }));
    };

    if (action === "test" || action === "servers") {
      const servers = await loadServers();
      return json({
        ok: true,
        panel_url: me?.panel_url || base,
        username: me?.username || user,
        credits: me?.credits ?? null,
        servers,
      });
    }

    // ---- gerar teste ----
    if (action === "trial") {
      const servers = await loadServers();
      const serverId = String(body.server_id || servers[0]?.id || "");
      const server = servers.find((s: any) => s.id === serverId) || servers[0];
      if (!server) return json({ error: "Nenhum servidor disponível no Painel Sigma." }, 400);

      const trialPkgs = server.packages.filter((p: any) => p.is_trial);
      const pkgId = String(body.package_id || trialPkgs[0]?.id || "");
      if (!pkgId) return json({ error: "Nenhum pacote de teste configurado nesse servidor do Sigma." }, 400);
      const pkg = server.packages.find((p: any) => p.id === pkgId);
      const hours = Number(body.hours || pkg?.duration || 4);

      const created = await sigmaFetch(base, token, "/api/customers", {
        method: "POST",
        body: JSON.stringify({
          server_id: server.id,
          package_id: pkgId,
          trial_hours: hours,
          connections: Number(body.connections || 1),
        }),
      });
      if (!created.ok) {
        return json({ error: `Falha ao gerar teste no Sigma: ${created.body?.message || created.status}` }, 400);
      }
      const c = created.body?.data || created.body;

      // Lista/template (idioma pt quando disponível)
      let playlist = "";
      try {
        const pl = await sigmaFetch(base, token, `/api/customers/${c.id}/playlist`);
        const arr = Array.isArray(pl.body) ? pl.body : [];
        playlist = String(arr.find((x: any) => x.key === "pt")?.template || arr[0]?.template || "");
      } catch { /* opcional */ }

      return json({
        ok: true,
        id: c?.id,
        username: c?.username,
        password: c?.password,
        expires_at: c?.expires_at,
        server: c?.server || server.name,
        package: c?.package,
        playlist,
      });
    }

    // ---- renovar ----
    if (action === "renew") {
      const username = String(body.username || "").trim();
      if (!username) return json({ error: "Informe o usuário a ser renovado." }, 400);
      const months = Math.max(1, Number(body.months || 1));
      const connections = Number(body.connections || 1);

      const found = await sigmaFetch(
        base,
        token,
        `/api/customers?page=1&username=${encodeURIComponent(username)}`,
      );
      const list = Array.isArray(found.body?.data) ? found.body.data : [];
      const customer = list.find(
        (c: any) => String(c.username || "").toLowerCase() === username.toLowerCase(),
      ) || list[0];
      if (!customer) return json({ error: `Usuário "${username}" não encontrado no Painel Sigma.` }, 404);

      // escolhe pacote: o informado, ou o pacote atual, ou o que casa com a duração
      let packageId = String(body.package_id || "");
      if (!packageId) {
        const servers = await loadServers();
        const server = servers.find((s: any) => s.id === customer.server_id);
        const candidates = (server?.packages || []).filter((p: any) => !p.is_trial);
        const wantDays = months * 30;
        const exact = candidates.find((p: any) => Math.abs(p.duration_days - wantDays) <= 2);
        packageId = String(exact?.id || customer.package_id || candidates[0]?.id || "");
      }
      if (!packageId) return json({ error: "Nenhum pacote de renovação encontrado no Sigma para esse cliente." }, 400);

      const renewed = await sigmaFetch(base, token, `/api/customers/${customer.id}/renew`, {
        method: "POST",
        body: JSON.stringify({
          package_id: packageId,
          connections: connections || customer.connections || 1,
          reference: "",
          create_manual_customer_order: false,
          manual_payment_total: null,
        }),
      });
      if (!renewed.ok) {
        return json({ error: `Falha ao renovar no Sigma: ${renewed.body?.message || renewed.status}` }, 400);
      }
      const d = renewed.body?.data || renewed.body;
      return json({
        ok: true,
        username: d?.username || customer.username,
        expires_at: d?.expires_at || null,
        package: d?.package || null,
      });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (err) {
    console.error("[sigma-renew]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
