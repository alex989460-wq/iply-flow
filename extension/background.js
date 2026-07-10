// SuperGestor P2Cine Auto-Renew - background service worker
const QUEUE_URL = "https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/p2cine-queue";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwaHFmZ3hmZWF5bGxkcHhqcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTYwMDAsImV4cCI6MjA4MjU3MjAwMH0.PsIJenRZEAWTlxbdGYvJWrBUfiIifPn9Q_UVeUyrFs8";
const POLL_SECONDS = 20;

async function getConfig() {
  return await chrome.storage.local.get({
    token: "",
    panelBase: "https://daily3.news",
    renewPath: "/clients/renew",
    monthsParam: "months",
    monthsValue: "1",
    enabled: false,
    lastRun: null,
    lastResult: "",
    successCount: 0,
    failCount: 0,
  });
}

async function log(msg, result) {
  const cfg = await getConfig();
  await chrome.storage.local.set({
    lastRun: new Date().toISOString(),
    lastResult: msg,
    successCount: cfg.successCount + (result === "ok" ? 1 : 0),
    failCount: cfg.failCount + (result === "fail" ? 1 : 0),
  });
  console.log("[P2Cine]", msg);
}

async function fetchNext(token) {
  const res = await fetch(QUEUE_URL, {
    method: "GET",
    headers: {
      "x-extension-token": token,
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${SUPABASE_ANON}`,
    },
  });
  if (!res.ok) throw new Error(`queue GET ${res.status}`);
  return await res.json();
}

async function reportResult(token, id, success, message, http_status) {
  await fetch(QUEUE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-extension-token": token,
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ id, success, message, http_status }),
  });
}

async function renewOnPanel(cfg, item) {
  // Executes the renewal against the panel using the user's session cookies.
  const url = cfg.panelBase.replace(/\/+$/, "") + cfg.renewPath;
  const body = new URLSearchParams();
  body.set("username", item.username || "");
  body.set(cfg.monthsParam, cfg.monthsValue);

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json, text/html;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });
  const text = await res.text().catch(() => "");
  const lower = text.toLowerCase();
  const looksLikeCaptcha =
    lower.includes("hcaptcha") || lower.includes("recaptcha") || lower.includes("captcha");
  const looksLikeLogin =
    res.status === 401 || res.status === 403 || lower.includes('name="password"');

  if (looksLikeLogin) {
    return { ok: false, msg: "Sessao P2Cine deslogada. Faca login em daily3.news.", status: res.status };
  }
  if (looksLikeCaptcha) {
    return { ok: false, msg: "Captcha exigido pelo painel. Resolva manualmente uma vez.", status: res.status };
  }
  if (!res.ok) {
    return { ok: false, msg: `HTTP ${res.status}`, status: res.status };
  }
  return { ok: true, msg: `Renovado (${res.status})`, status: res.status };
}

async function tick() {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.token) return;

  let next;
  try {
    next = (await fetchNext(cfg.token)).item;
  } catch (e) {
    return log("Erro consultando fila: " + e.message, "fail");
  }
  if (!next) return; // nothing to do

  const r = await renewOnPanel(cfg, next);
  await reportResult(cfg.token, next.id, r.ok, r.msg, r.status);
  await log(`${next.customer_name || next.username}: ${r.msg}`, r.ok ? "ok" : "fail");

  if (r.ok) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "P2Cine renovado",
      message: `${next.customer_name || next.username}`,
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("p2cine-tick", { periodInMinutes: POLL_SECONDS / 60 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("p2cine-tick", { periodInMinutes: POLL_SECONDS / 60 });
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "p2cine-tick") tick(); });

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type === "run-now") { tick().then(() => send({ ok: true })); return true; }
});
