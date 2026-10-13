import shutil,subprocess,os
p='/opt/zuiplayer/admin-api/server.mjs'
s=open(p,encoding='utf8').read()
old="""      if(!unverified&&Number(auth.user_info?.auth)!==1||auth.user_info?.status!=='Active'||expiryMillis(auth.user_info?.exp_date)&&expiryMillis(auth.user_info.exp_date)<=Date.now()){send(res,401,"""
new="""      const vpsRejected=!unverified&&(Number(auth.user_info?.auth)!==1||auth.user_info?.status!=='Active'||expiryMillis(auth.user_info?.exp_date)&&expiryMillis(auth.user_info.exp_date)<=Date.now());
      // Providers on Direct routes often answer datacenter IPs with a fake auth=0; the TV re-checks with its own IP.
      if(vpsRejected&&directLogin){unverified=true;auth={user_info:null};}
      if(vpsRejected&&!directLogin){send(res,401,"""
assert s.count(old)==1, 'anchor'
n=s.replace(old,new)
r=subprocess.run(['node','--input-type=module','--check'],input=n,text=True,capture_output=True); assert r.returncode==0,r.stderr
open(p+'.tmp','w',encoding='utf8').write(n); shutil.copymode(p,p+'.tmp'); os.replace(p+'.tmp',p); print('ok')
