const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('./workspace-model.js');
const card=(uid,r)=>({uid,type:'total',source:'selected',layouts:{desktop:{...r},mobile:{x:0,y:0,w:4,h:3}}});
test('moving or enlarging a card pushes every collision without changing priority rectangle',()=>{
 const items=[card('a',{x:0,y:0,w:8,h:6}),card('b',{x:4,y:0,w:4,h:3}),card('c',{x:4,y:3,w:4,h:3})];
 M.settle(items,'desktop',12,'a');assert.deepEqual(items[0].layouts.desktop,{x:0,y:0,w:8,h:6});
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.ok(!M.overlaps(items[i].layouts.desktop,items[j].layouts.desktop));
 assert.equal(items[1].layouts.desktop.y,6);assert.equal(items[2].layouts.desktop.y,9);
});
test('desktop operations preserve mobile geometry',()=>{const items=[card('a',{x:0,y:0,w:12,h:5}),card('b',{x:0,y:0,w:4,h:3})];const before=JSON.stringify(items.map(i=>i.layouts.mobile));M.settle(items,'desktop',12,'a');assert.equal(JSON.stringify(items.map(i=>i.layouts.mobile)),before)});
test('new cards fill available columns before adding a row',()=>{const a=card('a',{x:0,y:0,w:4,h:3});assert.deepEqual(M.firstFree([a],'desktop',12,4,3),{x:4,y:0,w:4,h:3});assert.deepEqual(M.firstFree([a],'mobile',4,4,3),{x:0,y:3,w:4,h:3})});
test('aggregate uses each wallet APR and includes unbonding in total',()=>{const a={staked:100,available:2,rewards:3,unbonding:5,personalApr:10,updated:100,verified:true},b={staked:200,available:1,rewards:4,total:205,personalApr:5,updated:200,verified:true};const r=M.aggregate([a,b]);assert.equal(r.total,315);assert.equal(r.daily,20/365);assert.equal(r.at,100);assert.equal(r.verified,true)});
test('partial multiwallet data stays unavailable; unknown APR does not become zero',()=>{assert.equal(M.aggregate([{staked:10,available:0,rewards:1},null]),null);assert.equal(M.aggregate([]),null);assert.equal(M.aggregate([{staked:10,available:0,rewards:1}]).daily,null)});
test('imports retain duplicate card types with independent wallet sources and layouts',()=>{const a=card('a',{x:0,y:0,w:4,h:3}),b=card('b',{x:4,y:0,w:4,h:3});b.source='inj1'+'a'.repeat(38);const r=M.sanitize({version:1,presets:[{id:'p',name:'My setup',items:[a,b]}],active:'p',defaultId:'p'});assert.equal(r.presets[0].items.length,2);assert.notEqual(r.presets[0].items[0].source,r.presets[0].items[1].source);assert.equal(r.defaultId,'p')});
test('malformed imports reject unknown types, duplicate IDs and wallet sources',()=>{const wrap=items=>({version:1,presets:[{id:'p',items}]});assert.throws(()=>M.sanitize(wrap([{...card('x',{}),type:'script'}])));assert.throws(()=>M.sanitize(wrap([card('x',{}),card('x',{})])));assert.throws(()=>M.sanitize(wrap([{...card('x',{}),source:'javascript:bad'}])));assert.throws(()=>M.sanitize(wrap([{...card('x',{}),source:'market'}])))});
