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

const browserHeaders = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  "locale": "pt",
  "x-app-version": "3.89",
};

type Proxy = { url: string; secret: string } | null;

function buildProxy(url?: string | null, secret?: string | null): Proxy {
  const u = String(url || "").trim().replace(/\/+$/, "");
  const s = String(secret || "").trim();
  
  if (u && s) return { url: /^https?:\/\//i.test(u) ? u : `https://${u}`, secret: s };
  
  // Se não tem proxy individual, não tentamos injetar o global aqui automaticamente no buildProxy,
  // pois o sigmaLogin agora tem lógica de fallback explícita que usa as env vars.
  // Isso evita que o buildProxy retorne um objeto incompleto se o segredo vier de env mas a URL não.
  
  return null;
}

type RelayResponse = { ok: boolean; status: number; text: string };

// Todas as chamadas ao painel passam por aqui. Quando o revendedor configurou o
// mini proxy próprio, a requisição sai do IP dele (aceito pelo firewall do Sigma).
async function relay(target: string, init: RequestInit, proxy: Proxy): Promise<RelayResponse> {
  if (!proxy) {
    const res = await fetch(target, init);
    return { ok: res.ok, status: res.status, text: await res.text() };
  }

  const headers: Record<string, string> = {};
  const rawHeaders = (init.headers || {}) as Record<string, string>;
  for (const [key, value] of Object.entries(rawHeaders)) headers[key] = String(value);

  let res: Response;
  try {
    res = await fetch(proxy.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
      body: JSON.stringify({
        url: target,
        method: init.method || "GET",
        headers,
        body: typeof init.body === "string" ? init.body : undefined,
      }),
    });
  } catch (err) {
    throw new Error(`Não foi possível falar com o seu proxy Sigma (${proxy.url}). Verifique se ele está ligado. Detalhe: ${err instanceof Error ? err.message : String(err)}`);
  }

  const payload = await res.json().catch(() => null) as any;
  if (res.status === 401) throw new Error("A chave do proxy Sigma está incorreta. Confira a chave secreta usada ao iniciar o proxy.");
  if (!res.ok || !payload || typeof payload.status !== "number") {
    throw new Error(`O proxy Sigma respondeu com erro: ${payload?.message || payload?.error || `HTTP ${res.status}`}`);
  }
  return { ok: payload.status >= 200 && payload.status < 300, status: payload.status, text: String(payload.body ?? "") };
}

async function discoverSigmaApiBase(base: string, proxy: Proxy): Promise<string | null> {
  try {
    const response = await relay(`${base}/api/settings/public`, { headers: browserHeaders }, proxy);
    if (!response.ok) return null;
    const body = JSON.parse(response.text || "{}");
    const settings = Array.isArray(body?.data) ? body.data : [];
    const panelHost = String(settings.find((item: any) => item?.variable === "panel_url")?.value || "").trim();
    if (!panelHost) return null;
    const discovered = normBase(panelHost);
    return discovered && discovered !== base ? discovered : null;
  } catch {
    return null;
  }
}

function preferredSigmaApiBase(base: string, discovered: string | null): string {
  // O host informado pelo revendedor muitas vezes é apenas o site do painel (nginx),
  // enquanto a API fica em outro host publicado em /api/settings/public (panel_url).
  // Por isso, quando existir um host descoberto, ele tem prioridade.
  return discovered || base;
}

async function sigmaLogin(base: string, username: string, password: string, proxy: Proxy) {
  const discoveredBase = await discoverSigmaApiBase(base, proxy);
  const preferredBase = preferredSigmaApiBase(base, discoveredBase);
  const candidates = [preferredBase, base, discoveredBase].filter((value, index, all): value is string => !!value && all.indexOf(value) === index);
  let lastStatus = 0;
  let lastMessage = "";
  let lastPreview = "";
  let lastError: any = null;


  for (const apiBase of candidates) {
    console.log(`[Sigma] Tentando login em: ${apiBase} (Proxy: ${proxy ? "Sim" : "Não"})`);
    try {
      const res = await relay(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { ...browserHeaders, "Content-Type": "application/json", "Origin": apiBase, "Referer": `${apiBase}/` },
        body: JSON.stringify({
          username,
          password,
          captcha: "not-a-robot",
          captchaChecked: true,
          twofactor_code: "",
          twofactor_recovery_code: "",
          twofactor_trusted_device_id: "",
        }),
      }, proxy);
      
      lastStatus = res.status;
      let body: any = {};
      try { body = res.text ? JSON.parse(res.text) : {}; } catch { body = {}; }
      
      if (res.ok && body?.token) {
        console.log(`[Sigma] Login OK em ${apiBase}`);
        return { token: String(body.token), me: body, apiBase };
      }

      lastMessage = body?.message || body?.error || body?.errors?.username?.[0] || body?.errors?.password?.[0] || "";
      lastPreview = String(res.text || "").replace(/\s+/g, " ").slice(0, 300);
      console.log(`[Sigma] Erro login ${apiBase} -> Status: ${res.status} | Resposta: ${lastPreview}`);

      // 404 = host errado (nginx padrão): seguimos testando os outros candidatos.
      // 403/503 = bloqueio real de WAF: não adianta insistir sem proxy.
      if (!proxy && (res.status === 403 || res.status === 503)) {
        console.log(`[Sigma] Bloqueio de WAF (${res.status}) em ${apiBase} sem proxy.`);
        break;
      }
    } catch (err) {
      lastError = err;
      console.log(`[Sigma] Erro de rede/proxy em ${apiBase}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // Se falhou sem proxy em todos os candidatos (ou interrompeu por bloqueio), tentamos usar o Proxy Residencial Global como última esperança se ele existir
  const globalProxyUrl = Deno.env.get("SIGMA_RESIDENTIAL_PROXY");
  const globalProxySecret = Deno.env.get("SIGMA_PROXY_SECRET");
  
  if (!proxy && globalProxyUrl && globalProxySecret) {
    const fallbackProxy = { url: globalProxyUrl, secret: globalProxySecret };
    console.log(`[Sigma] Iniciando fallback para Proxy Residencial Global...`);
    
    for (const apiBase of candidates) {
      try {
        const res = await relay(`${apiBase}/api/auth/login`, {
          method: "POST",
          headers: { ...browserHeaders, "Content-Type": "application/json", "Origin": apiBase, "Referer": `${apiBase}/` },
          body: JSON.stringify({ username, password, captcha: "not-a-robot", captchaChecked: true }),
        }, fallbackProxy);
        
        let body: any = {};
        try { body = res.text ? JSON.parse(res.text) : {}; } catch { body = {}; }
        
        if (res.ok && body?.token) {
          console.log(`[Sigma] Login OK em ${apiBase} via Proxy Global`);
          return { token: String(body.token), me: body, apiBase };
        }
      } catch (e) {
        console.log(`[Sigma] Erro no fallback proxy para ${apiBase}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  if (lastStatus === 404) {
    throw new Error(`O endereço do painel Sigma parece incorreto (o servidor respondeu "404 Não encontrado" em ${candidates.join(", ")}). Confira a URL exata usada para acessar o painel no navegador.`);
  }

  if (!proxy && (lastStatus === 403 || lastStatus === 503)) {
    throw new Error("O painel Sigma bloqueou a conexão (firewall/WAF). Ative o seu próprio Proxy Sigma ou use uma conexão direta (IP fixo liberado no painel).");
  }


  throw new Error(lastMessage
    ? `Painel Sigma recusou o login: ${lastMessage}`
    : `Não foi possível autenticar no Painel Sigma (HTTP ${lastStatus || "sem resposta"}). Resposta: ${lastPreview || "vazia"}`);
}

async function sigmaFetch(base: string, token: string, path: string, init: RequestInit = {}, proxy: Proxy = null) {
  const res = await relay(`${base}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      ...browserHeaders,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  }, proxy);
  let body: any = null;
  try { body = res.text ? JSON.parse(res.text) : null; } catch { body = { raw: res.text }; }
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
      .select("sigma_base_url, sigma_username, sigma_password, sigma_proxy_url, sigma_proxy_secret")
      .eq("user_id", ownerId)
      .maybeSingle();

    let connectionId = String(body.connection_id || "").trim();
    if (!connectionId && body.customer_id) {
      const { data: customer } = await admin.from("customers").select("server_id").eq("id", String(body.customer_id)).eq("created_by", ownerId).maybeSingle();
      if (customer?.server_id) {
        const { data: server } = await admin.from("servers").select("sigma_connection_id").eq("id", customer.server_id).eq("created_by", ownerId).maybeSingle();
        connectionId = String(server?.sigma_connection_id || "");
      }
    }
    const { data: connection } = connectionId
      ? await admin.from("sigma_panel_connections").select("base_url, username, password, proxy_url, proxy_secret").eq("id", connectionId).eq("user_id", ownerId).eq("is_active", true).maybeSingle()
      : { data: null };

    const base = normBase(action === "test" ? (body.sigma_base_url || connection?.base_url || (cfg as any)?.sigma_base_url || "") : (connection?.base_url || (cfg as any)?.sigma_base_url || ""));
    const user = String(action === "test" ? (body.sigma_username || connection?.username || (cfg as any)?.sigma_username || "") : (connection?.username || (cfg as any)?.sigma_username || "")).trim();
    const pass = String(action === "test" ? (body.sigma_password || connection?.password || (cfg as any)?.sigma_password || "") : (connection?.password || (cfg as any)?.sigma_password || ""));
    if (!base || !user || !pass) {
      return json({ error: "Credenciais do Painel Sigma não configuradas. Preencha URL, usuário e senha em Configurações → APIs." }, 400);
    }

    const proxy = buildProxy(
      action === "test" ? (body.sigma_proxy_url || (connection as any)?.proxy_url || (cfg as any)?.sigma_proxy_url) : ((connection as any)?.proxy_url || (cfg as any)?.sigma_proxy_url),
      action === "test" ? (body.sigma_proxy_secret || (connection as any)?.proxy_secret || (cfg as any)?.sigma_proxy_secret) : ((connection as any)?.proxy_secret || (cfg as any)?.sigma_proxy_secret),
    );

    const { token, me, apiBase } = await sigmaLogin(base, user, pass, proxy);


  // Busca robusta do cliente no Sigma: tenta múltiplos parâmetros de pesquisa e,
  // em último caso, pagina a lista completa procurando o usuário exato.
  const findSigmaCustomer = async (apiBase: string, token: string, username: string, proxy: any) => {
    const uname = username.toLowerCase();
    const pick = (body: any) => {
      const list = Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []);
      return list.find((c: any) => String(c.username || "").toLowerCase() === uname) || null;
    };
    const queries = [
      `/api/customers?page=1&username=${encodeURIComponent(username)}`,
      `/api/customers?page=1&search=${encodeURIComponent(username)}`,
      `/api/customers?page=1&filter[username]=${encodeURIComponent(username)}`,
      `/api/customers?page=1&query=${encodeURIComponent(username)}`,
      `/api/customers?page=1&keyword=${encodeURIComponent(username)}`,
    ];
    for (const q of queries) {
      try {
        const r = await sigmaFetch(apiBase, token, q, {}, proxy);
        const hit = pick(r.body);
        if (hit) return hit;
      } catch (_e) { /* tenta o próximo formato */ }
    }
    // fallback: varre as páginas (limite de segurança)
    for (let page = 1; page <= 25; page++) {
      try {
        const r = await sigmaFetch(apiBase, token, `/api/customers?page=${page}&per_page=100`, {}, proxy);
        const hit = pick(r.body);
        if (hit) return hit;
        const list = Array.isArray(r.body?.data) ? r.body.data : [];
        if (list.length === 0) break;
      } catch (_e) { break; }
    }
    return null;
  };

    // ---- servidores/pacotes ----
    const loadServers = async () => {
      const r = await sigmaFetch(apiBase, token, "/api/servers", {}, proxy);

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
        panel_url: me?.panel_url || apiBase,
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

      const created = await sigmaFetch(apiBase, token, "/api/customers", {
        method: "POST",
        body: JSON.stringify({
          server_id: server.id,
          package_id: pkgId,
          trial_hours: hours,
          connections: Number(body.connections || 1),
        }),
      }, proxy);
      if (!created.ok) {
        return json({ error: `Falha ao gerar teste no Sigma: ${created.body?.message || created.status}` }, 400);
      }
      const c = created.body?.data || created.body;

      // Lista/template (idioma pt quando disponível)
      let playlist = "";
      try {
        const pl = await sigmaFetch(apiBase, token, `/api/customers/${c.id}/playlist`, {}, proxy);

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

    // ---- consulta (debug/verificação) ----
    if (action === "lookup") {
      const username = String(body.username || "").trim();
      if (!username) return json({ error: "Informe o usuário a consultar." }, 400);
      const found = await findSigmaCustomer(apiBase, token, username, proxy);
      if (!found) return json({ ok: false, found: false, error: `Usuário "${username}" não encontrado no Painel Sigma.` }, 200);
      return json({ ok: true, found: true, customer: { id: found.id, username: found.username, server_id: found.server_id, package_id: found.package_id, expires_at: found.expires_at, status: found.status } });
    }

    // ---- renovar ----
    if (action === "renew") {
      const username = String(body.username || "").trim();
      if (!username) return json({ error: "Informe o usuário a ser renovado." }, 400);
      const months = Math.max(1, Number(body.months || 1));
      const connections = Number(body.connections || 1);

      // Tenta API direta primeiro (com proxy se houver)
      let customer = null;
      let apiError = null;
      try {
        customer = await findSigmaCustomer(apiBase, token, username, proxy);
      } catch (err) {
        apiError = err instanceof Error ? err.message : String(err);
      }

      // Se falhou por WAF/bloqueio, tenta via Ponte Sigma se disponível
      const useBridge = !customer && (apiError?.includes("firewall") || apiError?.includes("403") || apiError?.includes("bloqueou"));
      
      if (useBridge && connectionId) {
        const { data: conn } = await admin.from("sigma_panel_connections").select("bridge_token, last_bridge_seen_at").eq("id", connectionId).maybeSingle();
        const bridgeOnline = conn?.bridge_token && conn.last_bridge_seen_at && (new Date().getTime() - new Date(conn.last_bridge_seen_at).getTime() < 60000);
        
        if (bridgeOnline) {
          // Cria tarefa na fila para a ponte
          const { data: job, error: jobErr } = await admin.from("sigma_bridge_jobs").insert({
            user_id: ownerId,
            sigma_connection_id: connectionId,
            action: "renew_customer",
            payload: { username, months, connections }
          }).select().single();

          if (jobErr) throw new Error("Falha ao encaminhar renovação para a ponte.");

          // Aguarda o resultado (long polling simulado curto)
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1500));
            const { data: updatedJob } = await admin.from("sigma_bridge_jobs").select("*").eq("id", job.id).single();
            if (updatedJob.status === "completed") {
              const d = updatedJob.response_payload;
              return json({
                ok: true,
                username: d?.username || username,
                expires_at: d?.expires_at || null,
                package: d?.package || null,
                via_bridge: true
              });
            }
            if (updatedJob.status === "failed") {
              throw new Error(updatedJob.error_message || "A ponte Sigma falhou ao renovar.");
            }
          }
          throw new Error("A ponte Sigma está demorando muito. Verifique se a aba do painel está aberta e ativa.");
        }
      }

      if (!customer) {
        throw new Error(apiError || `Usuário "${username}" não encontrado no Painel Sigma.`);
      }

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

      const renewed = await sigmaFetch(apiBase, token, `/api/customers/${customer.id}/renew`, {
        method: "POST",
        body: JSON.stringify({
          package_id: packageId,
          connections: connections || customer.connections || 1,
          reference: "",
          create_manual_customer_order: false,
          manual_payment_total: null,
        }),
      }, proxy);

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
