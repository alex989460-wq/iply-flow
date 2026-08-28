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

  const waitFor = async (getter, timeout = 5000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const result = getter();
      if (result) return result;
      await sleep(150);
    }
    return null;
  };

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
    const btn = Array.from(document.querySelectorAll('button,div[role="button"],span[role="button"]'))
      .find((el) => /^(grupos|groups)$/i.test(norm(el.textContent)) || /^(grupos|groups)$/i.test(norm(el.getAttribute('aria-label'))));
    if (btn) { clickEl(btn); await sleep(700); return true; }
    return false;
  }

  function getChatRows(pane) {
    const selectors = [
      '[role="listitem"]',
      '[role="row"]',
      '[role="gridcell"]',
      '[data-testid="cell-frame-container"]',
      'div[tabindex="-1"]',
    ];
    const rows = [];
    for (const selector of selectors) {
      pane.querySelectorAll(selector).forEach((row) => {
        if (!rows.includes(row) && (row.querySelector('span[title]') || row.getAttribute('aria-label'))) rows.push(row);
      });
      if (rows.length) break;
    }
    return rows;
  }

  function rowTitle(row) {
    const titled = Array.from(row.querySelectorAll('span[title]'))
      .map((el) => norm(el.getAttribute('title')))
      .find((text) => text && !/^(foto|photo|imagem|image)$/i.test(text));
    return titled || norm(row.getAttribute('aria-label')) || norm(row.innerText.split('\n')[0]);
  }

  async function scanGroups() {
    const filtered = await applyGroupFilter();
    const pane = await waitFor(paneSide);
    if (!pane) return [];
    const seen = new Map();
    const scroller = pane.querySelector('[role="grid"]') || pane;
    const initialTop = scroller.scrollTop;
    scroller.scrollTop = 0;
    await sleep(300);
    let stableRounds = 0;
    let previousTop = -1;
    for (let i = 0; i < 100 && stableRounds < 3; i++) {
      getChatRows(pane).forEach((row) => {
        const title = rowTitle(row);
        if (!title || isPhoneLike(title)) return;
        if (!seen.has(title)) seen.set(title, true);
      });
      scroller.scrollTop += Math.max(320, scroller.clientHeight * 0.8);
      await sleep(250);
      stableRounds = scroller.scrollTop === previousTop ? stableRounds + 1 : 0;
      previousTop = scroller.scrollTop;
    }
    scroller.scrollTop = initialTop;
    // Com o filtro Grupos ativo, todas as linhas são grupos. Sem o filtro,
    // evitamos afirmar que conversas individuais são grupos.
    return filtered ? Array.from(seen.keys()).sort((a, b) => a.localeCompare(b)) : [];
  }

  // ---------- Abrir grupo + lista de participantes ----------
  async function openChat(title) {
    const pane = paneSide();
    if (!pane) throw new Error('Lista de conversas não encontrada');
    const scroller = pane.querySelector('[role="grid"]') || pane;
    scroller.scrollTop = 0;
    let last = -1;
    for (let i = 0; i < 60; i++) {
      const row = getChatRows(pane).find((r) => rowTitle(r) === title);
      if (row) { clickEl(row.querySelector('span[title]') || row); await sleep(1200); return true; }
      scroller.scrollTop += Math.max(320, scroller.clientHeight * 0.8);
      await sleep(220);
      if (scroller.scrollTop === last) break;
      last = scroller.scrollTop;
    }
    throw new Error('Grupo não encontrado na lista');
  }

  function expectedMemberCount() {
    const rx = /(\d[\d.\s]*)\s*(membros|participantes|members)/i;
    const el = Array.from(document.querySelectorAll('span,div,h2'))
      .find((e) => e.children.length <= 2 && rx.test(norm(e.textContent)));
    if (!el) return 0;
    const m = norm(el.textContent).match(rx);
    return m ? parseInt(m[1].replace(/\D/g, ''), 10) || 0 : 0;
  }

  function findSeeAll() {
    // "Ver tudo", "Ver tudo (mais 980)", "Ver todos", "See all", "View all"
    return Array.from(document.querySelectorAll('div[role="button"],button,span,li,div'))
      .find((el) => el.children.length <= 3
        && /^(ver tudo|ver todos|see all|view all)(\s*\(.*\))?$/i.test(norm(el.textContent))) || null;
  }

  async function openParticipants() {
    // abre "Dados do grupo"
    const header = document.querySelector('#main header');
    clickEl(header?.querySelector('span[title]') || header);
    await sleep(1600);

    // clica em "Ver tudo (mais N)" — pode aparecer com atraso
    for (let i = 0; i < 8; i++) {
      const seeAll = findSeeAll();
      if (seeAll) {
        clickEl(seeAll.closest('div[role="button"],button,li') || seeAll);
        await sleep(1600);
        break;
      }
      const membersRow = byText(document, /\d+\s*(membros|participantes|members)/i);
      if (i === 3 && membersRow) { clickEl(membersRow.closest('div[role="button"],button,li') || membersRow); await sleep(1400); }
      await sleep(400);
    }
    return document.querySelector('[data-testid="drawer-right"], [role="dialog"]') || document;
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

  function scrollerOf(container) {
    let el = container;
    for (let i = 0; i < 6 && el; i++) {
      if (el.scrollHeight > el.clientHeight + 40) return el;
      el = el.parentElement;
    }
    return container;
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
      if (prev && !name) return; // mantém o nome já capturado, sem duplicar
      map.set(digits, name || prev || '');
    });
  }

  async function collectMembers(statusEl) {
    const map = new Map();
    let container = await waitFor(membersContainer, 8000);
    if (!container) throw new Error('Lista de participantes não encontrada — abra "Ver tudo"');
    const expected = expectedMemberCount();
    harvest(container, map);

    let stable = 0;
    let lastSize = 0;
    for (let i = 0; i < 1200; i++) {
      container = membersContainer() || container;
      const scroller = scrollerOf(container);
      const before = scroller.scrollTop;
      scroller.scrollTop = before + Math.max(240, scroller.clientHeight * 0.7);
      await sleep(230);
      harvest(container, map);
      statusEl.textContent = expected
        ? `Coletando... ${map.size}/${expected} membros`
        : `Coletando... ${map.size} membros`;

      const atBottom = scroller.scrollTop === before
        || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5;
      const grew = map.size > lastSize;
      lastSize = map.size;

      if (grew) { stable = 0; continue; }
      if (atBottom) {
        stable += 1;
        // aguarda carregamento virtualizado antes de desistir
        await sleep(500);
        harvest(container, map);
        if (map.size > lastSize) { lastSize = map.size; stable = 0; continue; }
        if (stable >= 4) break;
      } else {
        stable = 0;
      }
    }

    // segunda passada de cima para baixo (lista virtualizada) para garantir 100%
    const scroller = scrollerOf(membersContainer() || container);
    scroller.scrollTop = 0;
    await sleep(400);
    for (let i = 0; i < 600; i++) {
      const c = membersContainer() || container;
      harvest(c, map);
      const s = scrollerOf(c);
      const before = s.scrollTop;
      s.scrollTop = before + Math.max(200, s.clientHeight * 0.5);
      await sleep(160);
      statusEl.textContent = expected
        ? `Revisando... ${map.size}/${expected} membros`
        : `Revisando... ${map.size} membros`;
      if (s.scrollTop === before && s.scrollTop + s.clientHeight >= s.scrollHeight - 5) break;
      if (expected && map.size >= expected) break;
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
  const box = document.createElement('section');
  box.id = 'sg-wa-extractor';
  box.innerHTML = `<div class="sg-header"><div class="sg-mark">SG</div><div class="sg-heading"><div class="sg-title">Extrator de grupos</div><div class="sg-subtitle">SuperGestor para WhatsApp Web</div></div><button id="sg-minimize" class="sg-icon" title="Minimizar">−</button></div>
    <div class="sg-body"><span class="sg-label">Grupo para extração</span>
    <button id="sg-scan" class="sg-secondary" style="width:100%">Atualizar lista de grupos</button>
    <select id="sg-groups"><option value="">Clique em atualizar</option></select>
    <div class="sg-row"><button id="sg-extract" class="sg-primary">Extrair membros</button><button id="sg-reset" class="sg-secondary" title="Trocar token">Token</button></div>
    <div id="sg-status" class="sg-status" data-kind="idle"><i class="sg-dot"></i><span>Selecione “Grupos” no WhatsApp ou clique em atualizar.</span></div>
    <div class="sg-progress"><i id="sg-progress"></i></div>
    <div class="sg-footer"><span id="sg-count">0 grupos carregados</span><span>Admins não são extraídos</span></div></div>`;
  document.documentElement.appendChild(box);

  const statusEl = box.querySelector('#sg-status');
  const statusText = statusEl.querySelector('span');
  const progressEl = box.querySelector('#sg-progress');
  const countEl = box.querySelector('#sg-count');
  const select = box.querySelector('#sg-groups');
  const scanButton = box.querySelector('#sg-scan');
  const extractButton = box.querySelector('#sg-extract');
  const setStatus = (text, kind = 'idle', progress = 0) => {
    statusText.textContent = text;
    statusEl.dataset.kind = kind;
    progressEl.style.width = `${progress}%`;
  };
  const escapeOption = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  box.querySelector('#sg-minimize').onclick = (event) => {
    box.classList.toggle('sg-minimized');
    event.currentTarget.textContent = box.classList.contains('sg-minimized') ? '+' : '−';
  };

  box.querySelector('#sg-reset').onclick = () => chrome.storage.local.remove('sgExtractToken', () => {
    setStatus('Token removido. Um novo será solicitado na extração.', 'ok');
  });

  scanButton.onclick = async () => {
    scanButton.disabled = true;
    setStatus('Aplicando filtro e procurando todos os grupos...', 'busy', 25);
    try {
      const groups = await scanGroups();
      select.innerHTML = groups.length
        ? groups.map((g) => `<option value="${escapeOption(g)}">${escapeOption(g)}</option>`).join('')
        : '<option value="">Nenhum grupo encontrado</option>';
      countEl.textContent = `${groups.length} ${groups.length === 1 ? 'grupo carregado' : 'grupos carregados'}`;
      setStatus(groups.length ? `${groups.length} grupos prontos para seleção.` : 'Não consegui ativar o filtro Grupos. Clique em “Grupos” no WhatsApp e tente novamente.', groups.length ? 'ok' : 'error', groups.length ? 100 : 0);
    } catch (e) {
      setStatus(`Erro ao buscar grupos: ${e.message}`, 'error');
    } finally {
      scanButton.disabled = false;
    }
  };

  extractButton.onclick = async () => {
    const group = select.value;
    if (!group) { setStatus('Selecione um grupo antes de extrair.', 'error'); return; }
    extractButton.disabled = true;
    try {
      const token = await getToken();
      if (!token) return;
      setStatus(`Abrindo “${group}”...`, 'busy', 20);
      await openChat(group);
      setStatus('Abrindo lista completa de participantes...', 'busy', 40);
      await openParticipants();
      const contacts = await collectMembers({ set textContent(value) { setStatus(value, 'busy', 65); } });
      if (!contacts.length) { setStatus('Nenhum membro comum encontrado. Administradores são ignorados.', 'error'); return; }
      setStatus(`Salvando ${contacts.length} contatos...`, 'busy', 85);
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-extract-token': token },
        body: JSON.stringify({ action: 'import', token, group_name: group, contacts }),
      });
      const data = await res.json().catch(() => ({}));
      setStatus(data.error ? `Erro: ${data.error}` : `${data.imported || contacts.length} membros importados de “${group}”.`, data.error ? 'error' : 'ok', data.error ? 0 : 100);
    } catch (e) {
      setStatus(`Erro: ${e.message}`, 'error');
    } finally {
      extractButton.disabled = false;
    }
  };
})();
