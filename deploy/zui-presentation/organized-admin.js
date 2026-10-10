/* Organization only: existing buttons and their listeners are retained. */
(() => {
  if (!document.querySelector('#shell .sidebar')) return;
  document.body.classList.add('site-admin');
  const groups = [
    ['Operação', ['dashboard','management','devices','playlists','games']],
    ['Comercial', ['resellers','credits','commerce']],
    ['Sistema', ['servers','partners','branding','settings','migrations']],
    ['Proteção', ['audit','security']]
  ];
  const icons = {dashboard:'◫',management:'▤',devices:'▣',playlists:'≡',games:'⚽',resellers:'♙',credits:'◇',commerce:'▱',servers:'⌘',partners:'⇄',branding:'◐',settings:'⚙',migrations:'↗',audit:'☷',security:'♧'};
  function organize() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    for (const [groupIndex, [label, pages]] of groups.entries()) {
      const buttons = pages.map(page => nav.querySelector(`button[data-page="${page}"]`)).filter(Boolean);
      if (!buttons.length) continue;
      let heading = nav.querySelector(`[data-organized-group="${groupIndex}"]`);
      if (!heading) {
        heading = document.createElement('div');
        heading.className = 'organized-nav-label';
        heading.dataset.organizedGroup = String(groupIndex);
        heading.textContent = label;
        nav.append(heading);
      }
      const visible = buttons.some(button => !button.classList.contains('hidden') && !button.hidden);
      if (heading.hidden === visible) heading.hidden = !visible;
      const order = String(groupIndex * 100);
      if (heading.style.order !== order) heading.style.order = order;
      for (const button of buttons) {
        const page = button.dataset.page;
        const buttonOrder = String(groupIndex * 100 + pages.indexOf(page) + 1);
        if (button.style.order !== buttonOrder) button.style.order = buttonOrder;
        if (button.dataset.navIcon !== icons[page]) button.dataset.navIcon = icons[page];
      }
    }
    const release = document.querySelector('.web-release');
    if (release && release.textContent !== 'App web 2.1.13') release.textContent = 'App web 2.1.13';
  }
  organize();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; organize(); });
  }).observe(document.querySelector('#shell') || document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
})();