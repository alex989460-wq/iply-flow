/* zui-pool admin pages: ZUI Pool (count only), Servidores parceiros, Contatos. */
(() => {
  'use strict';
  if (typeof render !== 'function' || typeof api !== 'function') return;
  const MINE = {
    pool: ['ZUI Pool', 'Reproduções simultâneas por parceiro. Por enquanto só contamos — ninguém é bloqueado.'],
    'partner-servers': ['Servidores parceiros', 'Servidores atribuídos a revendedores: aparelhos, DNS e migração em massa.'],
    contacts: ['Contatos', 'Telegram, WhatsApp e e-mail de atendimento.']
  };
  const money = v => v == null ? 'Sob consulta' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
  const date = t => t ? new Date(t).toLocaleString('pt-BR') : '—';
  const esc = v => (typeof E === 'function' ? E(v) : String(v ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'));
  const content = () => document.getElementById('content');
  const err = e => '<div class="card"><p class="error">' + esc(e.message || e) + '</p></div>';

  function addNav() {
    const nav = document.querySelector('.sidebar nav'); if (!nav || nav.querySelector('[data-page="pool"]')) return;
    const after = nav.querySelector('[data-page="resellers"]') || nav.lastElementChild;
    const html = [['partner-servers', 'Servidores parceiros', '🛰', false], ['pool', 'ZUI Pool', '◎', false], ['contacts', 'Contatos', '✆', true]]
      .filter(x => !x[3] || user?.role === 'admin')
      .map(x => '<button data-page="' + x[0] + '" data-nav-icon="' + x[2] + '" data-zpool>' + x[1] + '</button>').join('');
    after.insertAdjacentHTML('afterend', html);
    nav.querySelectorAll('[data-zpool]').forEach(b => b.addEventListener('click', ev => { ev.preventDefault(); ev.stopImmediatePropagation(); page = b.dataset.page; render(); document.body.classList.remove('panel-nav-open'); }, true));
  }

  const previous = render;
  render = function () {
    if (!user) return previous();
    addNav();
    if (!MINE[page]) return previous();
    if (page === 'contacts' && user.role !== 'admin') { page = 'dashboard'; return previous(); }
    document.getElementById('pageTitle').textContent = MINE[page][0];
    document.getElementById('pageSubtitle').textContent = MINE[page][1];
    document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    content().innerHTML = '<div class="card"><p class="muted">Carregando…</p></div>';
    ({ pool: pagePool, 'partner-servers': pageServers, contacts: pageContacts })[page]().catch(e => { content().innerHTML = err(e); });
  };

  // ---------- ZUI Pool ----------
  async function pagePool() {
    const r = await api('admin/pool'), admin = user.role === 'admin';
    const bar = p => { const w = p.slots ? Math.min(100, p.pct) : 0, c = p.alert >= 100 ? 'var(--danger,#ef4444)' : p.alert >= 90 ? '#f59e0b' : p.alert >= 80 ? '#eab308' : 'var(--primary,#3b82f6)'; return '<div class="zpbar"><i style="width:' + w + '%;background:' + c + '"></i></div>'; };
    const card = p => '<div class="card zpool"><div class="zphead"><div><h2>' + esc(p.ownerName) + '</h2><p class="muted">' + (p.plan ? esc(p.plan.name) + ' · ' + money(p.plan.monthly) + '/mês' : 'Sem plano') + '</p></div><strong class="zpbig">' + p.used + (p.unlimited ? ' <small>ilimitado</small>' : p.slots ? ' <small>de ' + p.slots + ' vagas</small>' : ' <small>em reprodução</small>') + '</strong></div>' +
      (p.slots ? bar(p) + '<p class="muted small">' + p.pct + '% ocupado' + (p.alert ? ' · <b>alerta ' + p.alert + '%</b>' : '') + '</p>' : '') +
      '<p class="small">Pico de hoje: <b>' + p.peakToday + '</b>' + (p.extras.length ? ' · Extras ativos: ' + p.extras.map(e => '+' + e.slots + ' até ' + date(e.until)).join(', ') : '') + '</p>' +
      '<table class="zptable"><tr><th>Servidor</th><th>Código</th><th>Assistindo agora</th></tr>' + (p.servers.map(s => '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.code) + '</td><td>' + s.active + '</td></tr>').join('') || '<tr><td colspan="3" class="muted">Nenhum servidor atribuído.</td></tr>') + '</table>' +
      (Object.keys(p.days).length ? '<p class="muted small">Picos por dia: ' + Object.entries(p.days).slice(-7).map(([d, v]) => d.slice(5).split('-').reverse().join('/') + ' = ' + v).join(' · ') + '</p>' : '') +
      (admin ? '<div class="zprow"><select data-plan="' + esc(p.ownerId) + '"><option value="">Sem plano</option>' + r.plans.map(pl => '<option value="' + pl.id + '"' + (p.plan?.id === pl.id ? ' selected' : '') + '>' + esc(pl.name) + ' — ' + (pl.slots || '∞') + ' vagas · ' + money(pl.monthly) + '</option>').join('') + '</select><button data-extra="' + esc(p.ownerId) + '">+ Vagas para evento</button></div>' : '') + '</div>';
    const plans = '<div class="card"><h2>Planos</h2><table class="zptable"><tr><th>Plano</th><th>Reproduções simultâneas</th><th>Mensalidade</th><th>Por vaga/mês</th></tr>' + r.plans.map(pl => '<tr><td>' + esc(pl.name) + '</td><td>' + (pl.slots ? pl.slots.toLocaleString('pt-BR') : 'Ilimitado') + '</td><td>' + (pl.monthly == null ? 'Conforme a regra de cobrança' : money(pl.monthly)) + '</td><td>R$ ' + (pl.perSlot ?? pl.monthly / pl.slots).toFixed(2).replace('.', ',') + '</td></tr>').join('') + '</table><p class="muted small">Navegar no app não ocupa vaga. Reproduzir ou ver prévia ocupa uma; trocar de canal mantém a mesma. A vaga é liberada ao encerrar ou 90 s depois que a TV para de responder. Hoje só contamos: quando lotar, ninguém é bloqueado.</p></div>';
    content().innerHTML = '<div class="card zpinfo"><p>Modo atual: <b>somente contagem</b>. O vídeo continua direto da TV para o provedor.</p></div>' + (r.pools.map(card).join('') || '<div class="card"><p class="muted">Nenhum parceiro com servidor atribuído. Atribua em Servidores parceiros.</p></div>') + plans;
    content().querySelectorAll('[data-plan]').forEach(s => s.onchange = async () => { try { await api('admin/pool/plan', 'POST', { ownerId: s.dataset.plan, planId: s.value }); render(); } catch (e) { alert(e.message); } });
    content().querySelectorAll('[data-extra]').forEach(b => b.onclick = () => openModal('Vagas extras para evento', field('zpSlots', 'Quantidade de vagas', '200', 'number') + field('zpHours', 'Duração em horas', '24', 'number'), async () => {
      const cur = r.pools.find(p => p.ownerId === b.dataset.extra);
      await api('admin/pool/plan', 'POST', { ownerId: b.dataset.extra, planId: cur.plan?.id || '', extraSlots: Number(document.getElementById('zpSlots').value), extraHours: Number(document.getElementById('zpHours').value) }); render();
    }));
  }

  // ---------- Servidores parceiros ----------
  async function pageServers() {
    const r = await api('admin/partner-servers'), admin = user.role === 'admin';
    const row = s => '<tr><td><b>' + esc(s.name) + '</b><br><span class="muted small">' + esc(s.host) + '</span></td><td>' + esc(s.code) + '</td><td>' + (admin ? '<select data-owner="' + esc(s.id) + '"><option value="">— Sem parceiro —</option>' + r.owners.map(o => '<option value="' + esc(o.id) + '"' + (o.id === s.partnerOwnerId ? ' selected' : '') + '>' + esc(o.name) + '</option>').join('') + '</select>' : esc(s.ownerName || 'Você')) + '</td><td>' + s.devices + '</td><td>' + s.active + '</td><td>' + (s.enabled ? 'Ativo' : 'Desativado') + '</td><td class="zpact"><button data-devs="' + esc(s.id) + '">Aparelhos</button>' + (admin && !s.partnerOwnerId ? '' : '<button data-dns="' + esc(s.id) + '">Trocar DNS</button><button data-mig="' + esc(s.id) + '">Migrar listas para cá</button>') + '</td></tr>';
    content().innerHTML = '<div class="card"><input id="zpq" placeholder="Buscar por nome, código ou DNS" style="max-width:360px"><table class="zptable" id="zpst"><tr><th>Servidor</th><th>Código</th><th>Parceiro</th><th>Aparelhos</th><th>Assistindo</th><th>Situação</th><th></th></tr>' + (r.servers.map(row).join('') || '<tr><td colspan="7" class="muted">Nenhum servidor parceiro atribuído a você.</td></tr>') + '</table>' + (admin ? '<p class="muted small">Atribua um servidor a um revendedor para que ele veja os aparelhos, troque o DNS e migre listas em massa. A troca de DNS afeta só as listas desse código.</p>' : '') + '</div><div id="zpdetail"></div>';
    const q = document.getElementById('zpq'); q.oninput = () => { const v = q.value.toLowerCase(); document.querySelectorAll('#zpst tr').forEach((tr, i) => { if (i) tr.hidden = !tr.textContent.toLowerCase().includes(v); }); };
    content().querySelectorAll('[data-owner]').forEach(s => s.onchange = async () => { try { await api('admin/partner-servers/assign', 'POST', { serverId: s.dataset.owner, ownerId: s.value }); render(); } catch (e) { alert(e.message); } });
    content().querySelectorAll('[data-devs]').forEach(b => b.onclick = () => showDevices(b.dataset.devs));
    content().querySelectorAll('[data-dns]').forEach(b => b.onclick = () => { const s = r.servers.find(x => x.id === b.dataset.dns); migrateFlow('dns', s, 'Trocar DNS de ' + s.name, field('zpTo', 'Novo DNS (http://novo.host:porta)', '', 'url')); });
    content().querySelectorAll('[data-mig]').forEach(b => b.onclick = () => { const s = r.servers.find(x => x.id === b.dataset.mig); migrateFlow('migrate', s, 'Migrar listas para ' + s.name, field('zpFrom', 'DNS antigo das listas (http://antigo.host:porta)', '', 'url')); });
  }
  async function showDevices(id) {
    const el = document.getElementById('zpdetail'); el.innerHTML = '<div class="card"><p class="muted">Carregando aparelhos…</p></div>';
    try {
      const r = await api('admin/partner-servers/devices?id=' + encodeURIComponent(id)), st = { active: 'Ativa', trial: 'Teste', expired: 'Vencida', disabled: 'Desativada' };
      el.innerHTML = '<div class="card"><h2>Aparelhos · ' + esc(r.server.name) + ' (' + r.total + ')</h2><div class="zprow"><input id="zpdq" placeholder="Buscar MAC, nome ou revendedor"><select id="zpdf"><option value="">Todos</option><option value="online">Online</option><option value="playing">Assistindo</option><option value="active">Ativa</option><option value="trial">Teste</option><option value="expired">Vencida</option></select></div><table class="zptable" id="zpdt"><tr><th>Nome</th><th>MAC</th><th>Aparelho</th><th>Licença</th><th>Vence</th><th>Status</th><th>Revendedor</th></tr>' +
        r.devices.map(d => '<tr data-k="' + [d.online ? 'online' : '', d.playing ? 'playing' : '', d.status].join(' ') + '"><td>' + esc(d.name) + '</td><td>' + esc(d.mac) + '</td><td>' + esc(d.platform) + '</td><td>' + (st[d.status] || esc(d.status)) + '</td><td>' + (d.expiresAt ? new Date(d.expiresAt).toLocaleDateString('pt-BR') : '—') + '</td><td>' + (d.playing ? '▶ Assistindo' : d.online ? '● Online' : 'Offline') + '</td><td>' + esc(d.owner) + '</td></tr>').join('') + '</table></div>';
      const f = () => { const v = document.getElementById('zpdq').value.toLowerCase(), k = document.getElementById('zpdf').value; document.querySelectorAll('#zpdt tr').forEach((tr, i) => { if (i) tr.hidden = !(tr.textContent.toLowerCase().includes(v) && (!k || tr.dataset.k.split(' ').includes(k))); }); };
      document.getElementById('zpdq').oninput = f; document.getElementById('zpdf').onchange = f; el.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { el.innerHTML = err(e); }
  }
  function migrateFlow(kind, s, title, fields) {
    openModal(title, fields + '<p class="muted small" id="zpPrev">Primeiro mostramos quantas listas serão alteradas. Nada muda antes da sua confirmação, e dá para reverter em Migrações.</p>', async () => {
      const input = { serverId: s.id };
      if (kind === 'dns') input.to = document.getElementById('zpTo').value.trim(); else input.from = document.getElementById('zpFrom').value.trim();
      const p = await api('admin/partner-servers/' + kind + '/preview', 'POST', input);
      if (!confirm(p.count + ' lista(s) em ' + p.devices + ' aparelho(s) vão de ' + p.from + ' para ' + p.to + '. Confirmar?')) return;
      await api('admin/partner-servers/' + kind + '/execute', 'POST', { ...input, token: p.token, confirm: true });
      alert('Pronto: ' + p.count + ' lista(s) atualizada(s).'); render();
    });
  }

  // ---------- Contatos ----------
  async function pageContacts() {
    const r = await api('admin/contacts'), c = r.contacts || {};
    content().innerHTML = '<form class="card" id="zpcf" style="max-width:560px"><h2>Contatos de atendimento</h2>' + field('zpTg', 'Telegram (@usuario)', c.telegram || '') + field('zpWa', 'WhatsApp com DDI (+5541999999999)', c.whatsapp || '') + field('zpEm', 'E-mail', c.email || '', 'email') + '<p class="error" id="zpce"></p><button class="primary" style="margin-top:16px">Salvar contatos</button>' + (c.updatedAt ? '<p class="muted small">Atualizado em ' + date(c.updatedAt) + '</p>' : '') + '</form>';
    document.getElementById('zpcf').onsubmit = async ev => { ev.preventDefault(); try { await api('admin/contacts', 'POST', { telegram: zpTg.value, whatsapp: zpWa.value, email: zpEm.value }); render(); } catch (e) { document.getElementById('zpce').textContent = e.message; } };
  }

  if (typeof user !== 'undefined' && user) { addNav(); if (MINE[page]) render(); }
})();
