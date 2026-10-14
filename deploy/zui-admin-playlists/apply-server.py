#!/usr/bin/env python3
"""Adds PUT /api/admin/devices/:id/playlists (select | edit | remove) to server.mjs.
Reuses owns(), resolveSourceInput(), sourceError(), removeDeviceSource() and saveDb(),
so licence reconciliation, auditing and partner-code binding rules stay unchanged."""
import sys, pathlib
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/zuiplayer/admin-api/server.mjs')
s = p.read_text()
MARK = '/* zui-admin-playlists */'
if MARK in s:
    print('already applied'); sys.exit(0)
anchor = "const match=path.match(/^\\/api\\/admin\\/devices\\/([^/]+)(?:\\/(source|enabled|owner|name))?$/);"
if s.count(anchor) != 1:
    sys.exit('anchor not found')
route = MARK + r"""
      const plMatch=path.match(/^\/api\/admin\/devices\/([^/]+)\/playlists$/);
      if(plMatch&&req.method==='PUT'){const d=db.devices.find(d=>d.id===plMatch[1]);if(!d){send(res,404,{error:'Dispositivo não encontrado'});return;}if(!owns(user,d)){send(res,403,{error:'Dispositivo não pertence à sua conta'});return;}
        const data=requestBody||{},lists=devicePlaylists(d),p=lists.find(x=>x.id===String(data.playlistId||''));
        if(!p){send(res,404,{error:'Playlist não encontrada neste aparelho'});return;}
        if(p.managementHash&&user.role!=='admin'&&data.action!=='select'){send(res,403,{error:'Esta playlist foi protegida pelo cliente. Somente o administrador pode alterá-la.'});return;}
        if(data.action==='select'){d.activePlaylistId=p.id;d.source=p.source;d.serverCode=p.source?.serverCode||null;}
        else if(data.action==='remove'){removeDeviceSource(d,p.id);}
        else if(data.action==='edit'){const candidate=resolveSourceInput(db,data.source,p.source,d);const err=sourceError(candidate);if(err){send(res,400,{error:err});return;}p.source=candidate;if(d.activePlaylistId===p.id){d.source=candidate;d.serverCode=candidate.serverCode||null;}}
        else{send(res,400,{error:'Operação inválida'});return;}
        d.revision=(d.revision||0)+1;d.updatedAt=Date.now();saveDb(db);send(res,200,{device:publicDevice(d)});return;
      }
      """
s = s.replace(anchor, route + anchor)
p.write_text(s)
print('applied')
