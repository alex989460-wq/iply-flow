"""Atomic site-only demo insertion. No service, account or playlist operations."""
from pathlib import Path
import base64
import hashlib
import json
import re
import shutil
import sys
import time

root = Path('/opt/zuiplayer')
source = Path(sys.argv[1])
page = root / 'admin-api/public/home.html'
backup = Path('/root') / ('zui-interactive-before-' + str(int(time.time())))
backup.mkdir(mode=0o700)
shutil.copy2(page, backup / 'home.html')
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
protected = {str(p): digest(p) for folder in [root / 'admin-api', root / 'dist'] for p in folder.rglob('*') if p.is_file() and p != page}
(backup / 'protected.json').write_text(json.dumps(protected))
original = page.read_text()
css = (source / 'interactive-preview.css').read_text()
artwork = ['data:image/jpeg;base64,' + base64.b64encode((source / ('poster-' + str(i) + '.jpg')).read_bytes()).decode('ascii') for i in range(14)]
js = (source / 'interactive-preview.js').read_text().replace('__ZUI_DEMO_ARTWORK__', json.dumps(artwork))
clean = re.sub(r'<style id="zui-interactive-preview">[\s\S]*?</style>', '', original)
clean = re.sub(r'<script id="zui-interactive-preview-script">[\s\S]*?</script>', '', clean)
if clean.count('</head>') != 1 or clean.count('</body>') != 1:
    raise RuntimeError('Invalid page structure')
updated = clean.replace('</head>', '<style id="zui-interactive-preview">' + css + '</style></head>', 1).replace('</body>', '<script id="zui-interactive-preview-script">' + js + '</script></body>', 1)
try:
    temp = page.with_suffix('.html.next')
    temp.write_text(updated)
    shutil.copymode(page, temp)
    temp.replace(page)
    if any(digest(Path(p)) != h for p, h in protected.items()):
        raise RuntimeError('Protected files changed')
except Exception:
    shutil.copy2(backup / 'home.html', page)
    raise
print(json.dumps({'backup': str(backup), 'protected_unchanged': len(protected), 'home_only': True}))