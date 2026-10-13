#!/usr/bin/env python3
"""Adds customer MAC transfer to /minhas-listas without touching playback, device
credentials or licence rules. Usage: apply.py <admin-api dir> <deploy dir>"""
import sys, os, shutil, time, subprocess
api, src = sys.argv[1], sys.argv[2]
cp, pp = os.path.join(api, 'client.mjs'), os.path.join(api, 'public', 'playlist-portal.js')
c, p = open(cp, encoding='utf8').read(), open(pp, encoding='utf8').read()
if 'zui-mac-transfer' in c: print('already applied'); sys.exit(0)
imp = "import {transferActivation,transfersRemaining} from './mac-transfer.mjs';\nimport {audit as auditTransfer} from './security.mjs';\n"
anchor = "  send(res,404,{error:'Página não encontrada'});return true;\n}"
assert c.count(anchor) == 1, 'anchor'
route = r"""  /* zui-mac-transfer */
  if(path==='/api/client/transfer'){
    if(playlistSessionDevice(req,db,ctx.database)?.id===device.id){send(res,403,{error:'Entre com o MAC e a chave do aparelho para transferir a ativação.'});return true;}
    if(req.method==='GET'){send(res,200,{remaining:transfersRemaining(device),mac:device.mac});return true;}
    if(req.method!=='POST'){send(res,405,{error:'Método inválido.'});return true;}
    if(!sameSitePlaylistRequest(req)&&!(req.headers.authorization&&sessionDevice(req,db,equal))){send(res,403,{error:'Origem de sessão inválida.'});return true;}
    if(!ctx.database.consume('mac-transfer',device.id,5,3600000)){send(res,429,{error:'Muitas tentativas. Aguarde uma hora.'});return true;}
    const input=await body(req);db=loadDb();device=sessionDevice(req,db,equal,ctx.database);
    if(!device){send(res,401,{error:'Sessão encerrada. Entre novamente.'});return true;}
    const newMac=normalizeMac(input.newMac),newKey=String(input.newKey||'').trim().toUpperCase();
    const target=db.devices.find(d=>d.mac===newMac);
    if(!newMac||!target||!portalAuthorized(target,newKey,equal)){send(res,401,{error:'MAC ou chave do aparelho novo inválidos. Abra o ZUI no aparelho novo e confira os dados da tela.'});return true;}
    const fromMac=device.mac,result=transferActivation(device,target);
    auditTransfer(db,'device.mac_transfer',target.id,{fromMac,toMac:target.mac,remaining:result.remaining});saveDb(db);
    clientSessions.delete(sessionToken(req,'zuiClient'));cookieSession(res,'zuiClient','',0);
    send(res,200,{ok:true,newMac:target.mac,remaining:result.remaining});return true;
  }
"""
n = imp + c.replace(anchor, route + anchor)
open('/tmp/zui-client-check.mjs', 'w').write(n)
shutil.copy2(os.path.join(src, 'mac-transfer.mjs'), '/tmp/mac-transfer.mjs')
r = subprocess.run(['node', '--check', '/tmp/zui-client-check.mjs'], capture_output=True, text=True)
assert r.returncode == 0, r.stderr
bak = '/root/zui-mac-transfer-before-%d' % int(time.time()); os.makedirs(bak)
shutil.copy2(cp, bak); shutil.copy2(pp, bak)
def put(path, text, like):
    st = os.stat(like); tmp = path + '.tmp'; open(tmp, 'w', encoding='utf8').write(text)
    os.chmod(tmp, st.st_mode & 0o777); os.chown(tmp, st.st_uid, st.st_gid); os.replace(tmp, path)
put(os.path.join(api, 'mac-transfer.mjs'), open(os.path.join(src, 'mac-transfer.mjs'), encoding='utf8').read(), cp)
put(cp, n, cp)
put(pp, p + '\n' + open(os.path.join(src, 'portal-transfer.js'), encoding='utf8').read(), pp)
print('applied; backup', bak)
