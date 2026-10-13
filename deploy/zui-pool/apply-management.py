#!/usr/bin/env python3
"""Reapply isolated admin management improvements with rollback and protected hashes."""
import hashlib,json,os,pathlib,re,shutil,sqlite3,subprocess,sys,time
stage=pathlib.Path(sys.argv[1]);root=pathlib.Path('/opt/zuiplayer');api=root/'admin-api';public=api/'public'
backup=pathlib.Path('/root/zui-management-before-'+str(int(time.time())));backup.mkdir(mode=0o700)
targets=[api/'server.mjs',api/'zui-pool.mjs',api/'platform-policy.mjs',public/'index.html']+[public/'partner-pages'/n for n in ['pool.html','disponivel.html','platforms.js']]
protected={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for folder in [root/'dist',api] for p in folder.rglob('*') if p.is_file() and p not in targets}
for p in targets:
 if p.exists():
  dest=backup/p.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
source=sqlite3.connect('/var/lib/zuiplayer/zui.sqlite');dest=sqlite3.connect(str(backup/'zui.sqlite'));source.backup(dest);dest.close();source.close()
(backup/'protected-hashes.json').write_text(json.dumps(protected))
def atomic(target,text):
 temp=pathlib.Path(str(target)+'.tmp');temp.write_text(text)
 if target.exists():shutil.copystat(target,temp);st=target.stat();os.chown(temp,st.st_uid,st.st_gid)
 os.replace(temp,target)
try:
 s=(api/'server.mjs').read_text();anchor="    if(req.method==='GET'&&path==='/api/public/contacts'){"
 if "path==='/api/public/platforms'" not in s:
  assert s.count(anchor)==1,'public route anchor missing'
  s=s.replace(anchor,"    if(req.method==='GET'&&path==='/api/public/platforms'){await zuiPool(req,res,url,null,loadDb(),{},{send});return;}\n"+anchor)
 atomic(api/'server.mjs',s)
 for name in ['zui-pool.mjs','platform-policy.mjs']:atomic(api/name,(stage/name).read_text())
 for name in ['server.mjs','zui-pool.mjs','platform-policy.mjs']:subprocess.run(['node','--check',str(api/name)],check=True)
 subprocess.run(['python3',str(stage/'apply-admin.py'),str(stage/'pool-admin.js'),str(stage/'pool-admin.css'),str(stage/'platform-marks.js')],check=True)
 subprocess.run(['python3',str(stage/'apply.py'),str(stage/'admin-insights.js'),str(stage/'admin-insights.css')],check=True)
 h=(public/'index.html').read_text();pattern=r'<script id="zui-organized-admin">.*?</script>'
 assert len(re.findall(pattern,h,re.S))==1,'navigation block missing'
 h=re.sub(pattern,lambda _: '<script id="zui-organized-admin">'+(stage/'organized-admin.js').read_text()+'</script>',h,flags=re.S)
 atomic(public/'index.html',h)
 for name in ['pool.html','disponivel.html','platforms.js']:atomic(public/'partner-pages'/name,(stage/name).read_text())
 assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==v for p,v in protected.items()),'protected file changed'
 subprocess.run(['systemctl','restart','zuiplayer'],check=True)
 for service in ['zuiplayer','zapcrm']:subprocess.run(['systemctl','is-active',service],check=True)
 print('BACKUP',backup,'PROTECTED',len(protected))
except:
 for p in targets:
  old=backup/p.relative_to(root)
  if old.exists():shutil.copy2(old,p)
  elif p.exists():p.unlink()
 subprocess.run(['systemctl','restart','zuiplayer'],check=False)
 raise