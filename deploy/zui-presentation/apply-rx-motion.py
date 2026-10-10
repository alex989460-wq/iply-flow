"""Run on the ZUI VPS: CSS-only presentation promotion with protected-file hashes."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import sys
import time

ROOT = Path('/opt/zuiplayer')
PUBLIC = ROOT / 'admin-api/public'
INPUT = Path(sys.argv[1])
BACKUP = Path('/root') / ('zui-rx-before-' + str(int(time.time())))
HTML = ['home.html', 'activation.html', 'client.html', 'privacy.html', 'index.html']
ALLOWED = {PUBLIC / name for name in HTML} | {PUBLIC / 'branding/logo.png'}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

protected = {str(p): digest(p) for folder in [ROOT / 'admin-api', ROOT / 'dist']
             for p in folder.rglob('*') if p.is_file() and p not in ALLOWED}
BACKUP.mkdir(mode=0o700)
for p in ALLOWED:
    dest = BACKUP / p.relative_to(ROOT)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)
(BACKUP / 'protected.json').write_text(json.dumps(protected, indent=2))
css = (INPUT / 'rx-motion.css').read_text()
try:
    for name in HTML:
        p = PUBLIC / name
        original = p.read_text()
        clean = re.sub(r'<style id="zui-rx-motion">[\s\S]*?</style>', '', original)
        if '</head>' not in clean:
            raise RuntimeError('Missing head: ' + name)
        updated = clean.replace('</head>', '<style id="zui-rx-motion">\n' + css + '\n</style></head>', 1)
        # Only stylesheet insertion is allowed: all scripts and body bytes stay identical.
        if re.sub(r'<style id="zui-rx-motion">[\s\S]*?</style>', '', updated) != clean:
            raise RuntimeError('Unexpected HTML change')
        temp = p.with_suffix('.html.next')
        temp.write_text(updated)
        shutil.copymode(p, temp)
        temp.replace(p)
    logo = PUBLIC / 'branding/logo.png'
    temp = logo.with_suffix('.png.next')
    shutil.copy2(INPUT / 'new-logo.png', temp)
    temp.chmod(0o644)
    temp.replace(logo)
    changed = [p for p, h in protected.items() if digest(Path(p)) != h]
    if changed:
        raise RuntimeError('Protected files changed: ' + str(changed))
except Exception:
    for p in ALLOWED:
        shutil.copy2(BACKUP / p.relative_to(ROOT), p)
    raise
Path('/root/zui-rx-backup-path').write_text(str(BACKUP))
print(json.dumps({'backup': str(BACKUP), 'protected_unchanged': len(protected), 'html_updated': HTML}))