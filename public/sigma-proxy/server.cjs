/**
 * SuperGestor - Mini Proxy Sigma
 * ------------------------------------------------------------
 * Repassa as chamadas do SuperGestor para o painel Sigma.
 *
 * Dois modos:
 *  1) DIRETO  - usa o IP da máquina onde o proxy roda (bom para IP residencial).
 *  2) BRIGHT DATA - quando BRIGHTDATA_WS está definido, a chamada sai pelo
 *     Scraping Browser da Bright Data, que resolve o Cloudflare do painel.
 *     Necessário na VPS (IP de datacenter é bloqueado pelo Cloudflare).
 *
 * Como usar (VPS / PC):
 *   npm i puppeteer-core            # só necessário no modo Bright Data
 *   SIGMA_PROXY_SECRET="sua-chave" \
 *   BRIGHTDATA_WS="wss://USER:PASS@brd.superproxy.io:9222" \
 *   node server.cjs
 *
 * Nenhuma senha do painel fica salva aqui: o proxy só repassa as requisições.
 */

const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const SECRET = String(process.env.SIGMA_PROXY_SECRET || "");
const BRIGHTDATA_WS = String(process.env.BRIGHTDATA_WS || "").trim();
const MAX_BODY = 2 * 1024 * 1024; // 2 MB

if (!SECRET || SECRET.length < 12) {
  console.error("Defina SIGMA_PROXY_SECRET com pelo menos 12 caracteres antes de iniciar.");
  process.exit(1);
}

let puppeteer = null;
if (BRIGHTDATA_WS) {
  try {
    puppeteer = require("puppeteer-core");
    console.log("[sigma-proxy] modo Bright Data ativo (Scraping Browser).");
  } catch {
    console.error("[sigma-proxy] BRIGHTDATA_WS definido mas 'puppeteer-core' não está instalado. Rode: npm i puppeteer-core");
    process.exit(1);
  }
} else {
  console.log("[sigma-proxy] modo direto (usa o IP desta máquina).");
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

// Só permite repassar chamadas http/https (a chave secreta já protege o proxy).
function isAllowedTarget(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

// Executa o fetch de dentro do navegador da Bright Data (passa pelo Cloudflare).
async function fetchViaBrightData(target, method, headers, body) {
  const browser = await puppeteer.connect({ browserWSEndpoint: BRIGHTDATA_WS });
  try {
    const page = await browser.newPage();
    const origin = new URL(target).origin;
    // Abre o domínio primeiro para resolver o desafio do Cloudflare e ganhar os cookies.
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 90000 });
    const result = await page.evaluate(
      async (url, method, headers, body) => {
        const res = await fetch(url, {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : body,
          credentials: "include",
        });
        return { status: res.status, body: await res.text() };
      },
      target,
      method,
      headers,
      body ?? null,
    );
    await page.close().catch(() => {});
    return result;
  } finally {
    await browser.close().catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true });

  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, {
      ok: true,
      service: "sigma-proxy",
      version: "1.1.0",
      mode: BRIGHTDATA_WS ? "brightdata" : "direct",
    });
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
    return send(res, 400, { error: "url_nao_permitida", message: "Informe uma URL http(s) válida do painel." });
  }

  const method = String(payload.method || "GET").toUpperCase();
  const headers = payload.headers && typeof payload.headers === "object" ? payload.headers : {};
  const body = typeof payload.body === "string" ? payload.body : undefined;

  try {
    if (BRIGHTDATA_WS) {
      const out = await fetchViaBrightData(target, method, headers, body);
      console.log(`[sigma-proxy/brd] ${method} ${target} -> ${out.status}`);
      return send(res, 200, { status: out.status, ok: out.status >= 200 && out.status < 300, body: out.body });
    }

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
});
