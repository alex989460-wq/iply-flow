/**
 * SuperGestor - Mini Proxy Sigma
 * ------------------------------------------------------------
 * Rode este arquivo no SEU computador (ou na sua VPS residencial).
 * Ele apenas repassa as chamadas do SuperGestor para o painel Sigma
 * usando o SEU IP, que é aceito pelo firewall do painel.
 *
 * Como usar:
 *   1) Instale o Node.js 18 ou superior (https://nodejs.org)
 *   2) Abra o terminal na pasta deste arquivo e rode:
 *        SIGMA_PROXY_SECRET="sua-chave-secreta" node server.js
 *      (no Windows PowerShell:
 *        $env:SIGMA_PROXY_SECRET="sua-chave-secreta"; node server.js )
 *   3) Deixe a janela aberta. Ele escuta na porta 8787.
 *   4) Exponha com um túnel gratuito, por exemplo:
 *        cloudflared tunnel --url http://localhost:8787
 *      Copie a URL https://... gerada.
 *   5) No SuperGestor, em Configurações → APIs → Painel Sigma,
 *      cole a URL do túnel e a mesma chave secreta.
 *
 * Nenhuma senha fica salva aqui: o proxy só repassa as requisições.
 */

const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const SECRET = String(process.env.SIGMA_PROXY_SECRET || "");
const MAX_BODY = 2 * 1024 * 1024; // 2 MB

if (!SECRET || SECRET.length < 12) {
  console.error("Defina SIGMA_PROXY_SECRET com pelo menos 12 caracteres antes de iniciar.");
  process.exit(1);
}

function send(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-sigma-proxy-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("corpo_muito_grande"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Só permite repassar chamadas de API do painel Sigma.
function isAllowedTarget(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (!parsed.pathname.startsWith("/api/")) return false;
  return true;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true });

  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, service: "sigma-proxy", version: "1.0.0" });
  }

  if (req.method !== "POST") return send(res, 405, { error: "metodo_nao_permitido" });

  const provided = String(req.headers["x-sigma-proxy-secret"] || "");
  if (provided !== SECRET) {
    console.warn("[sigma-proxy] chave secreta inválida");
    return send(res, 401, { error: "chave_invalida" });
  }

  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || "{}");
  } catch (err) {
    return send(res, 400, { error: "json_invalido", message: String(err && err.message) });
  }

  const target = String(payload.url || "");
  if (!isAllowedTarget(target)) {
    return send(res, 400, { error: "url_nao_permitida", message: "Apenas endpoints /api/ do painel Sigma são aceitos." });
  }

  const method = String(payload.method || "GET").toUpperCase();
  const headers = payload.headers && typeof payload.headers === "object" ? payload.headers : {};
  const body = typeof payload.body === "string" ? payload.body : undefined;

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      redirect: "follow",
    });
    const text = await upstream.text();
    console.log(`[sigma-proxy] ${method} ${target} -> ${upstream.status}`);
    return send(res, 200, { status: upstream.status, ok: upstream.ok, body: text });
  } catch (err) {
    console.error("[sigma-proxy] falha ao chamar o painel:", err && err.message);
    return send(res, 502, { error: "falha_no_painel", message: String(err && err.message) });
  }
});

server.listen(PORT, () => {
  console.log(`Mini Proxy Sigma ativo em http://localhost:${PORT}`);
  console.log("Agora exponha com: cloudflared tunnel --url http://localhost:" + PORT);
});
