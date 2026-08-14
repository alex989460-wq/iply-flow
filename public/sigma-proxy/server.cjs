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

// Caminho do Chrome/Chromium instalado nesta máquina (modo navegador local).
const CHROME_PATH = String(process.env.CHROME_PATH || "").trim() ||
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]
    .find((p) => { try { return require("fs").existsSync(p); } catch { return false; } }) || "";

let puppeteer = null;
try {
  puppeteer = require("puppeteer-core");
} catch {
  puppeteer = null;
}

if (BRIGHTDATA_WS) {
  if (!puppeteer) {
    console.error("[sigma-proxy] BRIGHTDATA_WS definido mas 'puppeteer-core' não está instalado. Rode: npm i puppeteer-core");
    process.exit(1);
  }
  console.log("[sigma-proxy] modo Bright Data ativo (Scraping Browser).");
} else if (puppeteer && CHROME_PATH) {
  console.log(`[sigma-proxy] modo direto + navegador local (${CHROME_PATH}).`);
} else {
  console.log("[sigma-proxy] modo direto (usa o IP desta máquina, sem navegador).");
}

const browserAvailable = Boolean(puppeteer && (BRIGHTDATA_WS || CHROME_PATH));

// Abre o navegador: Bright Data quando configurado, senão o Chrome local da VPS.
async function openBrowser() {
  if (BRIGHTDATA_WS) {
    return { browser: await puppeteer.connect({ browserWSEndpoint: BRIGHTDATA_WS }), remote: true };
  }
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1366,768",
      "--lang=pt-BR",
    ],
  });
  return { browser, remote: false };
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
  const { browser } = await openBrowser();
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

// ---------------------------------------------------------------------------
// Resolução de CAPTCHA no navegador local usando 2Captcha / Anti-Captcha.
// Basta definir CAPTCHA_API_KEY (2captcha.com) na VPS. Custo ~US$0,001 por login.
// ---------------------------------------------------------------------------
const CAPTCHA_KEY = String(process.env.CAPTCHA_API_KEY || "").trim();
const CAPTCHA_API = String(process.env.CAPTCHA_API_URL || "https://api.2captcha.com").replace(/\/+$/, "");

async function twoCaptchaSolve(task) {
  const createRes = await fetch(`${CAPTCHA_API}/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientKey: CAPTCHA_KEY, task }),
  });
  const created = await createRes.json();
  if (created.errorId) throw new Error(`2captcha: ${created.errorDescription || created.errorCode}`);
  const taskId = created.taskId;

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`${CAPTCHA_API}/getTaskResult`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: CAPTCHA_KEY, taskId }),
    });
    const out = await res.json();
    if (out.errorId) throw new Error(`2captcha: ${out.errorDescription || out.errorCode}`);
    if (out.status === "ready") {
      return out.solution?.gRecaptchaResponse || out.solution?.token || "";
    }
  }
  throw new Error("2captcha: tempo esgotado ao resolver o captcha");
}

// Descobre se a página tem hCaptcha / reCAPTCHA / Turnstile e devolve o sitekey.
async function detectCaptcha(page) {
  return await page.evaluate(() => {
    const grab = (sel, attr) => {
      const el = document.querySelector(sel);
      return el ? el.getAttribute(attr) || "" : "";
    };
    let key = grab(".h-captcha", "data-sitekey") || grab("[data-hcaptcha-sitekey]", "data-hcaptcha-sitekey");
    if (key) return { type: "hcaptcha", key };
    key = grab(".g-recaptcha", "data-sitekey") || grab("[data-sitekey]", "data-sitekey");
    if (key) return { type: "recaptcha", key };
    key = grab(".cf-turnstile", "data-sitekey");
    if (key) return { type: "turnstile", key };
    const iframe = document.querySelector("iframe[src*='hcaptcha.com'], iframe[src*='recaptcha']");
    if (iframe) {
      const src = iframe.getAttribute("src") || "";
      const m = src.match(/[?&]sitekey=([^&]+)/) || src.match(/[?&]k=([^&]+)/);
      if (m) return { type: src.includes("hcaptcha") ? "hcaptcha" : "recaptcha", key: m[1] };
    }
    return null;
  }).catch(() => null);
}

// Injeta o token resolvido nos campos que o painel espera e dispara os callbacks.
async function injectCaptchaToken(page, type, token) {
  await page.evaluate((type, token) => {
    const names = type === "hcaptcha"
      ? ["h-captcha-response", "g-recaptcha-response"]
      : type === "turnstile"
        ? ["cf-turnstile-response", "g-recaptcha-response"]
        : ["g-recaptcha-response"];
    for (const name of names) {
      let el = document.querySelector(`[name="${name}"]`);
      if (!el) {
        el = document.createElement("textarea");
        el.name = name;
        el.id = name;
        el.style.display = "none";
        (document.forms[0] || document.body).appendChild(el);
      }
      el.value = token;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Executa callbacks registrados pelo widget (quando existirem).
    try {
      const cbs = [];
      for (const k in window) {
        if (/captchaCallback|onCaptcha|captchaSuccess/i.test(k) && typeof window[k] === "function") cbs.push(window[k]);
      }
      cbs.forEach((fn) => { try { fn(token); } catch { /* noop */ } });
    } catch { /* noop */ }
  }, type, token);
}

// Resolve o CAPTCHA da página atual: Bright Data quando remoto, 2Captcha no Chrome local.
async function solveCaptcha(page, remote, pageUrl) {
  if (remote) {
    try {
      const client = await page.createCDPSession();
      return await client.send("Captcha.solve", { detectTimeout: 30000 });
    } catch (err) {
      return { status: "unavailable", message: String(err && err.message) };
    }
  }

  const found = await detectCaptcha(page);
  if (!found) return { status: "not_detected" };
  if (!CAPTCHA_KEY) {
    return { status: "unavailable", message: "Defina CAPTCHA_API_KEY (2captcha) na VPS para resolver o captcha." };
  }

  const websiteURL = pageUrl || page.url();
  const task = found.type === "hcaptcha"
    ? { type: "HCaptchaTaskProxyless", websiteURL, websiteKey: found.key }
    : found.type === "turnstile"
      ? { type: "TurnstileTaskProxyless", websiteURL, websiteKey: found.key }
      : { type: "RecaptchaV2TaskProxyless", websiteURL, websiteKey: found.key };

  try {
    const token = await twoCaptchaSolve(task);
    if (!token) return { status: "failed", message: "2captcha nao devolveu token" };
    await injectCaptchaToken(page, found.type, token);
    return { status: "solve_finished", provider: "2captcha", captcha_type: found.type };
  } catch (err) {
    return { status: "failed", provider: "2captcha", message: String(err && err.message) };
  }
}

// ---------------------------------------------------------------------------
// Sessão de navegador com resolução automática de CAPTCHA.
// Usado para painéis que exigem hCaptcha/reCAPTCHA no login (P2Cine, Uniplay).
// Payload:
//   { browser: true, url, steps: [{selector, value?, click?, wait_ms?}], wait_ms, final_url_contains? }
// Retorna: { final_url, cookies, html (trecho), captcha }
// ---------------------------------------------------------------------------
async function browserSession(payload) {
  const { browser, remote } = await openBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // Captura respostas de rede que interessam (ex.: endpoint de login do painel).
    const captured = [];
    const capturePattern = payload.capture ? new RegExp(String(payload.capture), "i") : null;
    if (capturePattern) {
      page.on("response", async (resp) => {
        try {
          const url = resp.url();
          if (!capturePattern.test(url)) return;
          const body = await resp.text().catch(() => "");
          captured.push({ url, status: resp.status(), body: String(body).slice(0, 2000) });
        } catch { /* ignora */ }
      });
    }

    await page.goto(String(payload.url), { waitUntil: "domcontentloaded", timeout: 120000 });


    // Resolve qualquer CAPTCHA já presente na tela de login.
    let captcha = await solveCaptcha(page, remote, String(payload.url));

    const stepsLog = [];
    for (const step of Array.isArray(payload.steps) ? payload.steps : []) {
      try {
        if (step.selector) {
          await page.waitForSelector(step.selector, { timeout: 30000, visible: true });
          if (typeof step.value === "string") {
            await page.click(step.selector, { clickCount: 3 }).catch(() => {});
            await page.type(step.selector, step.value, { delay: 40 });
          }
          if (step.click) {
            // Antes de submeter, garante que o token do captcha esteja preenchido.
            if (!captcha || !["solve_finished", "not_detected"].includes(captcha.status)) {
              const retry = await solveCaptcha(page, remote, page.url());
              if (retry && retry.status !== "not_detected") captcha = retry;
            }
            await page.click(step.selector);
          }
          stepsLog.push({ selector: step.selector, ok: true });
        }
        if (step.wait_ms) await new Promise((r) => setTimeout(r, Number(step.wait_ms)));
      } catch (err) {
        stepsLog.push({ selector: step.selector, ok: false, error: err && err.message });
        console.warn("[browser] passo falhou:", step.selector, err && err.message);
      }
    }


    // Segunda tentativa (alguns painéis só mostram o captcha após o submit).
    try {
      const c2 = await solveCaptcha(page, remote, page.url());
      if (c2 && c2.status && c2.status !== "not_detected") {
        captcha = c2;
        if (c2.status === "solve_finished") {
          const submit = (payload.steps || []).find((s) => s.click);
          if (submit && submit.selector) {
            await page.click(submit.selector).catch(() => {});
            await new Promise((r) => setTimeout(r, 8000));
          }
        }
      }
    } catch { /* ignora */ }


    await new Promise((r) => setTimeout(r, Number(payload.wait_ms || 5000)));

    const cookies = await page.cookies();
    const finalUrl = page.url();
    const html = (await page.content()).slice(0, 150000);
    const storage = await page
      .evaluate(() => {
        const out = {};
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); } } catch { /* noop */ }
        try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); out["ss:" + k] = sessionStorage.getItem(k); } } catch { /* noop */ }
        return out;
      })
      .catch(() => ({}));

    // Lista os campos e botões visíveis, para descobrir os seletores certos.
    const fields = await page
      .evaluate(() => {
        const list = [];
        document.querySelectorAll("input, button, [type=submit]").forEach((el) => {
          list.push({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute("type") || "",
            name: el.getAttribute("name") || "",
            id: el.id || "",
            placeholder: el.getAttribute("placeholder") || "",
            text: (el.innerText || "").trim().slice(0, 40),
          });
        });
        return list.slice(0, 40);
      })
      .catch(() => []);

    await page.close().catch(() => {});
    return { final_url: finalUrl, cookies, html, captcha, storage, captured, steps: stepsLog, fields };

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
      version: "1.8.0",
      mode: BRIGHTDATA_WS ? "brightdata" : "direct",
      browser: browserAvailable,
      captcha_solver: CAPTCHA_KEY ? "2captcha" : (BRIGHTDATA_WS ? "brightdata" : null),
      chrome: CHROME_PATH || null,
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

  // Modo navegador (login com CAPTCHA)
  if (payload.browser === true) {
    if (!browserAvailable) {
      return send(res, 400, {
        error: "navegador_indisponivel",
        message: "Instale o Chrome nesta VPS (npm i puppeteer-core + apt install chromium) ou configure BRIGHTDATA_WS.",
      });
    }
    try {
      const out = await browserSession(payload);
      console.log(`[browser] ${target} -> ${out.final_url} captcha=${out.captcha && out.captcha.status}`);
      return send(res, 200, { ok: true, ...out });
    } catch (err) {
      console.error("[browser] falha:", err && err.message);
      return send(res, 502, { error: "falha_no_navegador", message: String(err && err.message) });
    }
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
      redirect: payload.redirect === "manual" ? "manual" : "follow",
    });
    const text = await upstream.text();
    const outHeaders = {};
    upstream.headers.forEach((value, key) => { outHeaders[key] = value; });
    let cookies = [];
    try { cookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : []; } catch {}
    if (!cookies.length && outHeaders["set-cookie"]) cookies = [outHeaders["set-cookie"]];
    console.log(`[sigma-proxy] ${method} ${target} -> ${upstream.status}`);
    return send(res, 200, { status: upstream.status, ok: upstream.ok, body: text, headers: outHeaders, cookies, final_url: upstream.url || target });
  } catch (err) {
    console.error("[sigma-proxy] falha ao chamar o painel:", err && err.message);
    return send(res, 502, { error: "falha_no_painel", message: String(err && err.message) });
  }
});

server.listen(PORT, () => {
  console.log(`Mini Proxy Sigma ativo em http://localhost:${PORT}`);
});
