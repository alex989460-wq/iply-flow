#!/usr/bin/env python3
"""Lets a fresh partner-code login lift an admin-forced expiry.

device.adminExpiredAt keeps a device expired. It is lifted by a later paid
activeUntil, or when the customer logs in again with a partner code after the
forced expiry (device.partnerLoginAt) AND the partner licence is currently
validated. Background revalidation alone never lifts it.
Usage: apply.py <admin-api dir>   (idempotent, keeps a backup)"""
import sys, os, shutil, time, subprocess
api = sys.argv[1]
paths = {n: os.path.join(api, n) for n in ('commerce.mjs', 'server.mjs', 'partners.mjs')}
src = {n: open(p, encoding='utf8').read() for n, p in paths.items()}
if 'zui-license-expire' in src['commerce.mjs']:
    print('already applied'); sys.exit(0)

def swap(name, old, new):
    assert src[name].count(old) == 1, 'anchor not found in ' + name
    src[name] = src[name].replace(old, new)

# 1. licence: compute partner state first; a newer partner login lifts the forced expiry.
partner_line = "  const partner=device.partnerLicense,partnerAllowed=!!partner?.allowed&&partner.playlistId===device.activePlaylistId&&partner.validUntil>now&&(!partner.expiresAt||partner.expiresAt>now);\n"
swap('commerce.mjs', partner_line, '')
swap('commerce.mjs', "  if(device.adminExpiredAt&&!(Number(device.activeUntil||0)>Number(device.adminExpiredAt)))",
     "  /* zui-license-expire */\n" + partner_line +
     "  if(device.adminExpiredAt&&!(Number(device.activeUntil||0)>Number(device.adminExpiredAt))&&!(partnerAllowed&&Number(device.partnerLoginAt||0)>Number(device.adminExpiredAt)))")

# 2. TV code login on a partner server records the login moment (verified or Direct).
swap('server.mjs', "d.serverCode=activeServer.code;if(!unverified)recordPartnerAuthorization(",
     "d.serverCode=activeServer.code;if(activeServer.partner===true)d.partnerLoginAt=Date.now();if(!unverified)recordPartnerAuthorization(")

# 3. Verified partner authorisation (TV and /minhas-listas) also records it.
swap('partners.mjs', " device.partnerAccessRequired=true;\n confirmedLicense(db,device,playlist,server,expiresAt,now,providerExpiryDetails(info));return true;",
     " device.partnerAccessRequired=true;device.partnerLoginAt=now;\n confirmedLicense(db,device,playlist,server,expiresAt,now,providerExpiryDetails(info));return true;")

for n, text in src.items():
    chk = '/tmp/zui-le-check-' + n
    open(chk, 'w', encoding='utf8').write(text)
    r = subprocess.run(['node', '--check', chk], capture_output=True, text=True)
    assert r.returncode == 0, n + ': ' + r.stderr

bak = '/root/zui-license-expire-before-%d' % int(time.time()); os.makedirs(bak)
for p in paths.values(): shutil.copy2(p, bak)
for n, p in paths.items():
    st = os.stat(p); tmp = p + '.tmp'
    open(tmp, 'w', encoding='utf8').write(src[n])
    os.chmod(tmp, st.st_mode & 0o777); os.chown(tmp, st.st_uid, st.st_gid); os.replace(tmp, p)
print('applied; backup', bak)
