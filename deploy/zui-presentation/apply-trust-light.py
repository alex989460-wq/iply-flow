#!/usr/bin/env python3
"""Idempotent public palette override, applied only to pages already marked public."""
import pathlib,re,sys
root=pathlib.Path(sys.argv[1]);css=pathlib.Path(sys.argv[2]).read_text()
for p in root.glob('*.html'):
 s=p.read_text()
 if 'zv-public' not in s or p.name=='index.html':continue
 s=re.sub(r'<style id="zui-trust-light">.*?</style>','',s,flags=re.S)
 s=s.replace('</head>','<style id="zui-trust-light">'+css+'</style></head>',1)
 tmp=p.with_suffix('.html.tmp');tmp.write_text(s);tmp.replace(p)
 print('updated',p.name)