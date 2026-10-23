/* Pure layout and import model shared by the Workspace UI and its checks. */
(function(root){
'use strict';
const timeframes={'5m':{interval:'1s',limit:300,ms:300000},'15m':{interval:'1m',limit:15,ms:900000},'1h':{interval:'1m',limit:60,ms:3600000},'4h':{interval:'5m',limit:48,ms:14400000},'24h':{interval:'15m',limit:96,ms:86400000},'7d':{interval:'1h',limit:168,ms:604800000},'30d':{interval:'4h',limit:180,ms:2592000000}};
function parseKlines(rows){return (Array.isArray(rows)?rows:[]).map(r=>({t:Number(r[0]),o:Number(r[1]),h:Number(r[2]),l:Number(r[3]),c:Number(r[4])})).filter(r=>Object.values(r).every(Number.isFinite)&&r.t>=0&&Math.min(r.o,r.h,r.l,r.c)>0&&r.h>=Math.max(r.o,r.c)&&r.l<=Math.min(r.o,r.c)&&r.h>=r.l).sort((a,b)=>a.t-b.t);}
const C=root.INJWorkspaceCatalog||(typeof require==='function'?require('./workspace-catalog.js'):null);
const types=C.entries.map(e=>e.type);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Math.round(Number(n)||min)));
const rect=(r,cols)=>({x:clamp(r?.x,0,cols-1),y:clamp(r?.y,0,10000),w:clamp(r?.w,1,cols),h:clamp(r?.h,2,16)});
function normalize(r,cols){r=rect(r,cols);r.x=Math.min(r.x,cols-r.w);return r;}
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
function settle(items,key,cols,priority){
 const placed=[];const ordered=priority?[...items.filter(i=>i.uid===priority),...items.filter(i=>i.uid!==priority)]:items;
 ordered.forEach(i=>{let r=normalize(i.layouts[key],cols),hit;while((hit=placed.find(p=>overlaps(r,p))))r.y=hit.y+hit.h;i.layouts[key]=r;placed.push(r);});return items;
}
function firstFree(items,key,cols,w,h){
 w=Math.min(w,cols);for(let y=0;y<12000;y++)for(let x=0;x<=cols-w;x++){const r={x,y,w,h};if(!items.some(i=>overlaps(r,i.layouts[key])))return r;}return {x:0,y:12000,w,h};
}
function aggregate(rows){
 if(!rows.length||!rows.every(r=>r&&['staked','available','rewards'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>=0)))return null;
 const sum=k=>rows.reduce((a,r)=>a+r[k],0),staked=sum('staked'),available=sum('available'),rewards=sum('rewards');
 const total=rows.reduce((a,r)=>a+(Number.isFinite(r.total)?r.total:r.staked+r.available+r.rewards+(Number.isFinite(r.unbonding)?r.unbonding:0)),0);
 const aprComplete=rows.every(r=>r.staked===0||(typeof r.personalApr==='number'&&Number.isFinite(r.personalApr)&&r.personalApr>0));
 const daily=aprComplete?rows.reduce((s,r)=>s+r.staked*(r.personalApr||0)/100/365,0):null;
 return {staked,available,rewards,total,daily,at:Math.min(...rows.map(r=>r.updated||0)),verified:rows.every(r=>r.verified)};
}
function sanitize(input){
 if(!input||input.version!==1||!Array.isArray(input.presets)||input.presets.length>50)throw Error('Invalid workspace');
 const ids=new Set();const presets=input.presets.map(p=>{
  if(!p||typeof p.id!=='string'||p.id.length>100||!p.id||ids.has(p.id)||!Array.isArray(p.items)||p.items.length>80)throw Error('Invalid preset');ids.add(p.id);
  const seen=new Set();const items=p.items.map(i=>{
   if(!i||!types.includes(i.type)||typeof i.uid!=='string'||!i.uid||i.uid.length>100||seen.has(i.uid))throw Error('Invalid card');seen.add(i.uid);
   const source=C.byType[i.type].scope==='market'?'market':String(i.source||'selected');if(source==='market'&&C.byType[i.type].scope!=='market')throw Error('Invalid wallet source');if(!['selected','all','market'].includes(source)&&!/^inj1[a-z0-9]{38,60}$/.test(source))throw Error('Invalid wallet');
   return {uid:i.uid.slice(0,100),type:i.type,source,title:String(i.title||'').slice(0,60),style:['solid','glass','bare'].includes(i.style)?i.style:'solid',border:i.border!==false,details:i.details!==false,timeframe:Object.hasOwn(timeframes,i.timeframe)?i.timeframe:'1h',chartStyle:i.chartStyle==='candles'?'candles':'line',amount:Number.isFinite(Number(i.amount))?Math.max(0,Math.min(1e12,Number(i.amount))):1,scenarioPrice:Number.isFinite(Number(i.scenarioPrice))?Math.max(0,Math.min(1e9,Number(i.scenarioPrice))):100,targetCoin:/^[a-z0-9-]{1,100}$/.test(i.targetCoin||'')?i.targetCoin:'bitcoin',years:clamp(i.years||5,1,30),historyRange:['1d','7d','30d','all'].includes(i.historyRange)?i.historyRange:'30d',direction:i.direction==='fiatToInj'?'fiatToInj':'injToFiat',goal:[.5,1,3,5,10,15,20,30,50].includes(Number(i.goal))?Number(i.goal):1,layouts:{desktop:normalize(i.layouts?.desktop||{w:4,h:3},12),mobile:normalize(i.layouts?.mobile||{w:4,h:3},4)}};
  });settle(items,'desktop',12);settle(items,'mobile',4);
  return {id:p.id.slice(0,100),name:String(p.name||'Workspace').slice(0,50),locked:!!p.locked,items};
 });
 if(!presets.length)throw Error('No presets');return {version:1,presets,active:presets.some(p=>p.id===input.active)?input.active:presets[0].id,defaultId:presets.some(p=>p.id===input.defaultId)?input.defaultId:null};
}
const api={timeframes,parseKlines,types,normalize,overlaps,settle,firstFree,aggregate,sanitize};if(typeof module!=='undefined')module.exports=api;root.INJWorkspaceModel=api;
})(globalThis);
