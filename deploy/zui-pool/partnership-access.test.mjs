import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
test('expired partner cannot manage DNS, admin can renew and unrelated owner cannot access',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zui-partner-test-'));
 try{
  for(const name of ['zui-pool.mjs','partnership-policy.mjs'])copyFileSync(new URL(name,import.meta.url),join(dir,name));
  writeFileSync(join(dir,'security.mjs'),`export function fail(m,status=400){throw Object.assign(Error(m),{status})} export const origin=v=>new URL(v).origin;export const visibleAccounts=(db,u)=>db.users.filter(a=>a.id===u.id);export const audit=()=>{};`);
  writeFileSync(join(dir,'client.mjs'),'export const devicePlaylists=d=>d.playlists||[];');
  writeFileSync(join(dir,'commerce.mjs'),'export const license=()=>({status:"active"});');
  writeFileSync(join(dir,'migrations.mjs'),'export const migrate=()=>true;');
  const {zuiPool}=await import(pathToFileURL(join(dir,'zui-pool.mjs')));
  const db={users:[{id:'p',name:'Partner',role:'reseller'},{id:'other',role:'reseller'}],servers:[{id:'s',host:'https://example.com',partnerOwnerId:'p',partnerExpiresAt:1}],devices:[]};
  let result,saves=0;const ctx={send:(_,status,data)=>{result=data},saveDb:()=>{saves++},loadDb:()=>db,dataDir:dir,database:{activePlayback:()=>0}};
  const request=(path,user,method='GET',input={})=>zuiPool({method},{},new URL('http://test'+path),user,db,input,ctx);
  const partner=db.users[0];
  await request('/api/admin/partner-servers',partner);assert.equal(result.servers[0].canManage,false);
  await assert.rejects(request('/api/admin/partner-servers/dns/preview',partner,'POST',{serverId:'s',to:'https://new.example.com'}));assert.equal(saves,0);
  await request('/api/admin/partner-servers',db.users[1]);assert.equal(result.servers.length,0);
  await assert.rejects(request('/api/admin/partner-servers/assign',partner,'POST',{serverId:'s',expiresOn:'2026-10-13'}));
  await request('/api/admin/partner-servers/assign',{role:'admin'},'POST',{serverId:'s',ownerId:'p',expiresOn:'2099-10-13'});
  await request('/api/admin/partner-servers',partner);assert.equal(result.servers[0].canManage,true);assert.equal(db.servers[0].host,'https://example.com');assert.equal(saves,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});