(()=>{'use strict';const mark='<img src="/site-assets/branding/logo.png?v=official-blue-1210-4" alt="ZUI Player">';
const path=location.pathname,links=[['/','Início','home'],['/minhas-listas','Minhas playlists','listsNav'],['/ativar','Ativar / renovar','activateNav'],['/admin','Painel admin','adminNav']];
const header=document.createElement('header');header.className='site-header';header.innerHTML='<a class="site-logo" href="/" aria-label="Página inicial"><span class="site-mark" data-brand-icon>'+mark+'</span><strong data-brand-name>ZUI Player</strong></a><div class="site-links" aria-label="Páginas do sistema">'+links.map(([url,label,key])=>'<a data-i18n="'+key+'" href="'+url+'" '+((url==='/'?path==='/':path.startsWith(url))?'aria-current="page"':'')+' '+(url==='/app/'?'class="open-app"':'')+'>'+label+'</a>').join('')+'</div>';document.body.prepend(header);
if(!path.startsWith('/admin')){
 document.body.classList.add('zv-public');
 const adm=header.querySelector('a[href="/admin"]');if(adm)adm.remove();
 const tg=document.createElement('button');tg.type='button';tg.className='zv-menu';tg.setAttribute('aria-label','Menu');tg.setAttribute('aria-expanded','false');tg.innerHTML='<span></span><span></span><span></span>';
 tg.onclick=()=>{const o=header.classList.toggle('zv-open');tg.setAttribute('aria-expanded',o?'true':'false');};
 header.querySelectorAll('.site-links a').forEach(a=>a.addEventListener('click',()=>header.classList.remove('zv-open')));
 header.append(tg);
 const foot=document.createElement('footer');foot.className='zv-foot';
 foot.innerHTML='<div class="zv-foot-notice"><strong data-i18n="f_noticeT">Aviso importante</strong><p data-i18n="f_notice">O ZUI Player não vende, não fornece e não hospeda nenhum conteúdo. Todo conteúdo adicionado ao aplicativo é de inteira responsabilidade do usuário.</p></div><div class="zv-foot-row"><span>© '+new Date().getFullYear()+' ZUI Player · <span data-i18n="f_license">A ativação licencia exclusivamente o aplicativo.</span></span><nav><a href="/#aviso-legal" data-i18n="f_legal">Aviso legal</a><a href="/politica-de-privacidade">Política de Privacidade</a><a href="/minhas-listas" data-i18n="listsNav">Minhas playlists</a><a href="/ativar" data-i18n="activateNav">Ativar / renovar</a><a href="/admin" data-i18n="f_panel">Painel</a></nav></div>';
 const mount=()=>document.body.append(foot);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
}const languageScript=document.createElement('script');languageScript.src='/site-assets/site-i18n.js?v=luminous-20261005';document.head.append(languageScript);
if(path.startsWith('/admin')){
 document.body.classList.add('site-admin');
 const syncHeaderHeight=()=>document.documentElement.style.setProperty('--site-header-height',Math.ceil(header.getBoundingClientRect().height)+'px');
 syncHeaderHeight();
 if(window.ResizeObserver)new ResizeObserver(syncHeaderHeight).observe(header);
 else window.addEventListener('resize',syncHeaderHeight);
}else if(path==='/minhas-listas')document.body.classList.add('site-account');else if(path==='/ativar')document.body.classList.add('site-activation');
const imageUrl=value=>{try{const u=new URL(value,location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
window.applySiteBrand=brand=>{document.querySelectorAll('[data-brand-name]').forEach(e=>e.textContent='ZUI Player');document.title=document.title.replace(/^ZUI(?: Player)?/,'ZUI Player');document.querySelectorAll('[data-brand-icon]').forEach(e=>{const img=new Image();const inHeader=Boolean(e.closest('.site-header'));img.src=inHeader?'/site-assets/branding/logo.png?v=official-blue-1210-4':(imageUrl(brand.appIcon)||'/app/largeIcon.png');img.alt='ZUI Player';e.replaceChildren(img);});if(!path.startsWith('/admin')&&/^#[a-f0-9]{6}$/i.test(brand.accent||''))document.documentElement.style.setProperty('--site-accent',brand.accent);if(['Outfit','Arial','Verdana'].includes(brand.font))document.documentElement.style.setProperty('--site-font',brand.font);};
fetch('/api/public/brand').then(r=>r.json()).then(d=>window.applySiteBrand(d.brand)).catch(()=>{});
})();

const portalLanguage=document.createElement('script');portalLanguage.src='/site-assets/portal-i18n.js';document.head.append(portalLanguage);

// Format every MAC field, including dialogs added later, without requiring separators.
const macField=el=>el instanceof HTMLInputElement&&/^(mac|deviceMac)$/i.test(el.id);
document.addEventListener('input',event=>{const el=event.target;if(!macField(el))return;const pos=el.selectionStart||0,prior=el.value.slice(0,pos).replace(/[^a-f0-9]/gi,'').length,hex=el.value.replace(/[^a-f0-9]/gi,'').toUpperCase().slice(0,12);el.value=(hex.match(/.{1,2}/g)||[]).join(':');const caret=Math.min(el.value.length,prior+Math.floor(Math.max(0,prior-1)/2));el.setSelectionRange(caret,caret);});
document.addEventListener('keydown',event=>{const el=event.target;if(!macField(el)||event.key!=='Backspace'||el.selectionStart!==el.selectionEnd)return;const pos=el.selectionStart;if(pos&&el.value[pos-1]===':'){event.preventDefault();el.value=el.value.slice(0,pos-2)+el.value.slice(pos);el.setSelectionRange(pos-2,pos-2);el.dispatchEvent(new Event('input',{bubbles:true}));}});

// Presentation-only reveal; never hides content before intersection.
if (!location.pathname.startsWith('/admin') && window.IntersectionObserver) {
 const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('zv-reveal');observer.unobserve(entry.target);}});},{threshold:.08});
 document.querySelectorAll('.zv-section,.zv-legal').forEach(el=>observer.observe(el));
}
