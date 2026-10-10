"""Safely update only the ZUI Nginx block; validate before graceful reload."""
from pathlib import Path
import re
import shutil
import subprocess
import sys

source = Path(sys.argv[1])
config = Path('/etc/nginx/sites-enabled/zuiplayer.top.conf').resolve()
backup = Path(Path('/root/zui-rx-backup-path').read_text().strip())
shutil.copy2(config, backup / 'nginx.conf')
original = config.read_text()
privacy = (source / 'zuiplayer-privacy.nginx.conf').read_text()
privacy = privacy[privacy.index('location ='):].strip()
updated, count = re.subn(r'location = /politica-de-privacidade \{[^}]*\}', privacy, original)
if count != 1:
    raise RuntimeError('Expected exactly one privacy location')
security = (source / 'security-headers.nginx.conf').read_text()
if 'server_tokens off;' not in updated:
    updated = updated.replace('    location / {', security + '\n    location / {', 1)
if updated == original:
    raise RuntimeError('No configuration changes')
try:
    config.write_text(updated)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
except Exception:
    config.write_text(original)
    subprocess.run(['nginx', '-t'], check=True)
    raise
print('ZUI headers installed; Nginx gracefully reloaded; API unchanged.')