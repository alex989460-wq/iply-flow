#!/usr/bin/env python3
"""Embed admin dashboard cards + device filters (presentation only) in the ZUI admin HTML.
Usage: apply.py admin-insights.js admin-insights.css   (re-run replaces the previous block)."""
import os, re, shutil, sys, time
H = '/opt/zuiplayer/admin-api/public/index.html'
js, css = open(sys.argv[1], encoding='utf8').read(), open(sys.argv[2], encoding='utf8').read()
h = open(H, encoding='utf8').read()
block = '<style id="zui-admin-insights-css">' + css + '</style><script id="zui-admin-insights">' + js + '</script>'
h2 = re.sub(r'<style id="zui-admin-insights-css">.*?</script>', lambda m: block, h, flags=re.S) if 'id="zui-admin-insights"' in h else None
if h2 is None:
    assert h.count('</body>') == 1, 'anchor'
    h2 = h.replace('</body>', block + '</body>')
b = '/root/zui-admin-insights-before-%d' % int(time.time()); os.makedirs(b); shutil.copy2(H, b)
st = os.stat(H); open(H + '.tmp', 'w', encoding='utf8').write(h2); shutil.copymode(H, H + '.tmp'); os.chown(H + '.tmp', st.st_uid, st.st_gid); os.replace(H + '.tmp', H)
print('applied; backup', b)
