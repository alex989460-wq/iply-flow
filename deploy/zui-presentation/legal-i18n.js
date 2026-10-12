(()=>{const extra=[['fr','Français'],['de','Deutsch'],['tr','Türkçe']],known=['pt-BR','en','es','fr','de','tr'];
const pick=()=>{const s=localStorage.getItem('zuiLegalLanguage')||localStorage.getItem('zuiSiteLanguage');if(known.includes(s))return s;const n=(navigator.language||'').toLowerCase();return n.startsWith('pt')?'pt-BR':known.find(k=>n.startsWith(k))||'pt-BR';};
const set=l=>{if(!known.includes(l))l='pt-BR';document.documentElement.lang=l;localStorage.setItem('zuiLegalLanguage',l);const p=document.querySelector('#siteLanguage');if(p)p.value=l;};
set(pick());let tries=0;const hook=()=>{const p=document.querySelector('#siteLanguage');if(!p){if(tries++<60)setTimeout(hook,100);return;}
for(const [id,label] of extra)if(!p.querySelector('option[value="'+id+'"]')){const o=document.createElement('option');o.value=id;o.textContent=label;p.append(o);}
let chosen=null;p.addEventListener('input',()=>{chosen=p.value;});p.addEventListener('change',()=>{const v=chosen||p.value;chosen=null;setTimeout(()=>set(v),0);});set(pick());};hook();})();
