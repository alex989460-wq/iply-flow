import test from 'node:test';
import assert from 'node:assert/strict';
import {PLATFORM_DEFAULTS,platformCatalogue,validatePlatform,platformUrl} from './platform-policy.mjs';
test('Web is absent from the public platform catalogue, without altering devices',()=>{
 const devices=[{id:'browser',platform:'web'}],db={devices,settings:{}};
 assert.equal(platformCatalogue(db).some(p=>p.id==='web'),false);assert.equal(db.devices[0].platform,'web');
});
test('Administrator availability changes survive catalogue readback',()=>{
 const p=validatePlatform({...PLATFORM_DEFAULTS[0],status:'available',url:'https://zuiplayer.com/install/lg',visible:false});
 const read=platformCatalogue({settings:{platforms:{lg:p}}})[0];assert.equal(read.status,'available');assert.equal(read.visible,false);assert.equal(read.url,'https://zuiplayer.com/install/lg');
});
test('Catalogue rejects executable, credential and private links',()=>{
 for(const url of ['javascript:alert(1)','http://store.example/app','https://user:pass@store.example/app','https://127.0.0.1/app','https://localhost/app'])assert.throws(()=>platformUrl(url));
});