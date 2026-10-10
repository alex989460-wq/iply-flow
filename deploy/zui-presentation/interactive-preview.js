/* Public illustration only. No network requests, storage or operational handlers. */
(() => {
  const host = document.querySelector('body.site-home .zv-hero-art');
  if (!host || host.querySelector('.zui-demo')) return;
  const artwork = __ZUI_DEMO_ARTWORK__;
  const titles = ['Horizonte vermelho', 'Mundo submerso', 'Além do cume', 'Velocidade da luz', 'Caminhos da noite', 'Floresta secreta', 'Vento livre', 'Portões do tempo', 'Memórias da biblioteca', 'Mapa de aventuras', 'Viagem a vapor', 'Luzes do norte', 'À margem do rio', 'Cidade infinita'];
  const favorites = new Set();
  let view = 'home';
  let returnFocus = null;
  host.removeAttribute('role');
  host.setAttribute('aria-label', 'Demonstração navegável do ZUI Player');
  const root = document.createElement('div');
  root.className = 'zui-demo';
  host.append(root);
  const icons = {home:'⌂',search:'⌕',tv:'▣',films:'▤',series:'▥',favorites:'☆',settings:'⚙'};
  const names = {home:'Início',search:'Buscar',tv:'TV ao vivo',films:'Filmes',series:'Séries',favorites:'Favoritos',settings:'Ajustes'};
  function button(label, cls, action, text = '') {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'zui-demo-button ' + cls;
    el.setAttribute('aria-label', label); el.title = label;
    el.textContent = text; el.addEventListener('click', action); return el;
  }
  const hits = document.createElement('div'); hits.className = 'zui-demo-hits';
  Object.keys(names).forEach((key, index) => hits.append(button(names[key], 'zui-demo-nav zui-demo-nav-' + index, () => open(key))));
  ['tv','films','series'].forEach((key, index) => hits.append(button(names[key], 'zui-demo-category zui-demo-category-' + index, () => open(key))));
  titles.forEach((title, index) => hits.append(button('Abrir ' + title + ' — ilustração', 'zui-demo-poster zui-demo-poster-' + index, () => detail(index))));
  root.append(hits);
  const panel = document.createElement('section'); panel.className = 'zui-demo-panel'; panel.hidden = true; root.append(panel);
  const controls = document.createElement('div'); controls.className = 'zui-demo-controls';
  const expand = button('Ampliar demonstração', 'zui-demo-expand', () => {
    const expanded = host.classList.toggle('zui-demo-expanded');
    expand.textContent = expanded ? '↙' : '↗';
    expand.setAttribute('aria-label', expanded ? 'Reduzir demonstração' : 'Ampliar demonstração');
    expand.setAttribute('aria-expanded', String(expanded));
  }, '↗');
  controls.append(expand); host.append(controls);
  function header(title) {
    panel.replaceChildren();
    const nav = document.createElement('nav'); nav.className = 'zui-demo-panel-nav'; nav.setAttribute('aria-label','Navegação da demonstração');
    Object.keys(names).forEach(key => nav.append(button(names[key], key === view ? 'zui-demo-active' : '', () => open(key), icons[key])));
    const heading = document.createElement('h2'); heading.textContent = title;
    const close = button('Voltar à imagem inicial', 'zui-demo-back', () => open('home'), '←');
    const top = document.createElement('div'); top.className = 'zui-demo-panel-top'; top.append(close, heading);
    panel.append(nav, top); panel.hidden = false;
    return heading;
  }
  function note(text) { const p = document.createElement('p'); p.className = 'zui-demo-note'; p.textContent = text; panel.append(p); }
  function grid(ids) {
    const container = document.createElement('div'); container.className = 'zui-demo-grid';
    ids.forEach(id => {
      const card = button('Abrir ' + titles[id] + ' — ilustração', 'zui-demo-card', () => detail(id));
      const img = document.createElement('img'); img.src = artwork[id]; img.alt = titles[id];
      const title = document.createElement('span'); title.textContent = titles[id]; card.append(img,title); container.append(card);
    });
    panel.append(container); return container;
  }
  function open(next) {
    view = next;
    if (next === 'home') { panel.hidden = true; hits.hidden = false; return; }
    hits.hidden = true; const heading = header(names[next]); heading.tabIndex = -1; heading.focus({preventScroll:true});
    if (next === 'films') grid([0,1,2,3,4,5,6]);
    if (next === 'series') grid([7,8,9,10,11,12,13]);
    if (next === 'tv') note('Esta demonstração não possui canais. O ZUI Player não vende, fornece ou hospeda conteúdo.');
    if (next === 'settings') note('Demonstração ilustrativa. As configurações do seu aplicativo e suas playlists não são alteradas.');
    if (next === 'favorites') { if (favorites.size) grid([...favorites]); else note('Nenhuma ilustração nos favoritos.'); }
    if (next === 'search') {
      const field = document.createElement('input'); field.type = 'search'; field.placeholder = 'Buscar ilustrações'; field.setAttribute('aria-label','Buscar ilustrações'); field.className = 'zui-demo-search'; panel.append(field);
      let results = grid(titles.map((_,i) => i));
      field.addEventListener('input', () => { results.remove(); results = grid(titles.map((_,i) => i).filter(i => titles[i].toLocaleLowerCase('pt-BR').includes(field.value.toLocaleLowerCase('pt-BR')))); });
      field.focus({preventScroll:true});
    }
  }
  function detail(id) {
    returnFocus = document.activeElement;
    hits.hidden = true; header(titles[id]);
    const content = document.createElement('div'); content.className = 'zui-demo-detail';
    const img = document.createElement('img'); img.src = artwork[id]; img.alt = titles[id];
    const body = document.createElement('div');
    const label = document.createElement('p'); label.textContent = 'Arte original · Ilustração';
    const legal = document.createElement('p'); legal.textContent = 'Não há vídeo ou catálogo disponível nesta demonstração. Todo conteúdo adicionado ao ZUI Player é responsabilidade do usuário.';
    const favorite = button('Adicionar aos favoritos da demonstração', 'zui-demo-favorite', () => {
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
      favorite.textContent = favorites.has(id) ? '★ Favorito' : '☆ Favoritar'; favorite.setAttribute('aria-pressed', String(favorites.has(id)));
    }, favorites.has(id) ? '★ Favorito' : '☆ Favoritar');
    favorite.setAttribute('aria-pressed', String(favorites.has(id)));
    const back = button('Voltar', 'zui-demo-return', () => { open(view); if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus({preventScroll:true}); }, '← Voltar');
    body.append(label,legal,favorite,back); content.append(img,body); panel.append(content); back.focus({preventScroll:true});
  }
  root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); open('home'); host.classList.remove('zui-demo-expanded'); expand.textContent = '↗'; expand.setAttribute('aria-expanded','false'); expand.focus({preventScroll:true}); } });
})();