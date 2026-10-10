"""Publish reviewed imagery/CSS without changing HTML bodies or operational scripts."""
from pathlib import Path
import hashlib
import base64
import json
import re
import shutil
import sys
import time

root = Path('/opt/zuiplayer')
public = root / 'admin-api/public'
source = Path(sys.argv[1])
backup = Path('/root') / ('zui-app-preview-before-' + str(int(time.time())))
pages = [public / name for name in ['home.html', 'activation.html', 'client.html', 'privacy.html', 'index.html']]
logo = public / 'branding/logo.png'
preview = public / 'branding/home-preview.jpg'
allowed = set(pages + [logo, preview])

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

protected = {str(p): digest(p) for folder in [root / 'admin-api', root / 'dist']
             for p in folder.rglob('*') if p.is_file() and p not in allowed}
backup.mkdir(mode=0o700)
existing = {p for p in allowed if p.exists()}
for p in existing:
    target = backup / p.relative_to(root)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, target)
(backup / 'protected.json').write_text(json.dumps(protected, indent=2))
try:
    # Publish binary dependencies before HTML; branding itself is byte-identical.
    for target, filename in [(logo, 'zui-logo-3d.png'), (preview, 'zui-home-preview.jpg')]:
        temp = target.with_suffix(target.suffix + '.next')
        shutil.copy2(source / filename, temp)
        temp.chmod(0o644)
        temp.replace(target)
    css = (source / 'app-preview.css').read_text()
    # The API permits only logo/background branding paths. Embed the reviewed
    # illustration rather than relaxing its allowlist or restarting services.
    preview_uri = 'data:image/jpeg;base64,' + base64.b64encode((source / 'zui-home-preview.jpg').read_bytes()).decode('ascii')
    css = css.replace('/site-assets/branding/home-preview.jpg?v=20261010', preview_uri)
    for page in pages:
        original = page.read_text()
        clean = re.sub(r'<style id="zui-app-preview">[\s\S]*?</style>', '', original)
        if clean.count('</head>') != 1:
            raise RuntimeError('Invalid HTML head')
        updated = clean.replace('</head>', '<style id="zui-app-preview">\n' + css + '\n</style></head>', 1)
        if updated.split('</head>', 1)[1] != original.split('</head>', 1)[1]:
            raise RuntimeError('Unexpected body change')
        temp = page.with_suffix('.html.next')
        temp.write_text(updated)
        shutil.copymode(page, temp)
        temp.replace(page)
    if any(digest(Path(p)) != h for p, h in protected.items()):
        raise RuntimeError('Protected files changed')
    if digest(logo) != digest(source / 'zui-logo-3d.png'):
        raise RuntimeError('Logo not identical')
except Exception:
    for p in existing:
        shutil.copy2(backup / p.relative_to(root), p)
    for p in allowed - existing:
        p.unlink(missing_ok=True)
    raise
Path('/root/zui-app-preview-backup-path').write_text(str(backup))
print(json.dumps({'backup': str(backup), 'protected_unchanged': len(protected), 'html_bodies_unchanged': len(pages)}))