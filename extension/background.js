// SuperGestor P2Cine Auto-Renew - background service worker (v1.1.0)
const QUEUE_URL = "https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/p2cine-queue";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwaHFmZ3hmZWF5bGxkcHhqcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTYwMDAsImV4cCI6MjA4MjU3MjAwMH0.PsIJenRZEAWTlxbdGYvJWrBUfiIifPn9Q_UVeUyrFs8";
const POLL_SECONDS = 20;
const PANEL_BASE = "https://daily3.news";

async function getConfig() {
  return await chrome.storage.local.get({
    token: "",
    months: "1",
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

// Look up the P2Cine internal client_id from the login/username.
async function findClientId(username) {
  const body = new URLSearchParams();
  body.set("draw", "1");
  body.set("start", "0");
  body.set("length", "25");
  body.set("search[value]", username);
  body.set("search[regex]", "false");
  // Datatables requires column defs — send minimal set for cols 0..2.
  for (let i = 0; i < 3; i++) {
    body.set(`columns[${i}][data]`, String(i));
    body.set(`columns[${i}][name]`, "");
    body.set(`columns[${i}][searchable]`, "true");
    body.set(`columns[${i}][orderable]`, "true");
    body.set(`columns[${i}][search][value]`, "");
    body.set(`columns[${i}][search][regex]`, "false");
  }
  body.set("order[0][column]", "0");
  body.set("order[0][dir]", "desc");

  const res = await fetch(`${PANEL_BASE}/clients/api/?get_clients`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
    },
    body: body.toString(),
  });

  const text = await res.text();
  const lower = text.toLowerCase();
  if (res.status === 401 || res.status === 403 || lower.includes('name="password"')) {
    return { error: "logged_out", status: res.status };
  }
  if (lower.includes("hcaptcha") || lower.includes("recaptcha")) {
    return { error: "captcha", status: res.status };
  }
  if (!res.ok) return { error: `http_${res.status}`, status: res.status };

  let json;
  try { json = JSON.parse(text); } catch { return { error: "bad_json", status: res.status }; }
  const rows = json?.data || [];
  // kOffice row shape: [Id, Login, Senha, Adicionado, Vencimento, ...].
  // Strip any HTML wrapping the cell may contain before comparing.
  const strip = (v) => String(v ?? "").replace(/<[^>]*>/g, "").trim();
  const norm = String(username).trim();
  const hit =
    rows.find((r) => strip(r?.[1]) === norm) ||
    rows.find((r) => r && Object.values(r).some((c) => strip(c) === norm)) ||
    rows.find((r) => strip(r?.[1]).includes(norm));
  if (!hit) return { error: "not_found", status: 200 };
  return { clientId: strip(hit[0]) };
}

async function renewClient(clientId, months) {
  const url = `${PANEL_BASE}/clients/api/?renew_client_plus&client_id=${encodeURIComponent(clientId)}&months=${encodeURIComponent(months)}`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
    },
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, msg: `HTTP ${res.status}`, status: res.status };
  try {
    const j = JSON.parse(text);
    if (j?.result === "success") return { ok: true, msg: "Renovado", status: res.status };
    return { ok: false, msg: j?.message || j?.result || "Falha na renovacao", status: res.status };
  } catch {
    return { ok: false, msg: "Resposta invalida", status: res.status };
  }
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
  if (!next || !next.username) return;

  const lookup = await findClientId(next.username);
  if (lookup.error) {
    const msg = ({
      logged_out: "Sessao P2Cine deslogada. Faca login em daily3.news.",
      captcha: "Captcha exigido pelo painel. Resolva manualmente.",
      not_found: `Login ${next.username} nao encontrado no painel`,
      bad_json: "Resposta invalida do get_clients",
    })[lookup.error] || `Erro: ${lookup.error}`;
    await reportResult(cfg.token, next.id, false, msg, lookup.status);
    return log(`${next.customer_name || next.username}: ${msg}`, "fail");
  }

  const r = await renewClient(lookup.clientId, cfg.months || "1");
  await reportResult(cfg.token, next.id, r.ok, r.msg, r.status);
  await log(`${next.customer_name || next.username} (id=${lookup.clientId}): ${r.msg}`, r.ok ? "ok" : "fail");

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
