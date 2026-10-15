/* Navigation, focus and form presentation only; no operational requests. */
(() => {
 'use strict';
 const isAdmin=location.pathname.startsWith('/admin');
 const navPaths=[['/disponivel','Disponível'],['/pool','Parceiros']];
 const samePath=(a,url)=>{try{return new URL(a.href,location.href).pathname===url}catch(e){return false}};
 const syncPublicNav=()=>{if(!isAdmin){
  document.querySelectorAll('.site-links,.zv-foot-row nav,.zv-foot nav').forEach(nav=>{
   navPaths.forEach(([url,label])=>{
    const found=[...nav.querySelectorAll('a')].filter(a=>samePath(a,url));
    let keep=found.find(a=>a.hasAttribute('data-home-link'))||found[0];
    if(!keep){keep=document.createElement('a');keep.href=url;nav.append(keep)}
    found.filter(a=>a!==keep).forEach(a=>a.remove());
    if(!keep.hasAttribute('data-home-link')&&keep.textContent.trim()!==label)keep.textContent=label;
   });
  });
  document.querySelectorAll('.site-links a').forEach(a=>{if(a.pathname===location.pathname)a.setAttribute('aria-current','page');});
 }};
 syncPublicNav();
 document.addEventListener('DOMContentLoaded',syncPublicNav);
 let navScheduled=false;
 new MutationObserver(()=>{if(navScheduled)return;navScheduled=true;requestAnimationFrame(()=>{navScheduled=false;syncPublicNav()})}).observe(document.body,{childList:true,subtree:true});
 const closeMenus=()=>{
  document.body.classList.remove('panel-nav-open');
  document.querySelector('.site-header')?.classList.remove('zv-open');
  document.querySelectorAll('.panel-menu,.zv-menu').forEach(b=>b.setAttribute('aria-expanded','false'));
 };
 document.addEventListener('click',e=>{
  const t=e.target instanceof Element?e.target:null;if(!t)return;
  if(!t.closest('.sidebar,.panel-menu,.site-header'))closeMenus();
  if(t.closest('.site-links a'))closeMenus();
  if(['editor','deleteDialog'].includes(t.id))t.hidden=true;
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenus();});
 const dialogSelector='#modal:not(.hidden) .modalbox,#zplBox,#editor:not([hidden]) #editForm,#deleteDialog:not([hidden]) .dialog';
 let activeDialog=null,returnFocus=null;
 const decorate=()=>{
  const serverTable=document.querySelector('#zpst');
  if(serverTable){
   serverTable.closest('.card')?.classList.add('zui-server-list');
   serverTable.querySelectorAll('tr').forEach(row=>{
    const cells=[...row.querySelectorAll('td')];if(cells.length!==7)return;
    const labels=['Servidor','Código','Parceiro','Aparelhos','Assistindo','Situação','Ações'];
    cells.forEach((cell,i)=>cell.dataset.label=labels[i]);
    const owner=row.querySelector('[data-owner]');
    if(owner)owner.setAttribute('aria-label','Parceiro de '+(cells[0].querySelector('b')?.textContent||'servidor'));
    const actions=cells[6];
    if(actions.querySelector('details')||!actions.querySelector('button'))return;
    const menu=document.createElement('details');menu.className='zui-server-actions';
    const summary=document.createElement('summary');summary.textContent='•••';
    summary.title='Ações do servidor';summary.setAttribute('aria-label','Ações de '+(cells[0].querySelector('b')?.textContent||'servidor'));
    const panel=document.createElement('div');panel.className='zui-server-action-list';
    panel.append(...actions.childNodes);menu.append(summary,panel);actions.append(menu);
    menu.addEventListener('toggle',()=>{if(menu.open)serverTable.querySelectorAll('details[open]').forEach(other=>{if(other!==menu)other.open=false;});});
   });
  }
  document.querySelectorAll('input[id],select[id],textarea[id]').forEach(input=>{
   if(input.closest('label')||document.querySelector('label[for="'+CSS.escape(input.id)+'"]'))return;
   const previous=input.previousElementSibling;
   if(previous?.tagName==='LABEL'&&!previous.htmlFor)previous.htmlFor=input.id;
  });
  const dialog=document.querySelector(dialogSelector);
  if(dialog&&dialog!==activeDialog){
   returnFocus=document.activeElement;activeDialog=dialog;
   dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
   const title=dialog.querySelector('h2');if(title){if(!title.id)title.id='zui-current-dialog-title';dialog.setAttribute('aria-labelledby',title.id);}
   dialog.querySelector('input:not([type=hidden]),select,button')?.focus({preventScroll:true});
  }else if(!dialog&&activeDialog){activeDialog=null;if(returnFocus instanceof HTMLElement&&returnFocus.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;}
 };
 new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});decorate();
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape')document.querySelectorAll('.zui-server-actions[open]').forEach(menu=>menu.open=false);
  if(e.key!=='Tab'||!activeDialog)return;
  const items=[...activeDialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
  const first=items[0],last=items[items.length-1];if(!first||!last)return;
  if(e.shiftKey&&(document.activeElement===first||!activeDialog.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||!activeDialog.contains(document.activeElement))){e.preventDefault();first.focus();}
 });
 if(!isAdmin)return;
 document.addEventListener('click',e=>{
  const target=e.target instanceof Element?e.target:null;
  document.querySelectorAll('.zui-server-actions[open]').forEach(menu=>{if(!target||!menu.contains(target)||target.closest('button'))menu.open=false;});
 });
 const views=new Set(['pool','partner-servers','platforms','contacts','resellers']);
 const requested=()=>new URLSearchParams(location.search).get('view')||location.pathname.split('/')[2]||'dashboard';
 const pathFor=v=>v==='platforms'?'/admin?view=platforms':v==='dashboard'?'/admin':'/admin/'+v;
 document.addEventListener('click',e=>{
  const t=e.target instanceof Element?e.target.closest('[data-zpool]'):null;
  if(!t)return;history.pushState({},'',pathFor(t.dataset.page));closeMenus();
 },true);
 let initialized=false;
 const restore=()=>{
  if(document.readyState==='loading'||typeof user==='undefined'||!user||typeof render!=='function'||typeof refreshBusy==='undefined'||refreshBusy||!document.querySelector('[data-zpool]'))return false;
  const v=requested();
  if(views.has(v)){page=v;render();}
  return true;
 };
 const bootstrap=setInterval(()=>{if(!initialized&&restore()){initialized=true;clearInterval(bootstrap);}},100);
 setTimeout(()=>clearInterval(bootstrap),30000);
 window.addEventListener('popstate',()=>{if(views.has(requested()))restore();});
})();