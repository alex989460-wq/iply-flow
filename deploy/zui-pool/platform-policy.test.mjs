import test from 'node:test';
import assert from 'node:assert/strict';
import {PLATFORM_DEFAULTS,platformCatalogue,validatePlatform,platformUrl} from './platform-policy.mjs';
test('Roku is available as confirmed by the owner',()=>{
 assert.equal(platformCatalogue({settings:{}}).find(p=>p.id==='roku').status,'available');
});
test('Web is absent from the public platform catalogue, without altering devices',()=>{
 const devices=[{id:'browser',platform:'web'}],db={devices,settings:{}};
 assert.equal(platformCatalogue(db).some(p=>p.id==='web'),false);assert.equal(db.devices[0].platform,'web');
});
test('Administrator availability changes survive catalogue readback',()=>{
 const p=validatePlatform({...PLATFORM_DEFAULTS.find(p=>p.id==='lg'),status:'available',url:'https://zuiplayer.com/install/lg',visible:false});
 const read=platformCatalogue({settings:{platforms:{lg:p}}}).find(x=>x.id==='lg');assert.equal(read.status,'available');assert.equal(read.visible,false);assert.equal(read.url,'https://zuiplayer.com/install/lg');
});
test('Windows links to the supplied Microsoft listing; Xbox remains unconfirmed until supported',()=>{
 const catalogue=platformCatalogue({settings:{}});
 assert.equal(catalogue.find(p=>p.id==='windows').status,'available');
 assert.equal(catalogue.find(p=>p.id==='windows').url,'https://apps.microsoft.com/detail/9NX9KT313W7P');
 assert.equal(catalogue.find(p=>p.id==='xbox').status,'pending');
});
test('Administrator can enable Xbox independently when its package is released',()=>{
 const xbox=validatePlatform({...PLATFORM_DEFAULTS.find(p=>p.id==='xbox'),status:'available'});
 const read=platformCatalogue({settings:{platforms:{xbox}}});
 assert.equal(read.find(p=>p.id==='xbox').status,'available');
 assert.equal(read.find(p=>p.id==='windows').status,'available');
 assert.equal(read.find(p=>p.id==='xbox').url,'https://apps.microsoft.com/detail/9NX9KT313W7P');
});
test('Catalogue rejects executable, credential and private links',()=>{
 for(const url of ['javascript:alert(1)','http://store.example/app','https://user:pass@store.example/app','https://127.0.0.1/app','https://localhost/app'])assert.throws(()=>platformUrl(url));
});