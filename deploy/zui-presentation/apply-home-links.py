"""Inject homepage-only navigation without touching shared site scripts."""
from pathlib import Path
import re
import shutil
import sys
import time

page = Path(sys.argv[1])
source = Path(sys.argv[2])
original = page.read_text()
if original.count('</body>') != 1:
    raise RuntimeError('Unexpected homepage structure')
backup = page.with_name(page.name + '.before-links-' + str(time.time_ns()))
shutil.copy2(page, backup)
clean = re.sub(r'<script id="zui-home-links">[\s\S]*?</script>', '', original)
result = clean.replace('</body>', '<script id="zui-home-links">' + source.read_text() + '</script></body>')
temporary = page.with_suffix('.html.next')
temporary.write_text(result)
shutil.copystat(page, temporary)
temporary.replace(page)
print('Homepage updated with rollback:', backup)