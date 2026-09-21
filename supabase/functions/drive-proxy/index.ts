// Proxy simples para a API do Google Drive usando a conexão do connector gateway.
// O ZapCRM (hospedado na VPS) não tem a chave da conexão; ele chama esta função
// com um segredo compartilhado e repassamos a requisição ao gateway da Lovable.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-drive-proxy-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const secret = Deno.env.get("DRIVE_PROXY_SECRET");
  const sent = req.headers.get("x-drive-proxy-secret") || "";
  if (!secret || sent !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const lovable = Deno.env.get("LOVABLE_API_KEY");
  const connKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lovable || !connKey) {
    return new Response(JSON.stringify({ error: "google_drive_not_configured" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("drive-proxy");
  const rest = (idx >= 0 ? parts.slice(idx + 1) : parts).join("/");
  const target = `${GATEWAY}/${rest}${url.search}`;

  const upstream = await fetch(target, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": connKey,
      ...(req.headers.get("content-type") ? { "Content-Type": req.headers.get("content-type")! } : {}),
    },
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
  });

  const headers = new Headers(cors);
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  return new Response(upstream.body, { status: upstream.status, headers });
});
