#!/usr/bin/env python3
"""Admin licence edit accepts negative days (remove days) for testing expiry warnings. Admin-only endpoint unchanged otherwise."""
import shutil, os, time, subprocess
A='/opt/zuiplayer/admin-api/commerce.mjs'; H='/opt/zuiplayer/admin-api/public/index.html'
a=open(A,encoding='utf8').read(); h=open(H,encoding='utf8').read()
oa="""  const days=Number(input.days);if(!Number.isInteger(days)||days<0||days>3650){send(res,400,{error:'Duração inválida'});return true;}
  d.activeUntil=days?Math.max(Date.now(),d.activeUntil||0)+days*DAY:0;"""
na="""  const days=Number(input.days);if(!Number.isInteger(days)||days<-3650||days>3650){send(res,400,{error:'Duração inválida'});return true;}
  // zui-license-days: negative values remove days from an existing paid activation.
  if(days<0){const now=Date.now();if(!(Number(d.activeUntil||0)>now)){send(res,400,{error:'Este aparelho não tem ativação paga para remover dias.'});return true;}d.activeUntil=Math.max(now-1000,Number(d.activeUntil)+days*DAY);}
  else d.activeUntil=days?Math.max(Date.now(),d.activeUntil||0)+days*DAY:0;"""
oh="field('licenseDays','Adicionar dias de ativação (0 revoga ativação)','30','number')"
nh="field('licenseDays','Adicionar ou remover dias (ex.: 30 ou -5; 0 revoga ativação)','30','number')"
if 'zui-license-days' in a: print('already'); raise SystemExit
assert a.count(oa)==1 and h.count(oh)==1, 'anchor'
b='/root/zui-license-days-before-%d'%int(time.time()); os.makedirs(b); shutil.copy2(A,b); shutil.copy2(H,b)
na_full=a.replace(oa,na); r=subprocess.run(['node','--input-type=module','--check'],input=na_full,text=True,capture_output=True); assert r.returncode==0,r.stderr
for p,c in ((A,na_full),(H,h.replace(oh,nh))):
    st=os.stat(p); open(p+'.tmp','w',encoding='utf8').write(c); shutil.copymode(p,p+'.tmp'); os.chown(p+'.tmp',st.st_uid,st.st_gid); os.replace(p+'.tmp',p)
print('applied; backup',b)
