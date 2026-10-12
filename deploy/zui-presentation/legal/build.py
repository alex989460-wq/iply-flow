import re, html, sys
sys.path.insert(0, '/tmp/legal')
from content import L, UI, PRIV, TERMS
src = open('/tmp/legal/privacy.orig.html', encoding='utf-8').read()
head = src[:src.find('<body')]
css = '<style id="zui-legal-i18n">.zl{display:none}' + ''.join(f'html[lang="{l}"] .zl-{l}' + (',' if i < len(L)-1 else '') for i, l in enumerate(L)) + '{display:block}.zv-policy-links{display:flex;gap:18px;flex-wrap:wrap;margin-top:28px}</style>'
script = '<script defer src="/legal-assets/legal.js?v=20261012"></script>'

def body(doc, other_href, other_key):
    out = ['<body class="site-policy zv-public"><main class="zv-policy-main">']
    for l in L:
        k, t, lead, (hh, hp), secs = doc[l]; u = UI[l]
        a = [f'<div class="zl zl-{l}" lang="{l}"><header class="zv-policy-intro"><span class="zv-policy-kicker">{k}</span><h1>{t}</h1><p class="zv-policy-lead">{lead}</p><time class="zv-policy-date" datetime="2026-10-12">{u["updated"]}</time></header><div class="zv-policy-content">']
        a.append('<section class="zv-policy-section zv-policy-highlight"><h2>%s</h2>%s</section>' % (hh, ''.join(f'<p>{p}</p>' for p in hp)))
        for h2, ps, lis, after in secs:
            s = f'<section class="zv-policy-section"><h2>{h2}</h2>' + ''.join(f'<p>{p}</p>' for p in ps)
            if lis: s += '<ul>' + ''.join(f'<li>{x}</li>' for x in lis) + '</ul>'
            if after: s += f'<p>{after}</p>'
            a.append(s + '</section>')
        a.append(f'</div><div class="zv-policy-links"><a class="zv-policy-back" href="/">{u["back"]}</a><a class="zv-policy-back" href="{other_href}">{u[other_key]}</a></div></div>')
        out += a
    out.append('</main></body></html>')
    return ''.join(out)

def page(doc, title, desc, other_href, other_key):
    h = head.replace('</head>', css + script + '</head>')
    h = re.sub(r'<title>.*?</title>', f'<title>{title} · ZUI Player</title>', h, 1)
    h = re.sub(r'(<meta name="description" content=")[^"]*', r'\g<1>' + desc, h, 1)
    h = re.sub(r'(<meta property="og:title" content=")[^"]*', r'\g<1>' + title + ' · ZUI Player', h, 1)
    h = re.sub(r'(<meta property="og:description" content=")[^"]*', r'\g<1>' + desc, h, 1)
    return h + body(doc, other_href, other_key)

open('/tmp/legal/privacy.html', 'w', encoding='utf-8').write(page(PRIV, 'Política de Privacidade', 'Política de Privacidade do ZUI Player: dados tratados, segurança, direitos do usuário e responsabilidade por conteúdos e playlists.', '/termos-de-uso', 'see_terms'))
open('/tmp/legal/terms.html', 'w', encoding='utf-8').write(page(TERMS, 'Termos de Uso', 'Termos de Uso do ZUI Player: licença do aplicativo, pagamento, responsabilidades do usuário e limites do serviço.', '/politica-de-privacidade', 'see_priv'))
print('built')
