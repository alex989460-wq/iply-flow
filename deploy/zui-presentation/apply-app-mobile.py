"""Embed the mobile /app presentation in the active ZUI web release (index/login only).

Usage: python3 apply-app-mobile.py <release_dir> <app-mobile.css>
Idempotent, backs up each HTML, writes atomically. No handlers, data or services touched.
"""
from pathlib import Path
import re, shutil, sys, time

release, css_file = Path(sys.argv[1]), Path(sys.argv[2])
css = css_file.read_text()
backup = Path('/root') / f'zui-app-mobile-before-{time.time_ns()}'
backup.mkdir(mode=0o700)
block = f'<style id="zui-app-mobile">\n{css}</style>\n'
metas = ('<meta name="apple-mobile-web-app-capable" content="yes" id="zui-ios-1" />\n'
         '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" id="zui-ios-2" />\n'
         '<meta name="theme-color" content="#06080e" id="zui-ios-3" />\n')
for name in ('index.html', 'login.html'):
    page = release / name
    html = page.read_text()
    shutil.copy2(page, backup / name)
    html = re.sub(r'<style id="zui-app-mobile">.*?</style>\n?', '', html, flags=re.S)
    html = re.sub(r'<meta [^>]*id="zui-ios-\d" />\n?', '', html)
    html = html.replace('content="width=device-width, initial-scale=1"',
                        'content="width=device-width, initial-scale=1, viewport-fit=cover"', 1)
    if '</head>' not in html:
        raise RuntimeError(f'{name}: </head> missing')
    html = html.replace('</head>', metas + block + '</head>', 1)
    tmp = page.with_suffix('.html.next')
    tmp.write_text(html)
    shutil.copystat(page, tmp)
    tmp.replace(page)
print(f'app mobile applied to {release.name}; backup {backup}')
