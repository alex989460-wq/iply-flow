#!/usr/bin/env python3
"""Embeds admin-playlists.css/js into the admin index.html (idempotent, replaces previous copy)."""
import sys, pathlib, re
here = pathlib.Path(__file__).parent
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/zuiplayer/admin-api/public/index.html')
s = p.read_text()
s = re.sub(r'<style id="zui-admin-playlists">.*?</style><script id="zui-admin-playlists-js">.*?</script>', '', s, flags=re.S)
block = ('<style id="zui-admin-playlists">' + (here / 'admin-playlists.css').read_text() + '</style>'
         '<script id="zui-admin-playlists-js">' + (here / 'admin-playlists.js').read_text() + '</script>')
idx = s.rfind('</body>')
if idx < 0: sys.exit('no </body>')
s = s[:idx] + block + s[idx:]
p.write_text(s)
print('applied')
