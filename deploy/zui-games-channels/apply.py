#!/usr/bin/env python3
"""ZUI games channel matching: feed names (PRIME VIDEO, HBO MAX, APPLE TV, DISNEY+)
must match playlist channels (AMAZON PRIME VIDEO 01, HBO MAX 1, APPLE TV 02, DISNEY + 02 HD).
Patches zui-games.js in every served release: adds normal() aliases and collapses
numbered event variants to the brand key (new releases: family regex in matchKeys;
old releases <=2.1.15: collapse inside normal()). Idempotent. Re-apply after app upgrades.
Usage: apply.py <dist_dir>  (default /opt/zuiplayer/dist)"""
import sys, glob, shutil, time, os

root = sys.argv[1] if len(sys.argv) > 1 else '/opt/zuiplayer/dist'
bak = '/root/zui-games-channels-%d' % int(time.time())

DISNEY_ALIAS = 'if (text === "disney+" || text === "disney +" || text === "disney plus") return "disney+";'
FAMILIES = 'disney\\+|cazetv|goat|onefootball|premiere fc|prime video|apple tv|hbo max'

# New releases (>=2.1.16): matchKeys family regex.
NEW_FAMILY_OLD = 'family = key.match(/^(disney\\+|cazetv|goat|onefootball|premiere fc)(?:\\s+(?:evento|jogo|canal|live)?\\s*\\d{1,3})(?:\\s|$)/);'
NEW_FAMILY_NEW = 'family = key.match(/^(%s)(?:\\s+(?:evento|jogo|canal|live)?\\s*\\d{1,3})(?:\\s|$)/);' % FAMILIES
NEW_ALIAS_ADD = DISNEY_ALIAS + '\n    if (/^amazon prime video/.test(text)) text = text.replace(/^amazon /, "");\n    if (text === "primevideo" || text === "prime video") return "prime video";\n    if (text === "hbomax" || text === "hbo max") return "hbo max";'

# Old releases (<=2.1.15): exact-match only, collapse inside normal().
OLD_ANCHOR = '    if (/^amazon prime video/.test(text)) text = text.replace(/^amazon /, "");'
OLD_ADD = DISNEY_ALIAS + '\n    text = text.replace(/\\bdisney\\s*(?:\\+|plus)/g, "disney+");\n' + OLD_ANCHOR + '\n    if (text === "primevideo") text = "prime video";\n    if (text === "hbomax") text = "hbo max";\n    text = text.replace(/^(%s)(\\s+(?:evento|jogo|canal|live)?\\s*\\d{1,3})?$/, "$1");\n    if (text === "prime video" || text === "hbo max" || text === "apple tv") return text;' % FAMILIES

done, skipped = [], []
for p in sorted(glob.glob(os.path.join(root, 'leve/releases/*/zui-games.js'))):
    s = open(p, encoding='utf8').read()
    if 'prime video|apple tv|hbo max' in s and 'disney\\s*(?:\\+|plus)' in s:
        continue  # already patched
    if s.count(DISNEY_ALIAS) != 1:
        skipped.append(p); continue
    os.makedirs(bak, exist_ok=True)
    shutil.copy2(p, os.path.join(bak, p.split('/')[-2] + '-zui-games.js'))
    if NEW_FAMILY_OLD in s:
        s = s.replace(DISNEY_ALIAS, NEW_ALIAS_ADD).replace(NEW_FAMILY_OLD, NEW_FAMILY_NEW)
    else:
        s = s.replace(DISNEY_ALIAS, OLD_ADD)
    open(p, 'w', encoding='utf8').write(s)
    done.append(p.split('/')[-2])
print('patched:', done)
if skipped: print('SKIPPED (anchor missing):', skipped)
print('backup:', bak)
