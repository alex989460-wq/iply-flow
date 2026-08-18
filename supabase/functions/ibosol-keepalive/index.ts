// Mantém o Bearer token da IBO Sol ativo pingando /check-token a cada execução.
// Deve ser agendado via pg_cron a cada 3 minutos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const API_BASE = "https://backend-apis.ibosol.com/api";

async function pingIbosol(token: string) {
  // Usa o MESMO endpoint que a ativação usa (check-device-status) — é o único
  // que reflete de verdade se o Bearer ainda é aceito. Endpoints GET soltos
  // podem devolver 404 (mascarando o 401 real) ou nem exigir auth.
  try {
    const r = await fetch(`${API_BASE}/check-device-status`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json-patch+json",
        Accept: "application/json",
        Origin: "https://ibosol.com",
        Referer: "https://ibosol.com/check-mac",
        Authorization: `Bearer ${token}`,
      },
      // MAC dummy só pra validar o token; a resposta em si não importa
      body: JSON.stringify({ macAddress: "00:00:00:00:00:00", app_id: 3 }),
    });
    const status = r.status;
    await r.body?.cancel();
    if (status === 401 || status === 403) {
      return { alive: false, expired: true, status, endpoint: "/check-device-status" };
    }
    // Qualquer 2xx/4xx (que não seja 401/403) significa que o token foi aceito
    if (status >= 200 && status < 500) {
      return { alive: true, expired: false, status, endpoint: "/check-device-status" };
    }
    return { alive: false, expired: false, status, endpoint: "/check-device-status", error: `HTTP ${status}` };
  } catch (e) {
    return { alive: false, expired: false, status: 0, endpoint: null, error: (e as Error).message };
  }
}

async function tryRelogin(userId: string, email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ibosol-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ user_id: userId, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { ok: false, error: String(data?.error || `HTTP ${res.status}`) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

serve(async (req) => {

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const jh = { ...cors, "Content-Type": "application/json" };
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: creds } = await admin
      .from("activation_panel_credentials")
      .select("user_id, password, is_enabled, extra")
      .eq("panel_type", "ibosol")
      .eq("is_enabled", true);

    const results: any[] = [];
    for (const c of creds || []) {
      const token = String((c as any).password || "").trim();
      const extra = ((c as any).extra || {}) as Record<string, any>;
      if (!token && !extra.email) { results.push({ user_id: c.user_id, ok: false, error: "sem token" }); continue; }
      let r = token
        ? await pingIbosol(token)
        : { alive: false, expired: true, status: 401, endpoint: null as string | null };

      // Auto-relogin: se o revendedor salvou e-mail/senha, renova o token pelo agente
      // de navegador (SeleniumBase) em vez de abrir pendência manual.
      let relogin: "ok" | "failed" | null = null;
      let reloginError: string | null = null;
      if (r.expired && extra.auto_login && extra.email && extra.login_password) {
        const login = await tryRelogin(c.user_id, String(extra.email), String(extra.login_password));
        if (login.ok) {
          const { data: refreshed } = await admin
            .from("activation_panel_credentials")
            .select("password")
            .eq("user_id", c.user_id)
            .eq("panel_type", "ibosol")
            .maybeSingle();
          const refreshedToken = String(refreshed?.password || "").trim();
          r = refreshedToken
            ? await pingIbosol(refreshedToken)
            : { alive: false, expired: true, status: 401, endpoint: null, error: "Sessão não retornada pelo login" };
          relogin = r.alive ? "ok" : "failed";
          if (!r.alive) reloginError = "O login foi concluído, mas a nova conexão não foi aceita pelo painel.";
        } else {
          relogin = "failed";
          reloginError = login.error || "Falha desconhecida no login automático.";
        }
      }

      results.push({ user_id: c.user_id, ok: r.alive, expired: r.expired, status: r.status, endpoint: r.endpoint, relogin });

      if (r.alive) {
        await admin
          .from("pending_manual_renewals")
          .delete()
          .eq("owner_id", c.user_id)
          .eq("reason", "ibosol_session_expired");
      }

      if (r.expired) {
        const { data: existing } = await admin
          .from("pending_manual_renewals")
          .select("id")
          .eq("owner_id", c.user_id)
          .eq("reason", "ibosol_session_expired")
          .limit(1);
        if (!existing || existing.length === 0) {
          await admin.from("pending_manual_renewals").insert({
            owner_id: c.user_id,
            customer_name: "⚠️ Conexão automática do IBO Sol indisponível",
            reason: "ibosol_session_expired",
            source: "ibosol-keepalive",
            error_details: {
              message: relogin === "failed"
                ? `Não foi possível reconectar o IBO Sol com o e-mail e a senha salvos: ${reloginError || "verifique as credenciais e tente novamente."}`
                : "Configure e-mail e senha em Ativação de Apps → IBO Sol para habilitar a reconexão automática.",
              status: r.status,
            },
          });
        }
      }
    }

    return new Response(JSON.stringify({ pinged: results.length, results }), { headers: jh });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: jh });
  }
});
