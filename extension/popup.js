const fields = ["token", "panelBase", "renewPath", "monthsParam", "monthsValue"];

async function load() {
  const cfg = await chrome.storage.local.get({
    token: "", panelBase: "https://daily3.news", renewPath: "/clients/renew",
    monthsParam: "months", monthsValue: "1", enabled: false,
    lastRun: null, lastResult: "-", successCount: 0, failCount: 0,
  });
  for (const f of fields) document.getElementById(f).value = cfg[f];
  document.getElementById("enabled").checked = cfg.enabled;
  document.getElementById("lastRun").textContent = cfg.lastRun ? new Date(cfg.lastRun).toLocaleString() : "-";
  document.getElementById("lastResult").textContent = cfg.lastResult || "-";
  document.getElementById("okCount").textContent = cfg.successCount;
  document.getElementById("failCount").textContent = cfg.failCount;
}

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

load();
