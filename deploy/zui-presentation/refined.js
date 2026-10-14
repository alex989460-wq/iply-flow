/* Navigation, focus and form presentation only; no operational requests. */
(() => {
 'use strict';
 const isAdmin=location.pathname.startsWith('/admin');
 if(!isAdmin){
  document.querySelectorAll('.site-links,.zv-foot-row nav').forEach(nav=>{
   [['/disponivel','Disponível'],['/pool','Parceiros']].forEach(([url,label])=>{
    if(nav.querySelector('a[href="'+url+'"]'))return;
    const a=document.createElement('a');a.href=url;a.textContent=label;nav.append(a);
   });
  });
  document.querySelectorAll('.site-links a').forEach(a=>{if(a.pathname===location.pathname)a.setAttribute('aria-current','page');});
 }
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
  if(e.key!=='Tab'||!activeDialog)return;
  const items=[...activeDialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
  const first=items[0],last=items[items.length-1];if(!first||!last)return;
  if(e.shiftKey&&(document.activeElement===first||!activeDialog.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||!activeDialog.contains(document.activeElement))){e.preventDefault();first.focus();}
 });
 if(!isAdmin)return;
 const views=new Set(['pool','partner-servers','platforms','contacts','resellers']);
 const requested=()=>new URLSearchParams(location.search).get('view')||location.pathname.split('/')[2]||'dashboard';
 const pathFor=v=>v==='platforms'?'/admin?view=platforms':v==='dashboard'?'/admin':'/admin/'+v;
 document.addEventListener('click',e=>{
  const t=e.target instanceof Element?e.target.closest('[data-zpool]'):null;
  if(!t)return;history.pushState({},'',pathFor(t.dataset.page));closeMenus();
 });
 let initialized=false;
 const restore=()=>{
  if(typeof user==='undefined'||!user||typeof render!=='function')return false;
  const v=requested();
  if(views.has(v)){page=v;render();}
  return true;
 };
 const bootstrap=setInterval(()=>{if(!initialized&&restore()){initialized=true;clearInterval(bootstrap);}},100);
 setTimeout(()=>clearInterval(bootstrap),30000);
 window.addEventListener('popstate',()=>{if(views.has(requested()))restore();});
})();