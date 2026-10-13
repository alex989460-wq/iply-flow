#!/usr/bin/env python3
"""Web-only: when /app runs in a normal HTTPS browser and a managed playlist is HTTP,
load catalogue/M3U through the existing authenticated /api/device/provider relay
instead of failing with PROVIDER_MIXED. Installed TV/Android clients are untouched
(installedClient() stays true there). Usage: apply-web-relay.py <release_dir>"""
import sys, os, shutil, time, subprocess, re
rel = sys.argv[1]; p = os.path.join(rel, 'zui-api.js')
s = open(p, encoding='utf8').read()
if 'zui-web-relay' in s: print('already applied'); sys.exit(0)
old = """        if (!installedClient() && w.location && w.location.protocol === "https:" && /^http:\\/\\//i.test(target)) {
          throw error("O navegador bloqueia consultas HTTP a partir de um site HTTPS. Use o aplicativo da TV ou uma URL HTTPS fornecida pelo provedor.", "PROVIDER_MIXED");
        }"""
new = """        if (!installedClient() && w.location && w.location.protocol === "https:" && /^http:\\/\\//i.test(target)) {
          /* zui-web-relay: browsers block HTTP from HTTPS; use the panel relay (web only). */
          var relayed = request("/api/device/provider?url=" + encodeURIComponent(target) + (fresh ? "&fresh=1" : ""), "GET", null, {text: !options.json && !options.blob, blob: !!options.blob, signal: options.signal, timeout: Math.max(Number(options.timeout) || 0, 30000)});
          entry.cancel = relayed.abort || relayed.cancel;
          return relayed.then(function (value) { current(); return value; });
        }"""
assert s.count(old) == 1, 'anchor not found'
n = s.replace(old, new)
r = subprocess.run(['node', '--check', '-'], input=n, text=True, capture_output=True)
if r.returncode: r = subprocess.run(['node', '-e', 'new Function(require("fs").readFileSync(0,"utf8"))'], input=n, text=True, capture_output=True)
assert r.returncode == 0, r.stderr
bak = '/root/zui-web-relay-before-%d' % int(time.time()); os.makedirs(bak); shutil.copy2(p, bak)
for h in ('index.html',):
    hp = os.path.join(rel, h)
    if os.path.exists(hp): shutil.copy2(hp, bak)
tmp = p + '.tmp'; open(tmp, 'w', encoding='utf8').write(n); shutil.copymode(p, tmp)
st = os.stat(p); os.chown(tmp, st.st_uid, st.st_gid); os.replace(tmp, p)
hp = os.path.join(rel, 'index.html'); h = open(hp, encoding='utf8').read()
h2 = re.sub(r'zui-api\.js(\?[^"\']*)?', 'zui-api.js?r=webrelay1', h)
if h2 != h:
    st = os.stat(hp); open(hp + '.tmp', 'w', encoding='utf8').write(h2); shutil.copymode(hp, hp + '.tmp'); os.chown(hp + '.tmp', st.st_uid, st.st_gid); os.replace(hp + '.tmp', hp)
print('applied; backup', bak)
