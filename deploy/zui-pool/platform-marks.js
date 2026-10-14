/* Presentation only: decorate existing platform labels; never change actions. */
(()=>{
 const key=text=>{const t=String(text).toLowerCase();if(/xbox/.test(t))return 'xbox';if(/windows/.test(t))return 'windows';if(/roku/.test(t))return 'roku';if(/webos|\blg\b|lgwebos/.test(t))return 'lg';if(/tizen|samsung/.test(t))return 'samsung';if(/fire/.test(t))return 'amazonfiretv';if(/android/.test(t))return 'android';if(/ios|iphone|ipad|macos|apple/.test(t))return 'apple';if(/linux/.test(t))return 'linux';return '';};
 function decorate(){
  if(!document.body.classList.contains('site-admin'))return;
  document.querySelectorAll('.sourcehint,.zplat>span,#zpdt tr td:nth-child(3)').forEach(el=>{
   if(el.querySelector('.zp-platform-mark'))return;
   const name=key(el.textContent);if(!name)return;
   const img=document.createElement('img');img.src='/partner-assets/platforms/'+name+'.svg';img.alt='';img.width=30;img.height=20;img.className='zp-platform-mark';el.prepend(img);
  });
 }
 let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;decorate();});}).observe(document.body,{childList:true,subtree:true});decorate();
})();