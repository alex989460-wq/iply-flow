/* zui-admin-insights: presentation and filtering only. Uses the device list the
   panel already loaded; every action button keeps the original data-action. */
(() => {
  'use strict';
  if (typeof render !== 'function' || typeof table !== 'function') return;
  const DAY = 86400000, KEY = 'zuiAdminFilters';
  const defaults = { status: '', kind: '', platform: '', conn: '', due: '', reseller: '', sort: 'recent', per: 25 };
  let f; try { f = { ...defaults, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') }; } catch { f = { ...defaults }; }
  let zp = 0, lastQuery = '';
  const save = () => sessionStorage.setItem(KEY, JSON.stringify(f));
  const online = d => Date.now() - (d.lastSeenAt || 0) < 90000;
  const plat = d => { const p=String(d.platform||'').toLowerCase(); return /roku/.test(p)?'roku':/webos|lgwebos/.test(p)?'webos':/tizen|samsung/.test(p)?'tizen':/android/.test(p)?'android':/fire/.test(p)?'firetv':/ios|iphone|ipad/.test(p)?'ios':/web|browser/.test(p)?'browser':'outro'; };
  const platName = p => ({ webos: 'LG webOS', lg: 'LG webOS', roku: 'Roku TV', tizen: 'Samsung Tizen', samsung: 'Samsung Tizen', android: 'Android', androidtv: 'Android TV', web: 'Navegador', browser: 'Navegador', ios: 'iPhone / iPad', firetv: 'Fire TV', outro: 'Outro aparelho' }[p] || p.toUpperCase());
  const lic = d => d.license || {};
  const exp = d => Number(lic(d).expiresAt || 0);
  const date = t => t ? new Date(t).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '—';
  const ago = t => { if (!t) return 'Nunca'; const m = Math.round((Date.now() - t) / 60000); if (m < 2) return 'agora'; if (m < 60) return m + ' min'; const h = Math.round(m / 60); if (h < 48) return h + ' h'; return Math.round(h / 24) + ' dias'; };
  const statusLabel = { active: 'Ativa', trial: 'Teste', expired: 'Vencida', disabled: 'Desativada' };
  const kindLabel = { paid: 'Paga', partner: 'Código parceiro', trial: 'Teste grátis' };
  const opt = (v, label, cur) => '<option value="' + E(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + E(label) + '</option>';
  const sel = (id, label, cur, opts) => '<label class="zf"><span>' + label + '</span><select id="' + id + '">' + opts.map(o => opt(o[0], o[1], cur)).join('') + '</select></label>';

  function apply(list) {
    const now = Date.now();
    let out = list.filter(d => {
      const l = lic(d), e = exp(d);
      if (f.status && l.status !== f.status) return false;
      if (f.kind && l.activationKind !== f.kind) return false;
      if (f.platform && plat(d) !== f.platform) return false;
      if (f.conn === 'on' && !online(d)) return false;
      if (f.conn === 'off' && online(d)) return false;
      if (f.conn === 'week' && !(now - (d.lastSeenAt || 0) < 7 * DAY)) return false;
      if (f.conn === 'stale' && now - (d.lastSeenAt || 0) < 30 * DAY) return false;
      if (f.due === 'expired' && !(l.status === 'expired')) return false;
      if (['3', '7', '30'].includes(f.due) && !(e > now && e - now <= Number(f.due) * DAY)) return false;
      if (f.due === 'nolist' && d.source) return false;
      if (f.reseller === 'admin' && d.resellerId) return false;
      if (f.reseller && f.reseller !== 'admin' && d.resellerId !== f.reseller) return false;
      return true;
    });
    const by = { recent: (a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0), created: (a, b) => (b.createdAt || 0) - (a.createdAt || 0), due: (a, b) => (exp(a) || Infinity) - (exp(b) || Infinity), name: (a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR') }[f.sort];
    if (by) out = out.slice().sort(by);
    return out;
  }

  function rows(list) {
    return list.map(d => {
      const l = lic(d), e = exp(d), days = l.remainingDays, warn = l.status === 'expired' ? 'off' : (days != null && days <= 3 ? 'warn' : '');
      return '<tr><td><strong>' + E(d.name) + '</strong><div class="sourcehint">' + E(platName(plat(d))) + ' · ' + (d.identityKind === 'hardware' ? 'MAC da TV' : 'MAC virtual') + '</div></td>' +
        '<td><code>' + E(d.mac) + '</code></td>' +
        '<td><span class="' + (online(d) ? 'online' : 'muted') + '">' + (online(d) ? '● Online' : 'Offline') + '</span><div class="sourcehint">' + ago(d.lastSeenAt) + '</div></td>' +
        '<td>' + E(d.source?.name || 'Não configurada') + '<div class="sourcehint">' + E(d.source?.type?.toUpperCase() || 'Aguardando lista') + ((d.playlists || []).length > 1 ? ' · ' + d.playlists.length + ' listas' : '') + '</div></td>' +
        '<td><span class="zlic ' + warn + '">' + E(statusLabel[l.status] || l.status || '—') + '</span><div class="sourcehint">' + E(kindLabel[l.activationKind] || '') + (e ? ' · vence ' + date(e) + (days != null ? ' (' + days + 'd)' : '') : l.activationKind === 'partner' ? ' · conforme a playlist' : '') + '</div></td>' +
        '<td><span class="status ' + (d.enabled ? '' : 'off') + '"><i class="dot"></i>' + (d.enabled ? 'Ativo' : 'Desativado') + '</span></td>' +
        '<td><details class="zp-device-actions"><summary aria-label="Ações do aparelho">•••</summary><div><button data-action="source" data-id="' + E(d.id) + '">Editar playlist</button> <button data-action="addSource" data-id="' + E(d.id) + '">Adicionar playlist</button> <button data-action="details" data-id="' + E(d.id) + '">Detalhes</button> <button data-action="license" data-id="' + E(d.id) + '">' + (user.role === 'reseller' ? 'Ativar com créditos' : 'Licença') + '</button> <button data-action="enabled" data-id="' + E(d.id) + '">' + (d.enabled ? 'Desativar' : 'Ativar') + '</button></div></details></td></tr>';
    }).join('');
  }
  const head = '<div class="tablewrap"><table><thead><tr><th>Dispositivo</th><th>MAC do aplicativo</th><th>Conexão</th><th>Playlist</th><th>Licença</th><th>Status</th><th>Ações</th></tr></thead><tbody>';

  function filtersBar(total, shown) {
    const plats = [...new Set(devices.map(plat))].sort();
    const resellers = typeof users !== 'undefined' && user.role === 'admin' ? users.filter(u => u.role === 'reseller') : [];
    return '<div class="zfilters card">' +
      sel('zfStatus', 'Situação', f.status, [['', 'Todas'], ['active', 'Ativa'], ['trial', 'Teste'], ['expired', 'Vencida'], ['disabled', 'Desativada']]) +
      sel('zfKind', 'Tipo de licença', f.kind, [['', 'Todos'], ['paid', 'Paga'], ['partner', 'Código parceiro'], ['trial', 'Teste grátis']]) +
      sel('zfPlatform', 'Aparelho', f.platform, [['', 'Todos']].concat(plats.map(p => [p, platName(p)]))) +
      sel('zfConn', 'Conexão', f.conn, [['', 'Todas'], ['on', 'Online agora'], ['off', 'Offline'], ['week', 'Acessou em 7 dias'], ['stale', 'Sem acesso há 30+ dias']]) +
      sel('zfDue', 'Vencimento', f.due, [['', 'Qualquer'], ['3', 'Vence em até 3 dias'], ['7', 'Vence em até 7 dias'], ['30', 'Vence em até 30 dias'], ['expired', 'Já vencidos'], ['nolist', 'Sem playlist']]) +
      (resellers.length ? sel('zfReseller', 'Revendedor', f.reseller, [['', 'Todos'], ['admin', 'Administrador']].concat(resellers.map(u => [u.id, u.name]))) : '') +
      sel('zfSort', 'Ordenar por', f.sort, [['recent', 'Último acesso'], ['created', 'Cadastro mais novo'], ['due', 'Vencimento mais próximo'], ['name', 'Nome']]) +
      sel('zfPer', 'Por página', f.per, [[10, '10'], [25, '25'], [50, '50'], [100, '100']]) +
      '<div class="zfcount"><strong>' + shown + '</strong> de ' + total + ' <button id="zfClear" type="button">Limpar filtros</button></div></div>';
  }

  table = function (list) {
    if (page === 'dashboard') {
      const recent = list.slice(0, 10);
      return head + (recent.length ? rows(recent) : '<tr><td colspan="7" class="empty">Nenhum dispositivo ainda.</td></tr>') + '</tbody></table></div>';
    }
    if (query !== lastQuery) { lastQuery = query; zp = 0; }
    const filtered = apply(list), per = Number(f.per) || 25, pages = Math.max(1, Math.ceil(filtered.length / per));
    zp = Math.min(zp, pages - 1);
    const current = filtered.slice(zp * per, (zp + 1) * per);
    return filtersBar(list.length, filtered.length) + head + (current.length ? rows(current) : '<tr><td colspan="7" class="empty">Nenhum dispositivo com esses filtros.</td></tr>') +
      '</tbody></table></div><div class="pagination"><button id="zPrev" ' + (zp === 0 ? 'disabled' : '') + '>Anterior</button><span>' + (zp + 1) + ' / ' + pages + '</span><button id="zNext" ' + (zp + 1 >= pages ? 'disabled' : '') + '>Próxima</button></div>';
  };

  function insights() {
    const now = Date.now(), L = devices.map(lic);
    const count = fn => L.filter(fn).length;
    const cards = [
      ['Total', devices.length, 'total', ''],
      ['Pagos', count(l => l.activationKind === 'paid' && l.status === 'active'), 'paid', 'kind:paid'],
      ['Código parceiro', count(l => l.activationKind === 'partner' && l.status === 'active'), 'partner', 'kind:partner'],
      ['Em teste', count(l => l.status === 'trial'), 'trial', 'status:trial'],
      ['Online agora', devices.filter(online).length, 'online', 'conn:on'],
      ['Vencem em 3 dias', devices.filter(d => exp(d) > now && exp(d) - now <= 3 * DAY).length, 'warn', 'due:3'],
      ['Vencidos', count(l => l.status === 'expired'), 'off', 'status:expired']
    ];
    const byPlat = {}; devices.forEach(d => { const p = plat(d); byPlat[p] = (byPlat[p] || 0) + 1; });
    const plats = Object.entries(byPlat).sort((a, b) => b[1] - a[1]);
    return '<div class="zcards">' + cards.map(c => '<button type="button" class="zcard z-' + c[2] + '" data-zgo="' + c[3] + '"><span>' + c[0] + '</span><strong>' + c[1] + '</strong></button>').join('') + '</div>' +
      '<h2 class="zh">Aparelhos por plataforma</h2><div class="zplats">' + plats.map(([p, n]) => '<button type="button" class="zplat" data-zgo="platform:' + E(p) + '"><span>' + E(platName(p)) + '</span><strong>' + n + '</strong><i style="width:' + Math.max(4, Math.round(n * 100 / devices.length)) + '%"></i></button>').join('') + '</div>';
  }

  function bind() {
    const map = { zfStatus: 'status', zfKind: 'kind', zfPlatform: 'platform', zfConn: 'conn', zfDue: 'due', zfReseller: 'reseller', zfSort: 'sort', zfPer: 'per' };
    for (const [id, k] of Object.entries(map)) { const el = document.getElementById(id); if (el) el.onchange = () => { f[k] = el.value; zp = 0; save(); render(); }; }
    const c = document.getElementById('zfClear'); if (c) c.onclick = () => { f = { ...defaults }; zp = 0; save(); render(); };
    const p = document.getElementById('zPrev'); if (p) p.onclick = () => { zp--; render(); };
    const n = document.getElementById('zNext'); if (n) n.onclick = () => { zp++; render(); };
    document.querySelectorAll('[data-zgo]').forEach(b => b.onclick = () => {
      f = { ...defaults, per: f.per }; const [k, v] = (b.dataset.zgo || '').split(':'); if (k) f[k] = v;
      zp = 0; save(); document.querySelector('button[data-page="devices"]')?.click();
    });
  }

  const previous = render;
  render = function () {
    previous();
    if (!user) return;
    if (page === 'dashboard') {
      const content = document.getElementById('content'), stats = content?.querySelector('.stats');
      content?.querySelector('.notice')?.remove();
      if (stats && !content.querySelector('.zcards')) stats.outerHTML = insights();
    }
    if (page === 'dashboard' || page === 'devices' || page === 'playlists') bind();
  };
  if (typeof user !== 'undefined' && user) render();
})();
