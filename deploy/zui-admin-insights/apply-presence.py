#!/usr/bin/env python3
"""Add read-only presence reporting to the installed API; no entitlement changes."""
import pathlib,sys
root=pathlib.Path(sys.argv[1])
p=root/'server.mjs'
s=p.read_text()
if "import {devicePresence} from './presence.mjs';" not in s:
 s="import {devicePresence} from './presence.mjs';\n"+s
anchor='function publicDevice(d,db=loadDb()) {return {'
if anchor in s:
 s=s.replace(anchor,'function publicDevice(d,db=loadDb(),playing=new Set(database.activePlaybackDevices())) {return {...devicePresence(d,playing.has(d.id)),',1)
old="if(path==='/api/admin/devices'&&req.method==='GET'){send(res,200,{devices:db.devices.filter(d=>owns(user,d)).map(d=>publicDevice(d,db))});return;}"
new="if(path==='/api/admin/devices'&&req.method==='GET'){const playing=new Set(database.activePlaybackDevices());send(res,200,{devices:db.devices.filter(d=>owns(user,d)).map(d=>publicDevice(d,db,playing))});return;}"
if old in s:s=s.replace(old,new,1)
assert '...devicePresence(d,playing.has(d.id))' in s
# Management summaries use exactly the same presence evidence.
s=s.replace('online:!!d.lastSeenAt&&now-d.lastSeenAt<90000','...devicePresence(d,new Set(database.activePlaybackDevices()).has(d.id),now)')
p.with_suffix('.mjs.tmp').write_text(s)
p.with_suffix('.mjs.tmp').replace(p)