// SuperGestor Panel Auto-Renew - background service worker (v1.7.3)
const QUEUE_URL = "https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/p2cine-queue";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwaHFmZ3hmZWF5bGxkcHhqcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTYwMDAsImV4cCI6MjA4MjU3MjAwMH0.PsIJenRZEAWTlxbdGYvJWrBUfiIifPn9Q_UVeUyrFs8";
const POLL_SECONDS = 20;
const PANEL_BASE = "https://daily3.news";
const CLIENTS_PAGE = `${PANEL_BASE}/clients/`;
const UNIPLAY_PANEL_URL = "https://searchdefense.top/";
const UNIPLAY_PANEL_URLS = ["https://searchdefense.top/*", "http://searchdefense.top/*"];
const UNIPLAY_API_BASE = "https://gesapioffice.com";
const UNIPLAY_TOKEN_KEY = "372a8eb9ccd066d576409eead9568a13";
const UNIPLAY_REG_PASS_KEY = "120asidj0sad0912j90d12";

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

async function getPanelTab(requireClientsPage = false, { autoOpen = true } = {}) {
  const tabs = await chrome.tabs.query({ url: ["https://daily3.news/*", "https://*.daily3.news/*"] });
  let tab = tabs.find((t) => t.url?.startsWith(CLIENTS_PAGE)) || tabs[0];

  if (!tab?.id) {
    if (!autoOpen) return { error: "no_tab" };
    const opened = await openHiddenTab(CLIENTS_PAGE);
    if (opened.error) return { error: "no_tab" };
    return { tabId: opened.tabId, opened: true };
  }

  if (requireClientsPage && !tab.url?.startsWith(CLIENTS_PAGE)) {
    const wait = waitForTabComplete(tab.id);
    tab = await chrome.tabs.update(tab.id, { url: CLIENTS_PAGE });
    await wait;
  }
  return { tabId: tab.id };
}

async function runInPanel(func, args = [], requireClientsPage = false) {
  const panel = await getPanelTab(requireClientsPage);
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

// Look up the P2Cine internal client_id from the login/username using the logged-in panel tab.
async function findClientId(username) {
  const direct = await runInPanel(async (login) => {
    const norm = String(login || "").trim();
    const strip = (v) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    const compact = (v) => strip(v).replace(/\D/g, "");
    const matchesLogin = (v) => strip(v) === norm || compact(v) === norm.replace(/\D/g, "");
    const extractId = (row, cells) => {
      const raw = [row?.DT_RowId, row?.id, row?.client_id, cells?.[0], ...cells].map(strip).join(" ");
      const patterns = [
        /client_id[=:\/]\s*(\d+)/i,
        /renew_client_plus[^\d]+(\d+)/i,
        /clients\/(?:view|edit|renew)?\/?(\d+)/i,
        /\brow[_-]?(\d+)\b/i,
      ];
      for (const p of patterns) {
        const m = raw.match(p);
        if (m?.[1]) return m[1];
      }
      const first = strip(cells?.[0]);
      if (/^\d+$/.test(first)) return first;
      const any = raw.match(/\b\d{1,10}\b/);
      return any?.[0] || null;
    };
    const findIn = (rows) => {
      for (const row of rows || []) {
        const cells = Array.isArray(row) ? row : Object.values(row || {});
        if (cells.some(matchesLogin)) {
          const id = extractId(row, cells);
          if (id) return id;
        }
      }
      return null;
    };
    const makeBody = (searchValue, start = 0, length = 1000) => {
      const body = new URLSearchParams();
      body.set("draw", "1");
      body.set("start", String(start));
      body.set("length", String(length));
      body.set("search[value]", searchValue);
      body.set("search[regex]", "false");
      for (let i = 0; i < 18; i++) {
        body.set(`columns[${i}][data]`, String(i));
        body.set(`columns[${i}][name]`, "");
        body.set(`columns[${i}][searchable]`, "true");
        body.set(`columns[${i}][orderable]`, "true");
        body.set(`columns[${i}][search][value]`, "");
        body.set(`columns[${i}][search][regex]`, "false");
      }
      body.set("order[0][column]", "0");
      body.set("order[0][dir]", "desc");
      return body;
    };
    const request = async (searchValue, start = 0) => {
      const res = await fetch("/clients/api/?get_clients", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json, text/javascript, */*; q=0.01",
        },
        body: makeBody(searchValue, start).toString(),
      });
      const text = await res.text();
      const lower = text.toLowerCase();
      if (res.status === 401 || res.status === 403 || lower.includes('name="password"')) return { error: "logged_out", status: res.status };
      if (lower.includes("hcaptcha") || lower.includes("recaptcha")) return { error: "captcha", status: res.status };
      if (!res.ok) return { error: `http_${res.status}`, status: res.status, text };
      try { return { status: res.status, json: JSON.parse(text) }; }
      catch { return { error: "bad_json", status: res.status, text }; }
    };

    const first = await request(norm, 0);
    if (first.error) return first;
    let id = findIn(first.json?.data);
    let debug = `tab-api search rows=${(first.json?.data || []).length} total=${first.json?.recordsTotal ?? "?"}`;

    if (!id) {
      const all = await request("", 0);
      if (all.error) return { ...all, debug };
      id = findIn(all.json?.data);
      debug += ` | all rows=${(all.json?.data || []).length} total=${all.json?.recordsTotal ?? "?"} sample=${JSON.stringify((all.json?.data || [])[0] || null).slice(0, 220)}`;
    }
    return id ? { clientId: id, debug } : { error: "not_found", status: 200, debug };
  }, [username], false);

  if (direct.debug) await chrome.storage.local.set({ lastDebug: direct.debug });
  if (direct.clientId || !["not_found", "bad_json", "no_result"].includes(direct.error)) return direct;

  const ui = await runInPanel(async (login) => {
    const norm = String(login || "").trim();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const strip = (v) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    const compact = (v) => strip(v).replace(/\D/g, "");
    const matchesLogin = (v) => strip(v) === norm || compact(v) === norm.replace(/\D/g, "");
    const extractIdFromText = (text) => {
      const patterns = [/client_id[=:\/]\s*(\d+)/i, /renew_client_plus[^\d]+(\d+)/i, /clients\/(?:view|edit|renew)?\/?(\d+)/i, /\brow[_-]?(\d+)\b/i];
      for (const p of patterns) {
        const m = String(text || "").match(p);
        if (m?.[1]) return m[1];
      }
      return null;
    };
    const idFromRow = (row) => {
      const html = row.outerHTML || "";
      const direct = extractIdFromText(html);
      if (direct) return direct;
      const first = strip(row.querySelector("td")?.textContent);
      if (/^\d+$/.test(first)) return first;
      return null;
    };
    const findInDom = () => {
      const rows = [...document.querySelectorAll("table tbody tr")];
      for (const row of rows) {
        if ([...row.querySelectorAll("td")].some((td) => matchesLogin(td.textContent))) {
          const id = idFromRow(row);
          if (id) return id;
        }
      }
      return null;
    };

    if (window.jQuery?.fn?.dataTable) {
      const $ = window.jQuery;
      const tables = $.fn.dataTable.tables();
      for (const table of tables) {
        try {
          const dt = $(table).DataTable();
          dt.search(norm).draw();
        } catch {}
      }
      await sleep(3500);
    } else {
      const input = document.querySelector('.dataTables_filter input, input[type="search"], input[aria-controls*="client" i]');
      if (input) {
        input.focus();
        input.value = norm;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "9" }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(3500);
      }
    }

    let id = findInDom();
    let debug = `ui-search url=${location.pathname} domRows=${document.querySelectorAll("table tbody tr").length}`;
    if (!id && window.jQuery?.fn?.dataTable) {
      const $ = window.jQuery;
      for (const table of $.fn.dataTable.tables()) {
        try {
          const data = $(table).DataTable().rows({ search: "applied" }).data().toArray();
          for (const row of data) {
            const cells = Array.isArray(row) ? row : Object.values(row || {});
            if (cells.some(matchesLogin)) {
              const raw = JSON.stringify(row);
              id = extractIdFromText(raw) || (/^\d+$/.test(strip(cells[0])) ? strip(cells[0]) : null);
              if (id) break;
            }
          }
          debug += ` dtRows=${data.length} sample=${JSON.stringify(data[0] || null).slice(0, 220)}`;
        } catch {}
      }
    }
    return id ? { clientId: id, debug } : { error: "not_found", status: 200, debug };
  }, [username], true);

  if (ui.debug) await chrome.storage.local.set({ lastDebug: `${direct.debug || ""} | ${ui.debug}`.trim() });
  return ui;
}

async function renewClient(clientId, months) {
  return await runInPanel(async (id, qty) => {
    const url = `/clients/api/?renew_client_plus&client_id=${encodeURIComponent(id)}&months=${encodeURIComponent(qty)}`;
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
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
  }, [clientId, months], false);
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

  const lookup = await findClientId(next.username);
  const name = next.customer_name || next.username;
  if (lookup.error) {
    const msg = ({
      logged_out: "Sessao P2Cine deslogada. Faca login em daily3.news.",
      no_tab: "Abra uma aba logada em daily3.news e tente novamente.",
      script_error: "Nao consegui acessar a aba do daily3.news. Recarregue a pagina do painel.",
      captcha: "Captcha exigido pelo painel. Resolva manualmente.",
      not_found: `Login ${next.username} nao encontrado no painel`,
      bad_json: "Resposta invalida do get_clients",
    })[lookup.error] || `Erro: ${lookup.error}`;
    await reportResult(cfg.token, next.id, false, msg, lookup.status);
    await pushHistory({ panel: "p2cine", name, username: next.username, ok: false, msg });
    return log(`${name}: ${msg}`, "fail");
  }

  const months = String(next.months || cfg.months || "1");
  const r = await renewClient(lookup.clientId, months);
  await reportResult(cfg.token, next.id, r.ok, r.msg, r.status);
  await pushHistory({ panel: "p2cine", name, username: next.username, months, ok: r.ok, msg: r.msg });
  await log(`${name} (id=${lookup.clientId}, ${months}m): ${r.msg}`, r.ok ? "ok" : "fail");

  if (r.ok) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "P2Cine renovado",
      message: `${name}`,
    });
  }
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

async function keepAlive() {
  const r = await runInPanel(async () => {
    try {
      const body = new URLSearchParams();
      body.set("draw", "1");
      body.set("start", "0");
      body.set("length", "1");
      body.set("search[value]", "__keepalive__");
      body.set("search[regex]", "false");
      const res = await fetch("/clients/api/?get_clients", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json, text/javascript, */*; q=0.01",
        },
        body: body.toString(),
      });
      return { status: res.status, ok: res.ok };
    } catch (e) { return { error: String(e?.message || e) }; }
  }, [], false);
  await chrome.storage.local.set({ lastKeepAlive: new Date().toISOString(), lastKeepAliveResult: JSON.stringify(r) });
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
  // P2Cine: tenta encontrar aba SEM abrir automaticamente
  let p2cineLogged = false, p2cineOpen = false;
  const p2Tabs = await chrome.tabs.query({ url: ["https://daily3.news/*", "https://*.daily3.news/*"] });
  p2cineOpen = p2Tabs.length > 0;
  if (p2cineOpen) {
    const r = await runInPanel(async () => {
      try {
        const body = new URLSearchParams();
        body.set("draw", "1"); body.set("start", "0"); body.set("length", "1");
        body.set("search[value]", "__ping__"); body.set("search[regex]", "false");
        const res = await fetch("/clients/api/?get_clients", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
          body: body.toString(),
        });
        const t = await res.text();
        const lower = t.toLowerCase();
        if (res.status === 401 || res.status === 403 || lower.includes('name="password"')) return { logged: false };
        return { logged: res.ok };
      } catch { return { logged: false }; }
    }, [], false);
    p2cineLogged = !!r?.logged;
  }

  // Uniplay: verifica token no localStorage
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
    p2cine: { open: p2cineOpen, logged: p2cineLogged },
    uniplay: { open: uniplayOpen, logged: uniplayLogged },
    checkedAt: new Date().toISOString(),
  };
  const prev = (await chrome.storage.local.get({ panelsStatus: null })).panelsStatus;
  await chrome.storage.local.set({ panelsStatus: status });

  // Notificacoes de expiracao (transicoes logged -> not logged)
  if (prev?.p2cine?.logged && !p2cineLogged && p2cineOpen) {
    notifyOnce("p2cine_out", "Sessao P2Cine expirou", "Faca login novamente em daily3.news para retomar as renovacoes.");
  }
  if (prev?.uniplay?.logged && !uniplayLogged && uniplayOpen) {
    notifyOnce("uniplay_out", "Sessao Uniplay expirou", "Faca login novamente em searchdefense.top para retomar as renovacoes.");
  }
  // Se nao ha aba aberta E ha renovacoes pendentes, avisa 1x
  const cfg = await getConfig();
  if (cfg.enabled && cfg.token && (!p2cineOpen || !uniplayOpen)) {
    try {
      const next = (await fetchNext(cfg.token)).item;
      if (next) {
        if (next.panel_type === "uniplay" && !uniplayOpen) {
          notifyOnce("uniplay_notab", "Uniplay: abra o painel", "Ha renovacao pendente. Abra searchdefense.top e faca login.");
        } else if (next.panel_type !== "uniplay" && !p2cineOpen) {
          notifyOnce("p2cine_notab", "P2Cine: abra o painel", "Ha renovacao pendente. Abra daily3.news e faca login.");
        }
      }
    } catch {}
  }
  return status;
}

async function openPanels() {
  const opened = [];
  const p2 = await chrome.tabs.query({ url: ["https://daily3.news/*", "https://*.daily3.news/*"] });
  if (p2.length === 0) { await chrome.tabs.create({ url: CLIENTS_PAGE, active: false }); opened.push("p2cine"); }
  const up = await chrome.tabs.query({ url: UNIPLAY_PANEL_URLS });
  if (up.length === 0) { await chrome.tabs.create({ url: UNIPLAY_PANEL_URL, active: false }); opened.push("uniplay"); }
  return { opened };
}

function setupAlarms() {
  chrome.alarms.create("p2cine-tick", { periodInMinutes: POLL_SECONDS / 60 });
  chrome.alarms.create("p2cine-update", { periodInMinutes: 60 });
  chrome.alarms.create("p2cine-keepalive", { periodInMinutes: 3 });
  chrome.alarms.create("p2cine-status", { periodInMinutes: 2 });
}

chrome.runtime.onInstalled.addListener(() => { setupAlarms(); checkForUpdate(); keepAlive(); checkPanelsStatus(); });
chrome.runtime.onStartup.addListener(() => { setupAlarms(); checkForUpdate(); keepAlive(); checkPanelsStatus(); });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "p2cine-tick") tick();
  if (a.name === "p2cine-update") checkForUpdate();
  if (a.name === "p2cine-keepalive") keepAlive();
  if (a.name === "p2cine-status") checkPanelsStatus();
});

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type === "run-now") { tick().then(() => send({ ok: true })); return true; }
  if (msg?.type === "open-panels") { openPanels().then((r) => send(r)); return true; }
  if (msg?.type === "check-status") { checkPanelsStatus().then((s) => send(s)); return true; }
  if (msg?.type === "check-update") { checkForUpdate().then(() => send({ ok: true })); return true; }
});
