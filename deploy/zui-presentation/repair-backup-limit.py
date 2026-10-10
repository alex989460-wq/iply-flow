"""Bounded repair for accumulated ZUI static releases; encryption stays unchanged.

Run against the installed backups.mjs, or a staged release directory.
No credentials, database writes, or service operations are performed here.
"""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import time

target = Path(sys.argv[1]).resolve()
module = target / ('payload/admin-api/backups.mjs' if (target / 'payload').is_dir() else 'admin-api/backups.mjs')
original = module.read_text()
old = 'maxOutputLength:128*1024*1024'
new = 'maxOutputLength:192*1024*1024'
if original.count(old) != 1:
    raise RuntimeError('Unexpected backup implementation; review required')
backup = Path('/root') / ('zui-backup-limit-before-' + str(time.time_ns()))
backup.mkdir(mode=0o700)
shutil.copy2(module, backup / 'backups.mjs')
temporary = module.with_suffix('.mjs.next')
temporary.write_text(original.replace(old, new))
shutil.copystat(module, temporary)
temporary.replace(module)
manifest = target / 'api-manifest.json'
if (target / 'payload').is_dir():
    shutil.copy2(manifest, backup / manifest.name)
    data = json.loads(manifest.read_text())
    entry = next(row for row in data['files'] if row['name'] == 'admin-api/backups.mjs')
    entry['size'] = module.stat().st_size
    entry['sha256'] = hashlib.sha256(module.read_bytes()).hexdigest()
    manifest.write_text(json.dumps(data, indent=2) + '\n')
print(json.dumps({'backup': str(backup), 'bounded_decompression_mib': 192, 'encryption_unchanged': True}))