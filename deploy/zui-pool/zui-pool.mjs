// zui-pool: ZUI Pool (count-only), partner servers and public contacts.
// Count-only: never blocks playback; reads the existing playback_leases.
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {migrate} from './migrations.mjs';
import {devicePlaylists} from './client.mjs';
import {license} from './commerce.mjs';
import {fail,origin,visibleAccounts,audit} from './security.mjs';
import {partnershipExpiry,partnershipActive,partnershipDate} from './partnership-policy.mjs';
import {platformCatalogue,validatePlatform} from './platform-policy.mjs';
import {devicePresence} from './presence.mjs';

export const POOL_PLANS=[
 {id:'inicial',name:'Inicial',slots:100,monthly:199},
 {id:'essencial',name:'Essencial',slots:250,monthly:399},
 {id:'profissional',name:'Profissional',slots:500,monthly:699},
 {id:'parceiro',name:'Parceiro',slots:1000,monthly:1199},
 {id:'empresarial',name:'Empresarial',slots:2500,monthly:2499},
 {id:'grande',name:'Grande operação',slots:5000,monthly:4499},
 {id:'seis-mil',name:'6.000 reproduções',slots:6000,monthly:4500,perSlot:0.75},
 {id:'ilimitado',name:'Ilimitado',slots:0,monthly:null,perSlot:0.49}
];
const ALERTS=[80,90,100];
let hist=null,histFile='',timer=null;
const day=t=>new Date(t).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
function loadHist(dir){if(hist)return hist;histFile=join(dir,'pool-history.json');try{hist=existsSync(histFile)?JSON.parse(readFileSync(histFile,'utf8')):{};}catch{hist={};}return hist;}
function saveHist(){try{writeFileSync(histFile+'.tmp',JSON.stringify(hist));renameSync(histFile+'.tmp',histFile);}catch{}}
const ownedServers=(db,ownerId)=>db.servers.filter(s=>s.partnerOwnerId===ownerId);
const extraSlots=(p,now)=>(p?.extras||[]).filter(e=>e.until>now).reduce((n,e)=>n+e.slots,0);
function poolOf(db,owner,database,now=Date.now()){
 const p=(db.pools||{})[owner.id]||null,plan=POOL_PLANS.find(x=>x.id===p?.planId)||null;
 const servers=ownedServers(db,owner.id).map(s=>({id:s.id,code:s.code,name:s.name,active:database.activePlayback(s.id)}));
 const used=servers.reduce((n,s)=>n+s.active,0),extra=extraSlots(p,now),slots=plan?(plan.slots?plan.slots+extra:0):0;
 const pct=slots?Math.round(used*100/slots):0,h=(hist||{})[owner.id]||{};
 return {ownerId:owner.id,ownerName:owner.name,plan,extras:(p?.extras||[]).filter(e=>e.until>now),slots,unlimited:plan?.slots===0,used,pct,
  alert:slots?[...ALERTS].reverse().find(a=>pct>=a)||0:0,peakToday:h.days?.[day(now)]||used,days:h.days||{},samples:(h.samples||[]).slice(-288),servers};
}
function sample(db,database){
 const now=Date.now(),owners=new Set(db.servers.map(s=>s.partnerOwnerId).filter(Boolean));
 for(const id of owners){const used=ownedServers(db,id).reduce((n,s)=>n+database.activePlayback(s.id),0),h=hist[id]||={days:{},samples:[]};
  const k=day(now);h.days[k]=Math.max(h.days[k]||0,used);h.samples.push([now,used]);h.samples=h.samples.filter(x=>x[0]>now-86400000*2);
  const keys=Object.keys(h.days).sort();for(const old of keys.slice(0,-90))delete h.days[old];}
 saveHist();
}
const deviceUsesServer=(d,s)=>devicePlaylists(d).some(p=>{try{return origin(p.source.host||p.source.url)===origin(s.host)&&(!p.source.serverCode||p.source.serverCode===s.code);}catch{return false;}});
function canView(db,user,s){return user.role==='admin'||(s.partnerOwnerId&&visibleAccounts(db,user).some(a=>a.id===s.partnerOwnerId));}
function canManage(db,user,s){return user.role==='admin'||(canView(db,user,s)&&partnershipActive(s));}
const cleanContact=(v,max=160)=>String(v||'').trim().slice(0,max);

export async function zuiPool(req,res,url,user,db,input,ctx){
 const path=url.pathname,{send,saveDb,database,loadDb,dataDir}=ctx;
 if(path==='/api/public/platforms'&&req.method==='GET'){send(res,200,{platforms:platformCatalogue(db).filter(p=>p.visible)},true);return true;}
 if(path==='/api/admin/servers'&&req.method==='POST'){
  if(user?.role!=='admin')fail('Acesso restrito ao administrador',403);
  const current=db.servers.find(s=>s.id===input.id);
  if(input.id&&!current)fail('Servidor não encontrado.',404);
  if(current){
   const bound=db.devices.some(d=>deviceUsesServer(d,current)||d.partnerLicense?.serverId===current.id);
   if(bound&&(String(input.code).trim()!==current.code||origin(input.host)!==origin(current.host)))fail('Este código possui aparelhos vinculados. Use Trocar DNS com prévia e confirmação; não altere o código em uso.',409);
  }
  return false;
 }
 if(!path.startsWith('/api/admin/pool')&&!path.startsWith('/api/admin/partner-servers')&&!['/api/admin/contacts','/api/admin/platforms'].includes(path))return false;
 loadHist(dataDir);if(!timer){timer=setInterval(()=>{try{sample(loadDb(),database);}catch{}},300000);timer.unref();}
 const accounts=visibleAccounts(db,user),isAdmin=user.role==='admin';
 if(path==='/api/admin/platforms'){
  if(!isAdmin)fail('Acesso restrito ao administrador',403);
  if(req.method==='GET'){send(res,200,{platforms:platformCatalogue(db)});return true;}
  if(req.method!=='POST')fail('Método inválido.',405);
  let p;try{p=validatePlatform(input);}catch(e){fail(e.message);}
  db.settings||={};db.settings.platforms||={};db.settings.platforms[p.id]=p;
  audit(db,'platform.update',p.id,{status:p.status,visible:p.visible});saveDb(db);send(res,200,{platform:p});return true;
 }
 if(path==='/api/admin/contacts'){
  if(!isAdmin)fail('Acesso restrito ao administrador',403);
  if(req.method==='GET'){send(res,200,{contacts:db.settings?.contacts||{}});return true;}
  if(req.method!=='POST')fail('Método inválido.',405);
  const email=cleanContact(input.email,120);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('E-mail inválido.');
  const whatsapp=cleanContact(input.whatsapp,30).replace(/[^\d+]/g,'');if(whatsapp&&!/^\+?\d{10,15}$/.test(whatsapp))fail('WhatsApp inválido. Use DDI e DDD, ex: +5541999999999.');
  let telegram=cleanContact(input.telegram,64).replace(/^https?:\/\/t\.me\//,'');if(telegram&&!telegram.startsWith('@'))telegram='@'+telegram;if(telegram&&!/^@[A-Za-z0-9_]{4,32}$/.test(telegram))fail('Telegram inválido. Use @usuario.');
  db.settings||={};db.settings.contacts={telegram,whatsapp,email,updatedAt:Date.now()};audit(db,'contacts.update','settings');saveDb(db);send(res,200,{contacts:db.settings.contacts});return true;
 }
 if(path==='/api/admin/pool'&&req.method==='GET'){
  const owners=isAdmin?db.users.filter(u=>['reseller','subreseller'].includes(u.role)):[user];
  send(res,200,{plans:POOL_PLANS,countOnly:true,pools:owners.map(o=>poolOf(db,o,database)).filter(p=>isAdmin||p.servers.length||p.plan)});return true;
 }
 if(path==='/api/admin/pool/plan'&&req.method==='POST'){
  if(!isAdmin)fail('Somente o administrador define planos.',403);
  const owner=db.users.find(u=>u.id===input.ownerId&&['reseller','subreseller'].includes(u.role));if(!owner)fail('Revendedor inválido.');
  if(input.planId&&!POOL_PLANS.some(p=>p.id===input.planId))fail('Plano inválido.');
  db.pools||={};const p=db.pools[owner.id]||={extras:[]};p.planId=input.planId||null;p.updatedAt=Date.now();
  if(input.extraSlots){const slots=Number(input.extraSlots),hours=Number(input.extraHours||24);if(!Number.isInteger(slots)||slots<1||slots>100000||!(hours>=1&&hours<=720))fail('Pacote extra inválido.');p.extras=(p.extras||[]).filter(e=>e.until>Date.now());p.extras.push({slots,until:Date.now()+hours*3600000,createdAt:Date.now()});}
  audit(db,'pool.plan',owner.id);saveDb(db);send(res,200,{pool:poolOf(db,owner,database)});return true;
 }
 if(path==='/api/admin/partner-servers'&&req.method==='GET'){
  const owners=new Map(db.users.map(u=>[u.id,u.name]));
  const list=db.servers.filter(s=>canView(db,user,s)).map(s=>({id:s.id,code:s.code,name:s.name,host:s.host,enabled:s.enabled!==false,requestRoute:s.requestRoute||'auto',maxConnections:s.maxConnections||0,partnerOwnerId:s.partnerOwnerId||null,partnerExpiresAt:s.partnerExpiresAt||null,partnerExpiresOn:partnershipDate(s.partnerExpiresAt),partnershipActive:partnershipActive(s),canManage:canManage(db,user,s),ownerName:owners.get(s.partnerOwnerId)||'',active:database.activePlayback(s.id),devices:db.devices.filter(d=>deviceUsesServer(d,s)).length}));
  send(res,200,{servers:list,owners:isAdmin?db.users.filter(u=>['reseller','subreseller'].includes(u.role)).map(u=>({id:u.id,name:u.name,email:u.email})):[]});return true;
 }
 if(path==='/api/admin/partner-servers/assign'&&req.method==='POST'){
  if(!isAdmin)fail('Somente o administrador atribui servidores.',403);
  const s=db.servers.find(s=>s.id===input.serverId);if(!s)fail('Servidor não encontrado.',404);
  if(input.ownerId&&!db.users.some(u=>u.id===input.ownerId&&['reseller','subreseller'].includes(u.role)))fail('Revendedor inválido.');
  if(Object.hasOwn(input,'expiresOn')){try{s.partnerExpiresAt=partnershipExpiry(input.expiresOn);}catch(e){fail(e.message);}}
  else if(s.partnerOwnerId!==(input.ownerId||null))s.partnerExpiresAt=null;
  s.partnerOwnerId=input.ownerId||null;audit(db,'partner.assign',s.id);saveDb(db);send(res,200,{ok:true});return true;
 }
 if(path==='/api/admin/partner-servers/delete'&&req.method==='POST'){
  if(!isAdmin)fail('Somente o administrador exclui códigos.',403);
  const s=db.servers.find(s=>s.id===input.serverId);if(!s)fail('Servidor não encontrado.',404);
  if(input.confirmCode!==s.code)fail('Digite o código exato para confirmar.');
  if(s.partnerOwnerId||db.devices.some(d=>deviceUsesServer(d,s)||d.partnerLicense?.serverId===s.id||d.serverCode===s.code)||database.activePlayback(s.id)>0)fail('Código em uso. Remova a delegação e migre os aparelhos antes de excluir. Para interromper novos logins, desative o código.',409);
  db.servers=db.servers.filter(x=>x.id!==s.id);audit(db,'partner.deleted',s.id,{code:s.code,name:s.name});saveDb(db);send(res,200,{ok:true});return true;
 }
 if(path==='/api/admin/partner-servers/devices'&&req.method==='GET'){
  const s=db.servers.find(s=>s.id===url.searchParams.get('id'));if(!s||!canManage(db,user,s))fail('Servidor não encontrado.',404);
  const now=Date.now(),owners=new Map(db.users.map(u=>[u.id,u.name])),playing=new Set(database.activePlaybackDevices());
  const rows=db.devices.filter(d=>deviceUsesServer(d,s)).map(d=>{const l=license(d,now);return {id:d.id,name:d.name,mac:d.mac,platform:d.platform||'',status:l.status,expiresAt:l.expiresAt||null,...devicePresence(d,playing.has(d.id),now),lastSeenAt:d.lastSeenAt||null,owner:owners.get(d.resellerId)||'Administrador'};});
  send(res,200,{server:{id:s.id,code:s.code,name:s.name},devices:rows.slice(0,2000),total:rows.length});return true;
 }
 const dns=path.match(/^\/api\/admin\/partner-servers\/(dns|migrate)\/(preview|execute)$/);
 if(dns&&req.method==='POST'){
  const s=db.servers.find(s=>s.id===input.serverId);if(!s||!canManage(db,user,s))fail('Servidor não encontrado.',404);
  const fake=new URL('http://x/api/admin/migrations/'+dns[2]);
  if(dns[1]==='dns'){ // change this server's DNS and move its lists (scoped to this partner code only)
   return migrate({req,res,url:fake,db,user:{...user,role:'admin'},input:{scope:'partner',partnerId:s.id,to:input.to,token:input.token,confirm:input.confirm},send,saveDb});
  }
  // bring the user's own lists from another DNS to this partner server
  if(!isAdmin&&!accounts.some(a=>a.id===(input.resellerId||user.id)))fail('Revendedor não autorizado.',403);
  return migrate({req,res,url:fake,db,user,input:{scope:isAdmin&&!input.resellerId?'all':'reseller',resellerId:input.resellerId||(isAdmin?undefined:user.id),from:input.from,to:s.host,token:input.token,confirm:input.confirm},send,saveDb});
 }
 fail('Operação não encontrada.',404);
}

export function publicContacts(db){const c=db.settings?.contacts||{};return {telegram:c.telegram||'',whatsapp:c.whatsapp||'',email:c.email||''};}
