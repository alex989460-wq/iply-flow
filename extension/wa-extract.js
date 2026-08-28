/* SuperGestor — extrator de contatos de grupos no WhatsApp Web.
 * Fluxo: clique em "Buscar grupos" > escolha o grupo na lista > "Extrair membros".
 * A extensão abre o grupo, abre a lista de participantes e coleta apenas os
 * membros (ignora administradores e você mesmo).
 */
(() => {
  const ENDPOINT = 'https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/whatsapp-group-extract';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwaHFmZ3hmZWF5bGxkcHhqcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTYwMDAsImV4cCI6MjA4MjU3MjAwMH0.PsIJenRZEAWTlxbdGYvJWrBUfiIifPn9Q_UVeUyrFs8';

  if (window.__sgWaExtract) return;
  window.__sgWaExtract = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
  const isPhoneLike = (s) => /^\+?\d[\d\s().-]+$/.test(norm(s));
  const ADMIN_RX = /(admin|administrador|administrator|superadmin)/i;
  const YOU_RX = /^(você|voce|you)$/i;

  const paneSide = () => document.querySelector('#pane-side');

  function clickEl(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
    return true;
  }

  function byText(root, regex, selector = 'div,span,button,li') {
    return Array.from((root || document).querySelectorAll(selector))
      .find((el) => regex.test(norm(el.textContent)) && el.children.length <= 3) || null;
  }

  // ---------- Lista de grupos abertos ----------
  async function applyGroupFilter() {
    const btn = Array.from(document.querySelectorAll('button,div[role="button"]'))
      .find((el) => /^grupos$/i.test(norm(el.textContent)) || /grupos/i.test(el.getAttribute('aria-label') || ''));
    if (btn) { clickEl(btn); await sleep(700); return true; }
    return false;
  }

  async function scanGroups() {
    await applyGroupFilter();
    const pane = paneSide();
    if (!pane) return [];
    const seen = new Map();
    let last = -1;
    for (let i = 0; i < 40; i++) {
      pane.querySelectorAll('[role="listitem"]').forEach((row) => {
        const title = norm(row.querySelector('span[title]')?.getAttribute('title') || '');
        if (!title || isPhoneLike(title)) return;
        if (!seen.has(title)) seen.set(title, true);
      });
      pane.scrollTop = pane.scrollTop + pane.clientHeight * 0.85;
      await sleep(200);
      if (pane.scrollTop === last) break;
      last = pane.scrollTop;
    }
    pane.scrollTop = 0;
    return Array.from(seen.keys()).sort((a, b) => a.localeCompare(b));
  }

  // ---------- Abrir grupo + lista de participantes ----------
  async function openChat(title) {
    const pane = paneSide();
    if (!pane) throw new Error('Lista de conversas não encontrada');
    let last = -1;
    for (let i = 0; i < 60; i++) {
      const row = Array.from(pane.querySelectorAll('[role="listitem"]'))
        .find((r) => norm(r.querySelector('span[title]')?.getAttribute('title')) === title);
      if (row) { clickEl(row.querySelector('span[title]') || row); await sleep(1200); return true; }
      pane.scrollTop = pane.scrollTop + pane.clientHeight * 0.85;
      await sleep(220);
      if (pane.scrollTop === last) break;
      last = pane.scrollTop;
    }
    throw new Error('Grupo não encontrado na lista');
  }

  async function openParticipants() {
    // abre "Dados do grupo"
    const header = document.querySelector('#main header');
    clickEl(header?.querySelector('span[title]') || header);
    await sleep(1400);

    // clica em "Ver tudo" / "xx membros"
    const drawer = document.querySelector('[data-testid="drawer-right"], #app > div > div > span > div, [role="dialog"]') || document;
    const seeAll = byText(document, /^(ver tudo|ver todos|see all)$/i) || byText(document, /\d+\s+(membros|participantes|members)/i);
    if (seeAll) { clickEl(seeAll.closest('div[role="button"],button,li') || seeAll); await sleep(1400); }
    return drawer;
  }

  function membersContainer() {
    const main = document.querySelector('#main');
    const pane = paneSide();
    const candidates = Array.from(document.querySelectorAll('div'))
      .filter((el) => {
        if (main?.contains(el) || pane?.contains(el) || el.contains(main)) return false;
        if (el.clientHeight < 150) return false;
        return el.querySelectorAll('[role="listitem"]').length >= 3;
      });
    // prefere o mais interno que rola
    const scrollables = candidates.filter((el) => el.scrollHeight > el.clientHeight + 40);
    const pick = (scrollables.length ? scrollables : candidates)
      .sort((a, b) => a.querySelectorAll('div').length - b.querySelectorAll('div').length)[0];
    return pick || null;
  }

  function harvest(container, map) {
    container.querySelectorAll('[role="listitem"]').forEach((row) => {
      const text = norm(row.innerText);
      if (ADMIN_RX.test(text)) return; // ignora administradores
      const titled = norm(row.querySelector('span[title]')?.getAttribute('title') || '');
      const lines = text.split('\n').map(norm).filter(Boolean);
      const label = titled || lines[0] || '';
      if (YOU_RX.test(label)) return;

      const phoneSource = [titled, ...lines].find((l) => isPhoneLike(l) && l.replace(/\D/g, '').length >= 10);
      if (!phoneSource) return;
      const digits = phoneSource.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) return;

      const name = [titled, ...lines]
        .map((l) => l.replace(/^~\s*/, ''))
        .find((l) => l && !isPhoneLike(l) && !ADMIN_RX.test(l) && !YOU_RX.test(l) && !/^\d+$/.test(l)) || '';
      const prev = map.get(digits);
      map.set(digits, name || prev || '');
    });
  }

  async function collectMembers(statusEl) {
    const map = new Map();
    let container = membersContainer();
    if (!container) throw new Error('Lista de participantes não encontrada — abra "Ver tudo"');
    harvest(container, map);
    let last = -1;
    for (let i = 0; i < 400; i++) {
      container = membersContainer() || container;
      const scroller = container.scrollHeight > container.clientHeight + 40
        ? container
        : container.closest('div[style*="overflow"]') || container;
      scroller.scrollTop = scroller.scrollTop + scroller.clientHeight * 0.8;
      await sleep(240);
      harvest(container, map);
      statusEl.textContent = `Coletando... ${map.size} membros`;
      if (scroller.scrollTop === last) break;
      last = scroller.scrollTop;
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

  // ---------- UI ----------
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:99999;right:16px;bottom:16px;background:#111b21;color:#e9edef;border:1px solid #2a3942;border-radius:12px;padding:12px;font:13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.4);width:260px';
  box.innerHTML = `<div style="font-weight:600;margin-bottom:8px">SuperGestor — Grupos</div>
    <button id="sg-scan" style="width:100%;padding:8px;border:0;border-radius:8px;background:#2a3942;color:#e9edef;font-weight:600;cursor:pointer">Buscar grupos</button>
    <select id="sg-groups" style="width:100%;margin-top:8px;padding:7px;border-radius:8px;border:1px solid #2a3942;background:#0b141a;color:#e9edef;font-size:12px"><option value="">Nenhum grupo carregado</option></select>
    <button id="sg-extract" style="width:100%;margin-top:8px;padding:8px;border:0;border-radius:8px;background:#00a884;color:#fff;font-weight:600;cursor:pointer">Extrair membros</button>
    <div id="sg-status" style="margin-top:8px;opacity:.8;font-size:12px">Clique em "Buscar grupos"</div>
    <button id="sg-reset" style="margin-top:8px;width:100%;padding:4px;border:0;border-radius:6px;background:#2a3942;color:#8696a0;font-size:11px;cursor:pointer">Trocar token</button>`;
  document.documentElement.appendChild(box);

  const statusEl = box.querySelector('#sg-status');
  const select = box.querySelector('#sg-groups');

  box.querySelector('#sg-reset').onclick = () => chrome.storage.local.remove('sgExtractToken', () => {
    statusEl.textContent = 'Token removido';
  });

  box.querySelector('#sg-scan').onclick = async () => {
    statusEl.textContent = 'Procurando grupos...';
    try {
      const groups = await scanGroups();
      select.innerHTML = groups.length
        ? groups.map((g) => `<option value="${g.replace(/"/g, '&quot;')}">${g}</option>`).join('')
        : '<option value="">Nenhum grupo encontrado</option>';
      statusEl.textContent = groups.length ? `${groups.length} grupos encontrados` : 'Nenhum grupo encontrado';
    } catch (e) {
      statusEl.textContent = `Erro: ${e.message}`;
    }
  };

  box.querySelector('#sg-extract').onclick = async () => {
    const group = select.value;
    if (!group) { statusEl.textContent = 'Selecione um grupo'; return; }
    try {
      const token = await getToken();
      if (!token) return;
      statusEl.textContent = 'Abrindo grupo...';
      await openChat(group);
      statusEl.textContent = 'Abrindo participantes...';
      await openParticipants();
      const contacts = await collectMembers(statusEl);
      if (!contacts.length) { statusEl.textContent = 'Nenhum membro encontrado'; return; }
      statusEl.textContent = `Enviando ${contacts.length}...`;
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-extract-token': token },
        body: JSON.stringify({ action: 'import', token, group_name: group, contacts }),
      });
      const data = await res.json().catch(() => ({}));
      statusEl.textContent = data.error ? `Erro: ${data.error}` : `Importados: ${data.imported} (${group})`;
    } catch (e) {
      statusEl.textContent = `Erro: ${e.message}`;
    }
  };
})();
