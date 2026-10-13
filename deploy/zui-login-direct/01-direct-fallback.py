import sys,shutil,time,subprocess,hashlib
p='/opt/zuiplayer/admin-api/server.mjs'
s=open(p,encoding='utf8').read()
old1="""      let response,auth;try{response=await providerFetch(upstream,{signal:AbortSignal.timeout(12000)});auth=await readProviderJson(response);auth.user_info=providerAccountInfo(auth);}catch(e){send(res,502,{error:e.statusCode?e.message:'Não foi possível conectar ao serviço. Confira a rota e tente novamente.',code:e.code||'PROVIDER_NETWORK',upstreamStatus:e.upstreamStatus},true);return;}
      if(Number(auth.user_info?.auth)!==1"""
new1="""      // zui-login-direct: when the server route is Direct, or an installed client
      // asks to check the provider itself, a VPS block must not stop registration.
      // Unverified logins get only the playlist (same as adding it in the panel), never a partner licence.
      const directLogin=server.requestRoute==='direct'||data.requestRoute==='direct'&&Number(data.clientProviderAuth)===1;let unverified=false;
      let response,auth;try{response=await providerFetch(upstream,{signal:AbortSignal.timeout(directLogin?7000:12000)});auth=await readProviderJson(response);auth.user_info=providerAccountInfo(auth);}catch(e){if(!directLogin){send(res,502,{error:e.statusCode?e.message:'Não foi possível conectar ao serviço. Confira a rota e tente novamente.',code:e.code||'PROVIDER_NETWORK',upstreamStatus:e.upstreamStatus},true);return;}unverified=true;auth={user_info:null};}
      if(!unverified&&Number(auth.user_info?.auth)!==1"""
old2="""serverCode:activeServer.code,expiresAt:expiryMillis(auth.user_info?.exp_date),...providerExpiryDetails(auth.user_info)},{add:true});d.serverCode=activeServer.code;recordPartnerAuthorization(current,d,activeServer,auth.user_info);d.revision=(d.revision||0)+1;saveDb(current);send(res,200,{ok:true,name:activeServer.name},true);return;"""
new2="""serverCode:activeServer.code,...(unverified?{}:{expiresAt:expiryMillis(auth.user_info?.exp_date),...providerExpiryDetails(auth.user_info)})},{add:true});d.serverCode=activeServer.code;if(!unverified)recordPartnerAuthorization(current,d,activeServer,auth.user_info);d.revision=(d.revision||0)+1;saveDb(current);send(res,200,unverified?{ok:true,name:activeServer.name,requestRoute:'direct'}:{ok:true,name:activeServer.name},true);return;"""
if 'zui-login-direct' in s: print('already'); sys.exit(0)
assert s.count(old1)==1 and s.count(old2)==1, 'anchor mismatch'
b='/root/zui-server-before-login-direct-%d.mjs'%int(time.time()); shutil.copy2(p,b); print('backup',b)
n=s.replace(old1,new1).replace(old2,new2)
r=subprocess.run(['node','--input-type=module','--check'],input=n,text=True,capture_output=True)
assert r.returncode==0, r.stderr
open(p+'.tmp','w',encoding='utf8').write(n); shutil.copymode(p,p+'.tmp')
import os; os.replace(p+'.tmp',p); print('patched')
