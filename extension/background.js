// SuperGestor Panel Auto-Renew - background service worker (v2.1.0)
// P2Cine (kOffice) foi removido: agora renova direto pela API nativa no servidor.
// A extensao cuida apenas do Uniplay (reCAPTCHA do Google ainda nao contornado)
// e do keep-alive da sessao IBO Sol.
const QUEUE_URL = "https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/p2cine-queue";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwaHFmZ3hmZWF5bGxkcHhqcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTYwMDAsImV4cCI6MjA4MjU3MjAwMH0.PsIJenRZEAWTlxbdGYvJWrBUfiIifPn9Q_UVeUyrFs8";
const POLL_SECONDS = 20;
const UNIPLAY_PANEL_URL = "https://searchdefense.top/";
const UNIPLAY_PANEL_URLS = ["https://searchdefense.top/*", "http://searchdefense.top/*"];
const UNIPLAY_API_BASE = "https://gesapioffice.com";
const UNIPLAY_TOKEN_KEY = "372a8eb9ccd066d576409eead9568a13";
const UNIPLAY_REG_PASS_KEY = "120asidj0sad0912j90d12";
const IBOSOL_PANEL_URL = "https://ibosol.com/multi-apps-activation";
const IBOSOL_PANEL_URLS = ["https://ibosol.com/*", "https://*.ibosol.com/*"];
const IBOSOL_API_BASE = "https://backend-apis.ibosol.com/api";



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

async function pushHistory(entry) {
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  history.unshift({ at: new Date().toISOString(), ...entry });
  // keep last 50
  if (history.length > 50) history.length = 50;
  await chrome.storage.local.set({ history });
}


async function fetchNext(token) {
  const res = await fetch(QUEUE_URL, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    headers: { "x-extension-token": token },
  });
  if (!res.ok) throw new Error(`queue GET ${res.status}`);
  return await res.json();
}

async function reportResult(token, id, success, message, http_status) {
  await fetch(QUEUE_URL, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-extension-token": token,
    },
    body: JSON.stringify({ id, success, message, http_status }),
  });
}

function waitForTabComplete(tabId, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function openHiddenTab(url) {
  // Cria aba em background (nao rouba foco). Usuario ainda precisa estar logado no painel.
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab?.id) await waitForTabComplete(tab.id, 20000);
  return tab?.id ? { tabId: tab.id } : { error: "create_failed" };
}


async function getUniplayTab({ autoOpen = true } = {}) {
  const tabs = await chrome.tabs.query({ url: UNIPLAY_PANEL_URLS });
  const tab = tabs[0];
  if (tab?.id) return { tabId: tab.id };
  if (!autoOpen) return { error: "no_uniplay_tab" };
  const opened = await openHiddenTab(UNIPLAY_PANEL_URL);
  if (opened.error) return { error: "no_uniplay_tab" };
  return { tabId: opened.tabId, opened: true };
}

async function runInUniplay(func, args = []) {
  const panel = await getUniplayTab();
  if (panel.error) return { error: panel.error };
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: panel.tabId },
      world: "MAIN",
      func,
      args,
    });
    return result?.result || { error: "no_result" };
  } catch (e) {
    return { error: "script_error", message: e?.message || String(e) };
  }
}

async function renewUniplay(username, months) {
  return await runInUniplay(async (login, qty, apiBase, tokenKey, regPassKey) => {
    const token = localStorage.getItem(tokenKey) || "";
    const regPass = localStorage.getItem(regPassKey) || "";
    if (!token) return { ok: false, error: "logged_out", msg: "Sessao Uniplay deslogada", status: 401 };

    const strip = (v) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    const compact = (v) => strip(v).replace(/\D/g, "");
    const variants = (() => {
      const base = strip(login);
      const digits = compact(base);
      const set = new Set([base]);
      if (digits) {
        set.add(digits);
        if (digits.startsWith("55") && digits.length >= 12) {
          const wo = digits.slice(2);
          set.add(wo);
          if (wo.length === 11 && wo[2] === "9") {
            set.add(wo.slice(0, 2) + wo.slice(3));
            set.add("55" + wo.slice(0, 2) + wo.slice(3));
          } else if (wo.length === 10) {
            set.add(wo.slice(0, 2) + "9" + wo.slice(2));
            set.add("55" + wo.slice(0, 2) + "9" + wo.slice(2));
          }
        } else if (digits.length >= 10) {
          set.add("55" + digits);
        }
      }
      return [...set].filter(Boolean).map((v) => v.toLowerCase());
    })();
    const headers = { "Accept": "application/json, text/plain, */*", "Authorization": `Bearer ${token}` };
    const readJson = async (url, opts = {}) => {
      const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
      const text = await res.text();
      if (!res.ok) return { error: `http_${res.status}`, status: res.status, text: text.slice(0, 300) };
      try { return { status: res.status, data: JSON.parse(text) }; }
      catch { return { error: "bad_json", status: res.status, text: text.slice(0, 300) }; }
    };
    const iptvUrl = `${apiBase}/api/users-iptv${regPass ? `?reg_password=${encodeURIComponent(regPass)}` : ""}`;
    const [iptv, p2p] = await Promise.all([
      readJson(iptvUrl),
      readJson(`${apiBase}/api/users-p2p`),
    ]);
    const listErrors = [iptv, p2p].filter((r) => r.error).map((r) => `${r.error}${r.status ? ` (${r.status})` : ""}`);
    const iptvList = Array.isArray(iptv.data) ? iptv.data : [];
    const p2pList = Array.isArray(p2p.data) ? p2p.data : [];
    const matchIptv = iptvList.find((u) => variants.includes(strip(u?.username).toLowerCase()));
    const matchP2p = p2pList.find((u) => variants.includes(strip(u?.name).toLowerCase()) || variants.includes(strip(u?.username).toLowerCase()));
    if (!matchIptv && !matchP2p) {
      return { ok: false, error: listErrors.length === 2 ? "list_failed" : "not_found", msg: listErrors.length === 2 ? `Login OK, mas listas falharam: ${listErrors.join(" | ")}` : `Usuario ${login} nao encontrado no Uniplay`, status: 200 };
    }
    const renew = async (kind, id) => {
      const res = await fetch(`${apiBase}/api/users-${kind}/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json;charset=UTF-8" },
        body: JSON.stringify({ action: 1, credits: Math.max(1, Number(qty) || 1) }),
      });
      const text = await res.text();
      return { kind, ok: res.ok, status: res.status, text: text.slice(0, 300) };
    };
    const results = [];
    if (matchIptv?.id) results.push(await renew("iptv", matchIptv.id));
    if (matchP2p?.id) results.push(await renew("p2p", matchP2p.id));
    const ok = results.some((r) => r.ok);
    return {
      ok,
      status: results.find((r) => !r.ok)?.status || 200,
      msg: ok ? `Uniplay renovado (${results.filter((r) => r.ok).map((r) => r.kind.toUpperCase()).join(" + ")})` : `Falha Uniplay: ${JSON.stringify(results)}`,
    };
  }, [username, months, UNIPLAY_API_BASE, UNIPLAY_TOKEN_KEY, UNIPLAY_REG_PASS_KEY]);
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

  if (next.panel_type === "uniplay") {
    const months = String(next.months || cfg.months || "1");
    const r = await renewUniplay(next.username, months);
    const name = next.customer_name || next.username;
    if (r.error) {
      const msg = ({
        logged_out: "Sessao Uniplay deslogada. Faca login em searchdefense.top e resolva o captcha.",
        no_uniplay_tab: "Abra uma aba logada em searchdefense.top e tente novamente.",
        script_error: "Nao consegui acessar a aba do searchdefense.top. Recarregue a pagina do painel.",
        not_found: `Login ${next.username} nao encontrado no Uniplay`,
        list_failed: r.msg,
        bad_json: "Resposta invalida do Uniplay",
      })[r.error] || (r.msg || `Erro Uniplay: ${r.error}`);
      await reportResult(cfg.token, next.id, false, msg, r.status);
      await pushHistory({ panel: "uniplay", name, username: next.username, months, ok: false, msg });
      return log(`${name}: ${msg}`, "fail");
    }
    await reportResult(cfg.token, next.id, r.ok, r.msg, r.status);
    await pushHistory({ panel: "uniplay", name, username: next.username, months, ok: r.ok, msg: r.msg });
    await log(`${name} (${months}m): ${r.msg}`, r.ok ? "ok" : "fail");
    if (r.ok) {
      chrome.notifications.create({ type: "basic", iconUrl: "icon.png", title: "Uniplay renovado", message: `${name}` });
    }
    return;
  }

  // Qualquer outro painel (ex.: P2Cine/kOffice) nao usa mais a extensao:
  // a renovacao acontece direto pela API nativa no servidor.
  return;
}


const VERSION_URL = "https://supergestor.top/p2cine-extension.json";
const DOWNLOAD_URL = "https://supergestor.top/p2cine-extension.zip";
const KEEPALIVE_USERNAME = "0";

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


async function getIbosolTab({ autoOpen = true } = {}) {
  const tabs = await chrome.tabs.query({ url: IBOSOL_PANEL_URLS });
  const tab = tabs[0];
  if (tab?.id) return { tabId: tab.id };
  if (!autoOpen) return { error: "no_ibosol_tab" };
  const opened = await openHiddenTab(IBOSOL_PANEL_URL);
  if (opened.error) return { error: "no_ibosol_tab" };
  return { tabId: opened.tabId, opened: true };
}

async function ibosolKeepAlive() {
  // Faz um ping em /profile a partir da aba do ibosol.com (usa o Bearer token
  // salvo em localStorage/sessionStorage do proprio painel). Isso renova a
  // sessao/cookies do Cloudflare e evita logout automatico.
  const panel = await getIbosolTab({ autoOpen: true });
  if (panel.error) {
    await chrome.storage.local.set({ lastIbosolKeepAlive: new Date().toISOString(), lastIbosolKeepAliveResult: JSON.stringify(panel) });
    return panel;
  }
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: panel.tabId },
      world: "MAIN",
      func: async (apiBase) => {
        try {
          const findToken = () => {
            const scan = (store) => {
              for (let i = 0; i < store.length; i++) {
                const k = store.key(i);
                const v = store.getItem(k) || "";
                if (/^\d+\|[A-Za-z0-9]{20,}$/.test(v)) return v;
                try {
                  const j = JSON.parse(v);
                  const t = j?.token || j?.access_token || j?.auth?.token;
                  if (typeof t === "string" && /^\d+\|[A-Za-z0-9]{20,}$/.test(t)) return t;
                } catch {}
              }
              return null;
            };
            return scan(localStorage) || scan(sessionStorage);
          };
          const token = findToken();
          const headers = { Accept: "application/json" };
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(`${apiBase}/profile`, { method: "GET", credentials: "include", headers });
          return { ok: res.ok, status: res.status, hasToken: !!token };
        } catch (e) { return { ok: false, error: String(e?.message || e) }; }
      },
      args: [IBOSOL_API_BASE],
    });
    const result = r?.result || { error: "no_result" };
    await chrome.storage.local.set({ lastIbosolKeepAlive: new Date().toISOString(), lastIbosolKeepAliveResult: JSON.stringify(result) });

    // Se o painel voltou 401/403, notifica uma vez que a sessao caiu.
    if (result?.status === 401 || result?.status === 403) {
      notifyOnce("ibosol_out", "Sessao IBO Sol expirou", "Faca login novamente em ibosol.com e cole o novo token em Ativacao de Apps.");
    }
    return result;
  } catch (e) {
    const err = { error: "script_error", message: e?.message || String(e) };
    await chrome.storage.local.set({ lastIbosolKeepAlive: new Date().toISOString(), lastIbosolKeepAliveResult: JSON.stringify(err) });
    return err;
  }
}

async function notifyOnce(id, title, message) {

  const key = `notif_${id}`;
  const prev = (await chrome.storage.local.get({ [key]: 0 }))[key];
  const now = Date.now();
  // debounce: no maximo 1 notif do mesmo tipo a cada 15min
  if (now - prev < 15 * 60 * 1000) return;
  await chrome.storage.local.set({ [key]: now });
  try { chrome.notifications.create({ type: "basic", iconUrl: "icon.png", title, message }); } catch {}
}

async function checkPanelsStatus() {
  // Uniplay: verifica token no localStorage (unico painel que ainda depende da extensao)
  let uniplayLogged = false, uniplayOpen = false;
  const upTabs = await chrome.tabs.query({ url: UNIPLAY_PANEL_URLS });
  uniplayOpen = upTabs.length > 0;
  if (uniplayOpen) {
    const r = await runInUniplay(async (tokenKey) => {
      try { return { logged: !!localStorage.getItem(tokenKey) }; }
      catch { return { logged: false }; }
    }, [UNIPLAY_TOKEN_KEY]);
    uniplayLogged = !!r?.logged;
  }

  const status = {
    uniplay: { open: uniplayOpen, logged: uniplayLogged },
    checkedAt: new Date().toISOString(),
  };
  const prev = (await chrome.storage.local.get({ panelsStatus: null })).panelsStatus;
  await chrome.storage.local.set({ panelsStatus: status });

  if (prev?.uniplay?.logged && !uniplayLogged && uniplayOpen) {
    notifyOnce("uniplay_out", "Sessao Uniplay expirou", "Faca login novamente em searchdefense.top para retomar as renovacoes.");
  }
  // Se nao ha aba aberta E ha renovacoes pendentes, avisa 1x
  const cfg = await getConfig();
  if (cfg.enabled && cfg.token && !uniplayOpen) {
    try {
      const next = (await fetchNext(cfg.token)).item;
      if (next) notifyOnce("uniplay_notab", "Uniplay: abra o painel", "Ha renovacao pendente. Abra searchdefense.top e faca login.");
    } catch {}
  }
  return status;
}

async function openPanels() {
  const opened = [];
  const up = await chrome.tabs.query({ url: UNIPLAY_PANEL_URLS });
  if (up.length === 0) { await chrome.tabs.create({ url: UNIPLAY_PANEL_URL, active: false }); opened.push("uniplay"); }
  const ib = await chrome.tabs.query({ url: IBOSOL_PANEL_URLS });
  if (ib.length === 0) { await chrome.tabs.create({ url: IBOSOL_PANEL_URL, active: false }); opened.push("ibosol"); }
  return { opened };
}

function setupAlarms() {
  chrome.alarms.create("sg-tick", { periodInMinutes: POLL_SECONDS / 60 });
  chrome.alarms.create("sg-update", { periodInMinutes: 60 });
  chrome.alarms.create("sg-status", { periodInMinutes: 2 });
  chrome.alarms.create("ibosol-keepalive", { periodInMinutes: 4 });
}

chrome.runtime.onInstalled.addListener(() => { setupAlarms(); checkForUpdate(); ibosolKeepAlive(); checkPanelsStatus(); });
chrome.runtime.onStartup.addListener(() => { setupAlarms(); checkForUpdate(); ibosolKeepAlive(); checkPanelsStatus(); });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "sg-tick") tick();
  if (a.name === "sg-update") checkForUpdate();
  if (a.name === "sg-status") checkPanelsStatus();
  if (a.name === "ibosol-keepalive") ibosolKeepAlive();
});


chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type === "run-now") { tick().then(() => send({ ok: true })); return true; }
  if (msg?.type === "open-panels") { openPanels().then((r) => send(r)); return true; }
  if (msg?.type === "check-status") { checkPanelsStatus().then((s) => send(s)); return true; }
  if (msg?.type === "check-update") { checkForUpdate().then(() => send({ ok: true })); return true; }
});
