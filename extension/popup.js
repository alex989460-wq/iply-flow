const fields = ["token", "months"];

function paintStatus(status) {
  const s = status || {};
  const set = (dotId, txtId, entry) => {
    const dot = document.getElementById(dotId);
    const txt = document.getElementById(txtId);
    if (!entry) { dot.className = "dot pending"; txt.className = "warn"; txt.textContent = "verificando..."; return; }
    if (entry.logged) { dot.className = "dot on"; txt.className = "ok"; txt.textContent = "logado"; }
    else if (entry.open) { dot.className = "dot off"; txt.className = "bad"; txt.textContent = "deslogado - refaca login"; }
    else { dot.className = "dot off"; txt.className = "bad"; txt.textContent = "aba fechada"; }
  };
  set("dot-p2", "txt-p2", s.p2cine);
  set("dot-up", "txt-up", s.uniplay);
}

function fmtWhen(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function paintHistory(list) {
  const box = document.getElementById("histList");
  if (!list || list.length === 0) {
    box.innerHTML = '<div class="hist-empty">Nenhuma renovacao ainda.</div>';
    return;
  }
  box.innerHTML = list.map((h) => {
    const tag = (h.panel || "").toUpperCase();
    const statusCls = h.ok ? "ok" : "bad";
    const statusTxt = h.ok ? "OK" : "FALHA";
    const months = h.months ? ` &middot; ${h.months}m` : "";
    const name = (h.name || h.username || "-").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    const msg = (h.msg || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    return `<div class="hist-item">
      <div class="top">
        <span><span class="tag">${tag}</span><span class="name">${name}</span><span class="${statusCls}"> &middot; ${statusTxt}</span>${months}</span>
        <span class="when">${fmtWhen(h.at)}</span>
      </div>
      <div class="msg">${msg}</div>
    </div>`;
  }).join("");
}

async function load() {
  const cfg = await chrome.storage.local.get({
    token: "", months: "1", enabled: false,
    lastRun: null, lastResult: "-", successCount: 0, failCount: 0,
    lastDebug: "", updateAvailable: null, updateUrl: "", panelsStatus: null,
    history: [],
  });
  for (const f of fields) document.getElementById(f).value = cfg[f];
  document.getElementById("enabled").checked = cfg.enabled;
  document.getElementById("lastRun").textContent = cfg.lastRun ? new Date(cfg.lastRun).toLocaleString() : "-";
  document.getElementById("lastResult").textContent = cfg.lastResult || "-";
  document.getElementById("okCount").textContent = cfg.successCount;
  document.getElementById("failCount").textContent = cfg.failCount;
  document.getElementById("debug").textContent = cfg.lastDebug || "";
  paintStatus(cfg.panelsStatus);
  paintHistory(cfg.history);
  if (cfg.updateAvailable) {
    document.getElementById("updateBox").style.display = "block";
    document.getElementById("newVer").textContent = cfg.updateAvailable;
    document.getElementById("dlLink").href = cfg.updateUrl || "#";
  }
}

chrome.runtime.sendMessage({ type: "check-update" }, () => {});
chrome.runtime.sendMessage({ type: "check-status" }, (s) => { if (s) paintStatus(s); });

document.getElementById("save").addEventListener("click", async () => {
  const data = { enabled: document.getElementById("enabled").checked };
  for (const f of fields) data[f] = document.getElementById(f).value.trim();
  await chrome.storage.local.set(data);
  document.getElementById("save").textContent = "Salvo!";
  setTimeout(() => (document.getElementById("save").textContent = "Salvar"), 1200);
});

document.getElementById("run").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "run-now" }, () => load());
});

document.getElementById("clearHist").addEventListener("click", async () => {
  await chrome.storage.local.set({ history: [] });
  paintHistory([]);
});

document.getElementById("openPanels").addEventListener("click", () => {
  const btn = document.getElementById("openPanels");
  btn.disabled = true;
  btn.textContent = "Abrindo...";
  const reset = () => { btn.disabled = false; btn.textContent = "Abrir paineis em segundo plano"; };
  chrome.runtime.sendMessage({ type: "open-panels" }, () => {
    if (chrome.runtime.lastError) { reset(); return; }
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "check-status" }, (s) => { if (s) paintStatus(s); reset(); });
    }, 3000);
  });
  setTimeout(reset, 8000);
});

// Live-refresh when history/status is updated by the service worker
chrome.storage.onChanged.addListener((changes) => {
  if (changes.history) paintHistory(changes.history.newValue || []);
  if (changes.panelsStatus) paintStatus(changes.panelsStatus.newValue);
});

load();
