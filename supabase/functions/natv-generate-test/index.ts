// Gera usuário de TESTE no painel NATV (API Revenda NATV - POST /user).
// Doc: https://revenda.pixbot.link/openapi.json
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const normalizeBase = (u: string) => (u || "").trim().replace(/\/+$/, "");

const ALLOWED_MINUTES = ["15", "30", "60", "120", "180", "240", "300", "360"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const serverId: string | undefined = body?.serverId;
    const rawUsername: string = String(body?.username || "").trim();
    const minutes = ALLOWED_MINUTES.includes(String(body?.minutes)) ? String(body.minutes) : "60";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let apiKey = "";
    let baseUrl = "";
    let variant: "natv" | "natv2" = "natv";

    if (serverId) {
      const { data: srv } = await admin
        .from("vplay_servers")
        .select("id, user_id, server_type, api_key, integration_url, test_minutes")
        .eq("id", serverId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!srv) {
        return new Response(JSON.stringify({ error: "Servidor não encontrado" }), { status: 404, headers: jsonHeaders });
      }
      variant = srv.server_type === "natv2" ? "natv2" : "natv";
      if (srv.api_key) apiKey = srv.api_key;
      if (srv.integration_url) baseUrl = normalizeBase(srv.integration_url);
    }

    // Fallback: credenciais NATV do próprio revendedor
    if (!apiKey || !baseUrl) {
      const { data: settings } = await admin
        .from("reseller_api_settings")
        .select("natv_api_key, natv_base_url, natv2_api_key, natv2_base_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (variant === "natv2") {
        apiKey = apiKey || settings?.natv2_api_key || "";
        baseUrl = baseUrl || normalizeBase(settings?.natv2_base_url || "");
      } else {
        apiKey = apiKey || settings?.natv_api_key || "";
        baseUrl = baseUrl || normalizeBase(settings?.natv_base_url || "");
      }
    }

    if (!apiKey || !baseUrl) {
      return new Response(
        JSON.stringify({ error: "Configure a chave e a URL da API NATV (Configurações > APIs Externas)." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // NATV exige username entre 8 e 48 caracteres (ou nada, gerando aleatório).
    let username: string | null = rawUsername ? rawUsername.replace(/[^a-zA-Z0-9._-]/g, "") : null;
    if (username && (username.length < 8 || username.length > 48)) username = null;

    const bases = new Set<string>([baseUrl]);
    bases.add(baseUrl.endsWith("/api") ? baseUrl.replace(/\/api$/, "") : `${baseUrl}/api`);

    let lastError: unknown = null;
    for (const b of bases) {
      const endpoint = `${normalizeBase(b)}/user`;
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(username ? { username, minutes } : { minutes }),
        });
        const text = await resp.text();
        let result: any;
        try { result = JSON.parse(text); } catch { result = { raw: text }; }

        if (resp.ok && result?.username) {
          const expDate = result.exp_date ? new Date(result.exp_date * 1000) : null;
          const expTxt = expDate
            ? expDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
            : `${minutes} min`;

          // Monta os links de lista (M3U / HLS) a partir do domínio retornado
          const rawDomain = String(result.domain || result.server || "").trim();
          let host = rawDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
          const scheme = /^https:\/\//i.test(rawDomain) ? "https" : "http";
          const enc = encodeURIComponent;
          const m3uLink = host
            ? `${scheme}://${host}/get.php?username=${enc(result.username)}&password=${enc(result.password)}&type=m3u_plus&output=ts`
            : "";
          const hlsLink = host
            ? `${scheme}://${host}/get.php?username=${enc(result.username)}&password=${enc(result.password)}&type=m3u_plus&output=hls`
            : "";

          const message =
            `🎬 *TESTE GERADO*\n\n` +
            `👤 Usuário: ${result.username}\n` +
            `🔑 Senha: ${result.password}\n` +
            (host ? `🌐 Servidor: ${scheme}://${host}\n` : "") +
            `📺 Telas: ${result.max_connections ?? 1}\n` +
            `⏰ Expira: ${expTxt}\n\n` +
            (m3uLink ? `*Link (M3U)* 👉 ${m3uLink}\n\n` : "") +
            (hlsLink ? `*Link (HLS)* 👉 ${hlsLink}` : "");
          return new Response(
            JSON.stringify({ success: true, message, m3u: m3uLink, hls: hlsLink, user: result }),
            { headers: jsonHeaders },
          );
        }

        lastError = result?.detail || result?.raw || `HTTP ${resp.status}`;
        if (resp.status !== 404 && resp.status !== 405) break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "erro de rede";
      }
    }

    return new Response(
      JSON.stringify({ error: `Falha ao gerar teste no NATV: ${typeof lastError === "string" ? lastError : JSON.stringify(lastError)}` }),
      { status: 502, headers: jsonHeaders },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[natv-generate-test]", err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
