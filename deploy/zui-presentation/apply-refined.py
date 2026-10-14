#!/usr/bin/env python3
"""Apply shared presentation atomically with rollback; never restart services."""
import hashlib,json,os,pathlib,re,shutil,sqlite3,sys,time
root=pathlib.Path(sys.argv[1]);stage=pathlib.Path(sys.argv[2]);public=root/'admin-api/public'
targets=[public/n for n in ['home.html','index.html','client.html','activation.html','privacy.html','terms.html','partner-pages/pool.html','partner-pages/disponivel.html']]
assert all(p.is_file() for p in targets),'Missing installed page'
backup=pathlib.Path('/root/zui-refined-before-'+str(int(time.time())));backup.mkdir(mode=0o700)
protected={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for folder in [root/'dist',root/'admin-api'] for p in folder.rglob('*') if p.is_file() and p not in targets}
for p in targets:
 dest=backup/p.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
src=sqlite3.connect('file:/var/lib/zuiplayer/zui.sqlite?mode=ro',uri=True);db=sqlite3.connect(str(backup/'zui.sqlite'));src.backup(db);db.close();src.close()
(backup/'protected-hashes.json').write_text(json.dumps(protected))
css=(stage/'refined.css').read_text();js=(stage/'refined.js').read_text()
def atomic(p,s):
 t=p.with_name(p.name+'.refined.tmp');t.write_text(s);shutil.copystat(p,t);st=p.stat();os.chown(t,st.st_uid,st.st_gid);os.replace(t,p)
try:
 for p in targets:
  h=p.read_text();h=re.sub(r'<style id="zui-refined-css">.*?</style>','',h,flags=re.S);h=re.sub(r'<script id="zui-refined-js">.*?</script>','',h,flags=re.S)
  if p.name=='index.html':
   h,n=re.subn(r'<script id="zui-admin-insights">.*?</script>',lambda m:'<script id="zui-admin-insights">'+(stage/'admin-insights.js').read_text()+'</script>',h,flags=re.S);assert n==1,'insights anchor'
  if p.parent.name=='partner-pages':h=h.replace('<body>','<body class="zui-partner-public">',1)
  assert h.count('</head>')==1 and h.count('</body>')==1
  h=h.replace('</head>','<style id="zui-refined-css">'+css+'</style></head>',1)
  h=h.replace('</body>','<script id="zui-refined-js">'+js+'</script></body>',1)
  atomic(p,h)
 assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==v for p,v in protected.items()),'Protected file changed'
 print('BACKUP',backup,'PROTECTED',len(protected),'PAGES',len(targets),'NO RESTART')
except:
 for p in targets:atomic(p,(backup/p.relative_to(root)).read_text())
 raise