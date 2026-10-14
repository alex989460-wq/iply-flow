/* Homepage presentation only: append catalogue/partner links to the existing navigation. */
(()=>{
 const words={pt:['Disponível','Parceiros','Xbox e computadores','Obter na Microsoft Store'],en:['Available','Partners','Xbox and computers','Get from Microsoft Store'],es:['Disponible','Socios','Xbox y computadoras','Obtener en Microsoft Store'],fr:['Disponible','Partenaires','Xbox et ordinateurs','Obtenir sur Microsoft Store'],de:['Verfügbar','Partner','Xbox und Computer','Im Microsoft Store herunterladen'],tr:['Mevcut','Ortaklar','Xbox ve bilgisayarlar',"Microsoft Store’dan edinin"]};
 const store='https://apps.microsoft.com/detail/9NX9KT313W7P';
 function update(){
  const lang=(document.documentElement.lang||'pt').slice(0,2),w=words[lang]||words.pt;
  for(const container of document.querySelectorAll('body.site-home .site-links,body.site-home .zv-foot nav')){
   for(const [i,href] of ['/disponivel','/pool'].entries()){
    let link=container.querySelector('[data-home-link="'+i+'"]');
    if(!link){link=document.createElement('a');link.href=href;link.dataset.homeLink=String(i);container.append(link)}
    if(link.textContent!==w[i])link.textContent=w[i];
   }
  }
  const actions=document.querySelector('body.site-home .zv-actions');
  if(actions){
   let link=actions.querySelector('[data-home-store]');
   if(!link){link=document.createElement('a');link.className='zv-btn zv-btn-ghost';link.href=store;link.target='_blank';link.rel='noopener noreferrer';link.dataset.homeStore='true';actions.append(link)}
   if(link.textContent!==w[2]+' ↗')link.textContent=w[2]+' ↗';link.setAttribute('aria-label',w[3]+' — '+w[2]);
  }
 }
 let scheduled=false;
 new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;update()})}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['lang']});
 update();
})();