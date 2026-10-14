/* ZUI admin/revenda: gestor de playlists por aparelho + correções de toque no celular.
   Usa apenas a API do painel (PUT /api/admin/devices/:id/playlists e /source); não altera licenças. */
(function () {
  if (window.__zuiPlaylistManager) return; window.__zuiPlaylistManager = true;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (path, method, data) => api(path, method, data);
  const say = m => { try { toast(m); } catch { alert(m); } };
  const list = () => (typeof devices !== 'undefined' ? devices : []);
  const isAdmin = () => typeof user !== 'undefined' && user && user.role === 'admin';

  /* ---------- menus "•••" e janelas no celular ---------- */
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open) return;
    document.querySelectorAll('details[open]').forEach(o => { if (o !== d && !o.contains(d) && o.closest('#content')) o.open = false; });
  }, true);
  document.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target : null;
    document.querySelectorAll('#content details[open]').forEach(o => {
      if (!t || !o.contains(t) || (t.closest('button') && !t.closest('summary'))) o.open = false;
    });
    const modal = document.getElementById('modal');
    if (modal && t === modal && typeof closeModal === 'function') closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('#content details[open]').forEach(o => { o.open = false; });
    if (document.getElementById('zplBox')) closeBox();
    else if (typeof closeModal === 'function') closeModal();
  });

  /* ---------- botão "Playlists" em cada aparelho ---------- */
  function inject() {
    document.querySelectorAll('#content button[data-action="source"]').forEach(b => {
      const box = b.parentElement;
      if (!box || box.querySelector('[data-zpl]')) return;
      const d = list().find(x => x.id === b.dataset.id); const n = d ? (d.playlists || []).length : 0;
      const nb = document.createElement('button'); nb.type = 'button'; nb.dataset.zpl = b.dataset.id;
      nb.textContent = 'Ver playlists (' + n + ')'; box.insertBefore(nb, box.firstChild);
      const cell = b.closest('tr')?.children[3];
      if (cell && !cell.dataset.zplCell) { cell.dataset.zplCell = b.dataset.id; cell.classList.add('zpl-cell'); cell.title = 'Ver playlists'; }
    });
  }
  document.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target : null; if (!t) return;
    const b = t.closest('[data-zpl]') || t.closest('[data-zpl-cell]');
    if (b) { e.preventDefault(); e.stopPropagation(); open(b.dataset.zpl || b.dataset.zplCell); }
  }, true);
  const target = document.getElementById('content');
  if (target) new MutationObserver(inject).observe(target, { childList: true, subtree: true });
  inject();


  /* ---------- Servidores parceiros > Aparelhos: playlists e desativar ---------- */
  function injectPartner() {
    const t = document.getElementById('zpdt'); if (!t || t.dataset.zpl) return; t.dataset.zpl = '1';
    const rows = t.querySelectorAll('tr');
    rows.forEach((tr, i) => {
      const cell = document.createElement(i ? 'td' : 'th');
      if (!i) cell.textContent = 'Ações';
      else {
        const mac = tr.children[1]?.textContent.trim(), d = list().find(x => x.mac === mac);
        if (d) cell.innerHTML = '<div class="zpl-acts" style="justify-content:flex-start"><button type="button" data-zpl="' + esc(d.id) + '">Playlists (' + (d.playlists || []).length + ')</button><button type="button" data-zpl-en="' + esc(d.id) + '">' + (d.enabled ? 'Desativar' : 'Ativar') + '</button></div>';
      }
      tr.appendChild(cell);
    });
  }
  document.addEventListener('click', async e => {
    const b = e.target instanceof Element && e.target.closest('[data-zpl-en]'); if (!b) return;
    const d = list().find(x => x.id === b.dataset.zplEn); if (!d) return;
    if (d.enabled && !confirm('Desativar o aparelho ' + d.mac + '? Ele para de reproduzir até ser ativado de novo.')) return;
    b.disabled = true;
    try { await call('admin/devices/' + d.id + '/enabled', 'PUT', { enabled: !d.enabled }); d.enabled = !d.enabled; b.textContent = d.enabled ? 'Desativar' : 'Ativar'; say(d.enabled ? 'Aparelho ativado.' : 'Aparelho desativado.'); try { if (typeof refresh === 'function') refresh(); } catch {} }
    catch (err) { say(err.message); }
    b.disabled = false;
  });
  new MutationObserver(injectPartner).observe(document.body, { childList: true, subtree: true });

  /* ---------- gestor ---------- */
  let current = null;
  function closeBox() { document.getElementById('zplOverlay')?.remove(); document.body.classList.remove('zpl-lock'); current = null; }
  function describe(s) {
    if (!s) return 'Sem dados';
    if (s.type === 'm3u') return 'Link M3U' + (s.url ? ' · ' + s.url : '');
    return 'Xtream' + (s.serverCode ? ' · código ' + s.serverCode : (s.host ? ' · ' + s.host : '')) + (s.username ? ' · usuário ' + s.username : '');
  }
  function open(id) {
    const d = list().find(x => x.id === id); if (!d) return;
    current = d; closeBox(); current = d;
    const ov = document.createElement('div'); ov.id = 'zplOverlay'; ov.className = 'zpl-overlay';
    const pls = d.playlists || [];
    ov.innerHTML = '<div id="zplBox" class="zpl-box" role="dialog" aria-modal="true" aria-label="Playlists do aparelho">' +
      '<div class="zpl-head"><div><h2>Playlists</h2><p>' + esc(d.name) + ' · <code>' + esc(d.mac) + '</code></p></div><button type="button" class="zpl-x" data-zpl-close aria-label="Fechar">×</button></div>' +
      '<div class="zpl-body">' + (pls.length ? pls.map(p => {
        const s = p.source || {}, act = p.id === d.activePlaylistId;
        return '<div class="zpl-item' + (act ? ' on' : '') + '"><div class="zpl-info"><strong>' + esc(s.name || 'Playlist') + '</strong>' +
          (act ? '<span class="zpl-tag">Em uso na TV</span>' : '') + (p.protected ? '<span class="zpl-tag lock">Protegida pelo cliente</span>' : '') +
          '<small>' + esc(describe(s)) + '</small></div><div class="zpl-acts">' +
          (act ? '' : '<button type="button" data-zpl-do="select" data-p="' + esc(p.id) + '">Usar esta</button>') +
          ((p.protected && !isAdmin()) ? '' : '<button type="button" data-zpl-do="edit" data-p="' + esc(p.id) + '">Editar</button><button type="button" class="danger" data-zpl-do="remove" data-p="' + esc(p.id) + '">Excluir</button>') +
          '</div><div class="zpl-form" data-form="' + esc(p.id) + '" hidden></div></div>';
      }).join('') : '<p class="zpl-empty">Nenhuma playlist cadastrada neste aparelho.</p>') + '</div>' +
      '<div class="zpl-foot"><span>' + pls.length + '/10 playlists</span><button type="button" class="primary" data-zpl-do="add">+ Adicionar playlist</button></div></div>';
    document.body.appendChild(ov); document.body.classList.add('zpl-lock');
    ov.addEventListener('click', ev => {
      const t = ev.target instanceof Element ? ev.target : null; if (!t) return;
      if (t === ov || t.closest('[data-zpl-close]')) { closeBox(); return; }
      const b = t.closest('[data-zpl-do]'); if (!b) return;
      act(b.dataset.zplDo, b.dataset.p, b);
    });
  }
  async function reload(id) { try { if (typeof refresh === 'function') await refresh(); } catch {} const d = list().find(x => x.id === id); if (d && current) open(id); }
  async function act(kind, pid, btn) {
    const d = current; if (!d) return;
    const p = (d.playlists || []).find(x => x.id === pid);
    if (kind === 'add') { closeBox(); editSource(d, true); return; }
    if (kind === 'edit') return form(d, p);
    if (kind === 'remove') {
      if (!confirm('Excluir a playlist "' + ((p.source && p.source.name) || 'Playlist') + '" deste aparelho? A licença não muda.')) return;
    }
    btn.disabled = true;
    try { await call('admin/devices/' + d.id + '/playlists', 'PUT', { action: kind, playlistId: pid }); say(kind === 'select' ? 'Playlist selecionada. A TV atualiza em até 30 segundos.' : 'Playlist excluída.'); await reload(d.id); }
    catch (e) { say(e.message); btn.disabled = false; }
  }
  function form(d, p) {
    const box = document.querySelector('[data-form="' + CSS.escape(p.id) + '"]'); if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    const s = p.source || {}, code = s.type === 'xtream' && s.serverCode;
    box.innerHTML = '<label>Nome<input name="name" value="' + esc(s.name || '') + '"></label>' +
      (s.type === 'm3u'
        ? '<label>Novo link M3U <em>(em branco mantém o atual)</em><input name="url" type="url" inputmode="url"></label>'
        : (code ? '<label>Código do servidor<input name="serverCode" value="' + esc(s.serverCode) + '" inputmode="numeric"></label>'
                : '<label>Servidor<input name="host" type="url" value="' + esc(s.host || '') + '"></label>') +
          '<label>Usuário<input name="username" value="' + esc(s.username || '') + '" autocapitalize="off"></label>' +
          '<label>Nova senha <em>(em branco mantém a atual)</em><input name="password" type="password" autocomplete="new-password"></label>') +
      '<p class="zpl-err" role="alert"></p><div class="zpl-acts"><button type="button" data-cancel>Cancelar</button><button type="button" class="primary" data-save>Salvar</button></div>';
    box.hidden = false;
    box.querySelector('[data-cancel]').onclick = () => { box.hidden = true; };
    box.querySelector('[data-save]').onclick = async ev => {
      const v = n => box.querySelector('[name="' + n + '"]')?.value.trim() || '';
      let src;
      if (s.type === 'm3u') { src = { type: 'm3u', name: v('name') }; if (v('url')) src.url = v('url'); }
      else if (code) src = { type: 'xtream', name: v('name'), serverCode: v('serverCode'), username: v('username'), password: v('password') };
      else {
        let port; try { const u = new URL(v('host')); port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80); } catch { box.querySelector('.zpl-err').textContent = 'Servidor inválido.'; return; }
        src = { type: 'xtream', name: v('name'), host: v('host'), port, username: v('username'), password: v('password') };
      }
      if (!src.password) delete src.password;
      ev.target.disabled = true;
      try { await call('admin/devices/' + d.id + '/playlists', 'PUT', { action: 'edit', playlistId: p.id, source: src }); say('Playlist salva. A TV atualiza em até 30 segundos.'); await reload(d.id); }
      catch (e) { box.querySelector('.zpl-err').textContent = e.message; ev.target.disabled = false; }
    };
  }
})();
