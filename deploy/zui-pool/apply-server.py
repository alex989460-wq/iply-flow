#!/usr/bin/env python3
"""Wire zui-pool.mjs into ZUI server.mjs (idempotent). Re-apply after API upgrades."""
import os,shutil,time,sys
D='/opt/zuiplayer/admin-api';S=D+'/server.mjs'
s=open(S,encoding='utf8').read()
if 'zui-pool.mjs' in s: print('already wired'); sys.exit(0)
a1="const requestBody=['POST','PUT'].includes(req.method)?await body(req):{};const db=loadDb();"
a2="    if(req.method==='GET'&&path==='/api/public/security')"
a3="|migrations|audit|security|games|management|health)"
for a in (a1,a2,a3): assert s.count(a)==1, a
s=s.replace(a1,a1+"if(await zuiPool(req,res,url,user,db,requestBody,{send,saveDb,database,loadDb,dataDir:DATA_DIR}))return;")
s=s.replace(a2,"    if(req.method==='GET'&&path==='/api/public/contacts'){send(res,200,publicContacts(loadDb()),true);return;}\n"+a2)
s=s.replace(a3,"|migrations|audit|security|games|management|health|pool|partner-servers|contacts)")
s="import {zuiPool,publicContacts} from './zui-pool.mjs';\n"+s
b='/root/zui-pool-before-%d'%int(time.time());os.makedirs(b);shutil.copy2(S,b)
open(S+'.tmp','w',encoding='utf8').write(s);shutil.copymode(S,S+'.tmp');st=os.stat(S);os.chown(S+'.tmp',st.st_uid,st.st_gid);os.replace(S+'.tmp',S)
print('wired; backup',b)
