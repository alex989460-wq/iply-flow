/* SuperGestor — extrator de contatos de grupos no WhatsApp Web.
 * Abra o grupo > Dados do grupo > lista de participantes ("Ver tudo"),
 * depois clique em "Extrair contatos" no painel flutuante.
 */
(() => {
  const ENDPOINT = 'https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/whatsapp-group-extract';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwaHFmZ3hmZWF5bGxkcHhqcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTYwMDAsImV4cCI6MjA4MjU3MjAwMH0.PsIJenRZEAWTlxbdGYvJWrBUfiIifPn9Q_UVeUyrFs8';

  if (window.__sgWaExtract) return;
  window.__sgWaExtract = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function groupName() {
    const header = document.querySelector('header [role="button"] span[title]');
    return header?.getAttribute('title') || document.title.replace(/\s*\(\d+\)\s*/, '') || 'Grupo';
  }

  function scrollableList() {
    const candidates = Array.from(document.querySelectorAll('div'))
      .filter((el) => el.scrollHeight > el.clientHeight + 80 && el.clientHeight > 200);
    return candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null;
  }

  function harvest(map) {
    const text = document.body.innerText || '';
    const rows = document.querySelectorAll('[role="listitem"], [data-testid="cell-frame-container"]');
    const push = (phone, name) => {
      const d = String(phone || '').replace(/\D/g, '');
      if (d.length >= 10 && d.length <= 15) map.set(d, name || map.get(d) || '');
    };
    rows.forEach((row) => {
      const t = row.innerText || '';
      const m = t.match(/\+?\d[\d\s().-]{8,}\d/g) || [];
      const name = (t.split('\n')[0] || '').trim();
      m.forEach((p) => push(p, /\d/.test(name) ? '' : name));
    });
    (text.match(/\+\d[\d\s().-]{8,}\d/g) || []).forEach((p) => push(p, ''));
  }

  async function collect(statusEl) {
    const map = new Map();
    const list = scrollableList();
    harvest(map);
    if (list) {
      let last = -1;
      for (let i = 0; i < 200; i++) {
        list.scrollTop = list.scrollTop + list.clientHeight * 0.8;
        await sleep(220);
        harvest(map);
        statusEl.textContent = `Coletando... ${map.size} contatos`;
        if (list.scrollTop === last) break;
        last = list.scrollTop;
      }
    }
    return Array.from(map, ([phone, name]) => ({ phone, name }));
  }

  async function getToken() {
    const stored = await new Promise((r) => chrome.storage.local.get(['sgExtractToken'], (v) => r(v.sgExtractToken)));
    if (stored) return stored;
    const typed = prompt('Cole o token da extensão (Painel > Extrair Grupos):');
    if (typed) await new Promise((r) => chrome.storage.local.set({ sgExtractToken: typed.trim() }, r));
    return typed?.trim() || '';
  }

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:99999;right:16px;bottom:16px;background:#111b21;color:#e9edef;border:1px solid #2a3942;border-radius:12px;padding:12px;font:13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.4);width:230px';
  box.innerHTML = `<div style="font-weight:600;margin-bottom:6px">SuperGestor</div>
    <button id="sg-extract" style="width:100%;padding:8px;border:0;border-radius:8px;background:#00a884;color:#fff;font-weight:600;cursor:pointer">Extrair contatos</button>
    <div id="sg-status" style="margin-top:6px;opacity:.8;font-size:12px">Abra a lista de participantes</div>
    <button id="sg-reset" style="margin-top:6px;width:100%;padding:4px;border:0;border-radius:6px;background:#2a3942;color:#8696a0;font-size:11px;cursor:pointer">Trocar token</button>`;
  document.documentElement.appendChild(box);

  const statusEl = box.querySelector('#sg-status');
  box.querySelector('#sg-reset').onclick = () => chrome.storage.local.remove('sgExtractToken', () => {
    statusEl.textContent = 'Token removido';
  });

  box.querySelector('#sg-extract').onclick = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      statusEl.textContent = 'Coletando...';
      const contacts = await collect(statusEl);
      if (!contacts.length) { statusEl.textContent = 'Nenhum contato encontrado'; return; }
      statusEl.textContent = `Enviando ${contacts.length}...`;
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-extract-token': token },
        body: JSON.stringify({ action: 'import', token, group_name: groupName(), contacts }),
      });
      const data = await res.json().catch(() => ({}));
      statusEl.textContent = data.error ? `Erro: ${data.error}` : `Importados: ${data.imported}`;
    } catch (e) {
      statusEl.textContent = `Erro: ${e.message}`;
    }
  };
})();
