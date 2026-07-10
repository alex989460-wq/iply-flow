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
  const norm = String(username).trim();
  const strip = (v) => String(v ?? "").replace(/<[^>]*>/g, "").trim();

  async function query(searchValue) {
    const body = new URLSearchParams();
    body.set("draw", "1");
    body.set("start", "0");
    body.set("length", "500");
    body.set("search[value]", searchValue);
    body.set("search[regex]", "false");
    for (let i = 0; i < 10; i++) {
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
        "Referer": `${PANEL_BASE}/dashboard/`,
      },
      body: body.toString(),
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text, lower: text.toLowerCase() };
  }

  function findIn(rows) {
    for (const r of rows || []) {
      if (!r) continue;
      const cells = Array.isArray(r) ? r : Object.values(r);
      for (const c of cells) {
        if (strip(c) === norm) {
          const first = strip(cells[0]);
          const id = /^\d+$/.test(first) ? first : String(r.DT_RowId || first).replace(/\D/g, "");
          if (id) return id;
        }
      }
    }
    return null;
  }

  let r = await query(norm);
  if (r.status === 401 || r.status === 403 || r.lower.includes('name="password"'))
    return { error: "logged_out", status: r.status };
  if (r.lower.includes("hcaptcha") || r.lower.includes("recaptcha"))
    return { error: "captcha", status: r.status };
  if (!r.ok) return { error: `http_${r.status}`, status: r.status };

  let json;
  try { json = JSON.parse(r.text); } catch { return { error: "bad_json", status: r.status }; }
  let id = findIn(json?.data);
  let debug = `search: rows=${(json?.data || []).length} total=${json?.recordsTotal ?? "?"}`;

  if (!id) {
    const r2 = await query("");
    try {
      const j2 = JSON.parse(r2.text);
      id = findIn(j2?.data);
      debug += ` | all: rows=${(j2?.data || []).length} total=${j2?.recordsTotal ?? "?"} sample=${JSON.stringify((j2?.data || [])[0] || null).slice(0, 250)}`;
    } catch (e) { debug += ` | all: parse_err`; }
  }
  await chrome.storage.local.set({ lastDebug: debug });

  if (!id) return { error: "not_found", status: 200 };
  return { clientId: id };
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

const VERSION_URL = "https://supergestor.top/p2cine-extension.json";
const DOWNLOAD_URL = "https://supergestor.top/p2cine-extension.zip";

async function checkForUpdate() {
  try {
    const res = await fetch(VERSION_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;
    const info = await res.json();
    const current = chrome.runtime.getManifest().version;
    if (info?.version && info.version !== current) {
      await chrome.storage.local.set({ updateAvailable: info.version, updateUrl: info.download || DOWNLOAD_URL });
      chrome.action.setBadgeText({ text: "NEW" });
      chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    } else {
      await chrome.storage.local.set({ updateAvailable: null });
      chrome.action.setBadgeText({ text: "" });
    }
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("p2cine-tick", { periodInMinutes: POLL_SECONDS / 60 });
  chrome.alarms.create("p2cine-update", { periodInMinutes: 60 });
  checkForUpdate();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("p2cine-tick", { periodInMinutes: POLL_SECONDS / 60 });
  chrome.alarms.create("p2cine-update", { periodInMinutes: 60 });
  checkForUpdate();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "p2cine-tick") tick();
  if (a.name === "p2cine-update") checkForUpdate();
});

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type === "run-now") { tick().then(() => send({ ok: true })); return true; }
  if (msg?.type === "check-update") { checkForUpdate().then(() => send({ ok: true })); return true; }
});
