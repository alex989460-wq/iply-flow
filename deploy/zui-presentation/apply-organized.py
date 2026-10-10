"""Atomic presentation insertion with protected operational file hashes."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import sys
import time

root = Path('/opt/zuiplayer')
source = Path(sys.argv[1])
public = root / 'admin-api/public'
pages = [public / name for name in ['home.html','activation.html','client.html','privacy.html','index.html']]
backup = Path('/root') / ('zui-organized-before-' + str(time.time_ns()))
backup.mkdir(mode=0o700)
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
protected = {str(p): digest(p) for folder in [root / 'admin-api',root / 'dist'] for p in folder.rglob('*') if p.is_file() and p not in pages and '/data/' not in str(p)}
(backup / 'protected.json').write_text(json.dumps(protected))
css = (source / 'organized.css').read_text()
js = (source / 'organized-admin.js').read_text()
for page in pages:
    shutil.copy2(page, backup / page.name)
try:
    for page in pages:
        original = page.read_text()
        clean = re.sub(r'<style id="zui-organized">[\s\S]*?</style>', '', original)
        clean = re.sub(r'<script id="zui-organized-admin">[\s\S]*?</script>', '', clean)
        if clean.count('</head>') != 1 or clean.count('</body>') != 1:
            raise RuntimeError('Unexpected HTML structure')
        result = clean.replace('</head>', '<style id="zui-organized">' + css + '</style></head>')
        if page.name == 'index.html':
            result = result.replace('</body>', '<script id="zui-organized-admin">' + js + '</script></body>')
        temp = page.with_suffix('.html.next')
        temp.write_text(result)
        shutil.copystat(page, temp)
        temp.replace(page)
    if any(digest(Path(p)) != value for p,value in protected.items()):
        raise RuntimeError('Operational files changed')
except Exception:
    for page in pages:
        shutil.copy2(backup / page.name, page)
    raise
print(json.dumps({'backup':str(backup),'protected_unchanged':len(protected),'pages':len(pages),'services_restarted':False}))