#!/usr/bin/env python3
"""Add FR/DE/TR to the ZUI public site and footer legal/contact links (presentation only)."""
import json,sys,pathlib
src=pathlib.Path(sys.argv[1]);extra=json.load(open(sys.argv[2]))
i18n=src/'site-i18n.js';site=src/'site.js'
t=i18n.read_text()
if 'zui-extra-langs' not in t:
    old="[['pt-BR','Português'],['en','English'],['es','Español']]"
    assert t.count(old)==1 and t.count('const apply=')==1
    t=t.replace(old,"[['pt-BR','Português'],['en','English'],['es','Español'],['fr','Français'],['de','Deutsch'],['tr','Türkçe']]")
    t=t.replace('const apply=','/*zui-extra-langs*/for(const [l,v] of Object.entries('+json.dumps(extra,ensure_ascii=False)+'))dictionaries[l]=Object.assign(dictionaries[l]||{},v);\nconst apply=',1)
    i18n.write_text(t)
s=site.read_text()
old='<a href="/politica-de-privacidade">Política de Privacidade</a>'
if old in s:
    s=s.replace(old,'<a href="/politica-de-privacidade" data-i18n="f_privacy">Política de Privacidade</a><a href="/termos-de-uso" data-i18n="f_terms">Termos de Uso</a><a href="mailto:contato@zuiplayer.com"><span data-i18n="f_contact">Contato</span>: contato@zuiplayer.com</a>')
    site.write_text(s)
print('ok')
