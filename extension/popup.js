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

async function load() {
  const cfg = await chrome.storage.local.get({
    token: "", months: "1", enabled: false,
    lastRun: null, lastResult: "-", successCount: 0, failCount: 0,
    lastDebug: "", updateAvailable: null, updateUrl: "", panelsStatus: null,
  });
  for (const f of fields) document.getElementById(f).value = cfg[f];
  document.getElementById("enabled").checked = cfg.enabled;
  document.getElementById("lastRun").textContent = cfg.lastRun ? new Date(cfg.lastRun).toLocaleString() : "-";
  document.getElementById("lastResult").textContent = cfg.lastResult || "-";
  document.getElementById("okCount").textContent = cfg.successCount;
  document.getElementById("failCount").textContent = cfg.failCount;
  document.getElementById("debug").textContent = cfg.lastDebug || "";
  paintStatus(cfg.panelsStatus);
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

document.getElementById("openPanels").addEventListener("click", () => {
  const btn = document.getElementById("openPanels");
  btn.disabled = true;
  btn.textContent = "Abrindo...";
  const reset = () => { btn.disabled = false; btn.textContent = "Abrir paineis em segundo plano"; };
  chrome.runtime.sendMessage({ type: "open-panels" }, () => {
    if (chrome.runtime.lastError) { reset(); return; }
    // Aguarda paineis carregarem e revalida status; sempre restaura o botao.
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "check-status" }, (s) => { if (s) paintStatus(s); reset(); });
    }, 3000);
  });
  // Fallback: se por algum motivo o callback nao voltar, restaura em 8s.
  setTimeout(reset, 8000);
});

load();
