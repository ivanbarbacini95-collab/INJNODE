/* INJ Workspace PRO: additive editor controls. All native widget renderers stay untouched. */
(() => {
'use strict';
const A=window.INJWorkspaceProAPI;
if(!A)return;
const $=id=>document.getElementById(id);
const T=(it,en)=>A.t(it,en);
const grid=$('wsGrid');
const selected=new Set();
const undoStack=[],redoStack=[];
let dragBefore=null,monitorOpen=false,prevStatus=0;
const snapshot=()=>JSON.stringify(A.getDb());
const preset=()=>A.active();
const items=()=>preset().items;
const get=id=>items().find(i=>i.uid===id);
const allowed=()=>!preset().locked;
const notice=A.notice;
function pushHistory(before=snapshot()){
 if(undoStack.at(-1)!==before){undoStack.push(before);if(undoStack.length>80)undoStack.shift();}
 redoStack.length=0;buttons();
}
function restore(json){
 try{
  const replacement=A.model.sanitize(JSON.parse(json)),db=A.getDb();
  Object.keys(db).forEach(k=>delete db[k]);
  Object.assign(db,replacement);selected.clear();dragBefore=null;
  A.persist();A.layout();A.refresh();buttons();updateStatus(true);
 }catch(err){console.warn('Workspace history restore skipped',err);}
}
function undo(){if(!undoStack.length)return;const current=snapshot(),previous=undoStack.pop();redoStack.push(current);restore(previous);}
function redo(){if(!redoStack.length)return;const current=snapshot(),next=redoStack.pop();undoStack.push(current);restore(next);}
function mutate(fn){
 if(!allowed())return notice(T('Sblocca il layout per modificare','Unlock the layout to edit'));
 pushHistory();fn();A.persist();A.layout();A.refresh();buttons();
}
function select(uid,additive){
 const item=get(uid);if(!item)return;
 const group=item.group||'';
 const groupIds=group?items().filter(x=>x.group===group).map(x=>x.uid):[uid];
 if(!additive)selected.clear();
 if(additive&&selected.has(uid))groupIds.forEach(x=>selected.delete(x));
 else groupIds.forEach(x=>selected.add(x));
 buttons();
}
function selection(){return items().filter(i=>selected.has(i.uid));}
function languageButton(it,en){return T(it,en);}
function control(label,action,cls){
 const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.proAction=action;
 if(cls)b.className=cls;return b;
}
const bar=document.createElement('div');bar.id='wsProContext';bar.className='ws-pro-context';bar.hidden=true;
bar.setAttribute('aria-label','Workspace editor');
bar.innerHTML='<span id="wsProSelection"></span>';
const actions=[
 ['Compatta','Compact','compact'],['Standard','Standard','standard'],['Espansa','Expanded','expanded'],
 ['Raggruppa','Group','group'],['Separa','Ungroup','ungroup'],['Allinea X','Align left','left'],
 ['Allinea Y','Align top','top'],['Distribuisci','Distribute','distribute'],
 ['Duplica','Duplicate','duplicate'],['Blocca/Sblocca','Lock/Unlock','cardlock'],
 ['Annulla','Undo','undo'],['Ripristina','Redo','redo']
];
for(const [it,en,key] of actions)bar.append(control(languageButton(it,en),key,key==='undo'||key==='redo'?'ws-pro-history':''));
document.querySelector('.ws-toolbar').insertAdjacentElement('afterend',bar);
const historyBar=document.createElement('span');historyBar.className='ws-pro-history-bar';
historyBar.append(control('↶ '+T('Annulla','Undo'),'undo'),control('↷ '+T('Ripristina','Redo'),'redo'));
$('wsSave').insertAdjacentElement('afterend',historyBar);
function buttons(){
 const valid=new Set(items().map(i=>i.uid));
 for(const id of selected)if(!valid.has(id))selected.delete(id);
 const chosen=selection();
 bar.hidden=selected.size===0||!allowed();
 $('wsProSelection').textContent=chosen.length+' '+T('card selezionate','selected cards');
 for(const node of grid.querySelectorAll('.ws-card')){
  node.classList.toggle('ws-pro-selected',selected.has(node.dataset.uid));
  node.classList.toggle('ws-pro-grouped',!!get(node.dataset.uid)?.group);
 }
 for(const btn of document.querySelectorAll('[data-pro-action]')){
  const a=btn.dataset.proAction;
  if(a==='undo')btn.disabled=!undoStack.length;
  else if(a==='redo')btn.disabled=!redoStack.length;
  else if(a==='distribute')btn.disabled=chosen.length<3;
  else if(a!=='monitor')btn.disabled=!chosen.length||!allowed();
 }
}
function resizeView(v){
 const factor=v==='compact'?.72:v==='expanded'?1.42:1;
 mutate(()=>{
  for(const i of selection()){
   i.view=v;
   const spec=A.catalog.byType[i.type];
   for(const key of ['desktop','mobile']){
    const cols=key==='desktop'?12:4,r=i.layouts[key];
    const w=Math.max(.75,Math.min(cols,(key==='desktop'?spec.w:Math.min(4,spec.w))*factor));
    const h=Math.max(1.75,Math.min(48,spec.h*factor));
    i.layouts[key]=A.model.normalize({...r,w,h},cols);
   }
  }
  if(preset().snap)for(const [key,c] of [['desktop',12],['mobile',4]])A.model.settle(items(),key,c);
 });
}
function duplicate(){
 if(items().length+selected.size>80)return notice(T('Limite di 80 card per preset','80 cards per preset limit'));
 mutate(()=>{
  const groupMap=new Map(),created=[];
  for(const i of selection()){
   const copy=structuredClone(i);copy.uid=A.uid();copy.cardLocked=false;
   if(copy.group){if(!groupMap.has(copy.group))groupMap.set(copy.group,A.uid());copy.group=groupMap.get(copy.group);}
   for(const key of ['desktop','mobile'])copy.layouts[key].y+=copy.layouts[key].h;
   items().push(copy);created.push(copy);
  }
  selected.clear();created.forEach(i=>selected.add(i.uid));
  if(preset().snap)for(const [key,c] of [['desktop',12],['mobile',4]])A.model.settle(items(),key,c);
 });
}
function group(set){
 mutate(()=>{
  const id=set?A.uid():'';
  for(const i of selection())i.group=id;
 });
}
function align(axis){
 if(selection().length<2)return;
 mutate(()=>{
  const key=A.mode(),chosen=selection(),anchor=Math.min(...chosen.map(i=>i.layouts[key][axis]));
  if(axis==='x')for(const i of chosen)i.layouts[key].x=Math.max(0,Math.min(A.cols()-i.layouts[key].w,anchor));
  else for(const i of chosen)i.layouts[key].y=anchor;
  if(preset().snap)A.model.settle(items(),key,A.cols());
 });
}
function distribute(){
 if(selection().length<3)return;
 mutate(()=>{
  const key=A.mode(),sorted=selection().sort((a,b)=>a.layouts[key].x-b.layouts[key].x);
  const l=sorted[0].layouts[key].x,r=sorted.at(-1).layouts[key].x;
  sorted.slice(1,-1).forEach((i,index)=>{i.layouts[key].x=Math.min(A.cols()-i.layouts[key].w,Math.max(0,l+(r-l)*(index+1)/(sorted.length-1)));});
  if(preset().snap)A.model.settle(items(),key,A.cols());
 });
}
bar.addEventListener('click',e=>{const a=e.target.closest('[data-pro-action]')?.dataset.proAction;if(a)run(a);});
historyBar.addEventListener('click',e=>{const a=e.target.closest('[data-pro-action]')?.dataset.proAction;if(a)run(a);});
function run(a){
 if(a==='undo')return undo();
 if(a==='redo')return redo();
 if(['compact','standard','expanded'].includes(a))return resizeView(a);
 if(a==='duplicate')return duplicate();
 if(a==='group')return group(true);
 if(a==='ungroup')return group(false);
 if(a==='left')return align('x');
 if(a==='top')return align('y');
 if(a==='distribute')return distribute();
 if(a==='cardlock')return mutate(()=>{const lock=!selection().every(i=>i.cardLocked);for(const i of selection())i.cardLocked=lock;});
}
grid.addEventListener('pointerdown',e=>{
 const node=e.target.closest('.ws-card');if(!node||e.target.closest('button,input,select,a,.ws-section-controls'))return;
 if(e.shiftKey||e.ctrlKey||e.metaKey){select(node.dataset.uid,true);e.stopImmediatePropagation();e.preventDefault();}
 else if(!e.target.closest('.ws-card-head'))select(node.dataset.uid,false);
},true);
document.addEventListener('keydown',e=>{
 const el=e.target,isTyping=el?.matches?.('input,textarea,select,[contenteditable]')||el?.closest?.('dialog');
 if(isTyping)return;
 const cmd=e.ctrlKey||e.metaKey;
 if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
 else if(cmd&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
 else if(cmd&&e.key.toLowerCase()==='d'&&selection().length){e.preventDefault();duplicate();}
 else if(e.key==='Escape'&&!document.querySelector('dialog[open]')&&!document.body.classList.contains('ws-immersive')){selected.clear();buttons();}
});
const guides=()=>{grid.classList.remove('ws-guide-x','ws-guide-y');grid.style.removeProperty('--ws-guide-x');grid.style.removeProperty('--ws-guide-y');};
function alignGuide(d,rect){
 if(preset().snap){guides();return rect;}
 const unit=d.unit,thresholdX=8/unit,thresholdY=8/56;
 const candidates=items().filter(i=>i.uid!==d.item.uid&&!selected.has(i.uid)).map(i=>i.layouts[d.key]);
 let bestX=null,bestY=null;
 const xedges=d.action==='move'?['x','right']:d.edge.includes('e')?['right']:d.edge.includes('w')?['x']:[];
 const yedges=d.action==='move'?['y','bottom']:d.edge.includes('s')?['bottom']:d.edge.includes('n')?['y']:[];
 const xof=(r,edge)=>edge==='right'?r.x+r.w:r.x;
 const yof=(r,edge)=>edge==='bottom'?r.y+r.h:r.y;
 for(const other of candidates){
  for(const edge of xedges)for(const target of [other.x,other.x+other.w]){
   const dist=target-xof(rect,edge);if(Math.abs(dist)<=thresholdX&&(!bestX||Math.abs(dist)<Math.abs(bestX.dist)))bestX={dist,target,edge};
  }
  for(const edge of yedges)for(const target of [other.y,other.y+other.h]){
   const dist=target-yof(rect,edge);if(Math.abs(dist)<=thresholdY&&(!bestY||Math.abs(dist)<Math.abs(bestY.dist)))bestY={dist,target,edge};
  }
 }
 if(bestX){
  if(d.action==='move')rect.x+=bestX.dist;
  else if(bestX.edge==='right')rect.w+=bestX.dist;
  else{rect.x+=bestX.dist;rect.w-=bestX.dist;}
  grid.style.setProperty('--ws-guide-x',bestX.target*unit+'px');grid.classList.add('ws-guide-x');
 }else{grid.classList.remove('ws-guide-x');}
 if(bestY){
  if(d.action==='move')rect.y+=bestY.dist;
  else if(bestY.edge==='bottom')rect.h+=bestY.dist;
  else{rect.y+=bestY.dist;rect.h-=bestY.dist;}
  grid.style.setProperty('--ws-guide-y',bestY.target*56+'px');grid.classList.add('ws-guide-y');
 }else{grid.classList.remove('ws-guide-y');}
 return A.model.normalize(rect,A.cols());
}
window.INJWorkspaceProHooks={
 beforeChange(){pushHistory();},
 pointerSelect(e,item){
  if(e.shiftKey||e.metaKey||e.ctrlKey){select(item.uid,true);return true;}
  if(!selected.has(item.uid))select(item.uid,false);
  return false;
 },
 dragStart(d){dragBefore=snapshot();if(!selected.has(d.item.uid))select(d.item.uid,false);},
 dragMove(d){
  const moving=d.item.layouts[d.key];
  d.item.layouts[d.key]=alignGuide(d,{...moving});
  if(d.action!=='move'||selected.size<2||!selected.has(d.item.uid))return false;
  const dx=d.item.layouts[d.key].x-d.rect.x,dy=d.item.layouts[d.key].y-d.rect.y;
  for(const i of items()){
   if(!selected.has(i.uid)||i.uid===d.item.uid||i.cardLocked)continue;
   const original=d.snapshot.find(x=>x.uid===i.uid);
   if(original)i.layouts[d.key]=A.model.normalize({...original.layouts[d.key],x:original.layouts[d.key].x+dx,y:original.layouts[d.key].y+dy},A.cols());
  }
  return true;
 },
 dragEnd(d,cancel){guides();if(!cancel&&d.moved&&dragBefore)pushHistory(dragBefore);dragBefore=null;},
 afterLayout(){buttons();updateStatus();renderMonitor();},
 refreshStatus(){updateStatus();}
};
function updateStatus(force){
 if(!force&&Date.now()-prevStatus<1900)return;prevStatus=Date.now();
 const price=A.priceInfo(),now=Date.now(),estimates=new Set(['target','daily','hourly','weekly','monthly','yearly','velocity','accumulation','productionlevel','ladder','ladderall','growth','growthsimple','potentialincome','incomeperiods','potential','allpotential']);
 for(const node of grid.querySelectorAll('.ws-card')){
  const i=get(node.dataset.uid);if(!i)continue;
  let state='offline',source='',at=0;
  if(A.marketType(i.type)){at=price.priceAt||0;source=price.priceSource||'Market';state=price.price>0&&at?(now-at<65000?'live':now-at<180000?'snapshot':'offline'):'offline';}
  else{
   const rows=A.rowsFor(i),valid=rows.filter(r=>r&&Number.isFinite(r.updated));
   at=valid.length?Math.min(...valid.map(r=>r.updated)):0;
   source=valid.length&&valid.every(r=>r.verified)?'Injective on-chain':'Wallet cache';
   state=valid.length===rows.length&&at>0?(now-at<90000&&valid.every(r=>r.verified)?'live':'snapshot'):'offline';
   if(state!=='offline'&&estimates.has(i.type))state='estimate';
  }
  const words={live:'LIVE',snapshot:'SNAPSHOT',estimate:T('STIMA','ESTIMATE'),offline:'OFFLINE'};
  const head=node.querySelector('.ws-card-heading');if(!head)continue;
  let badge=head.querySelector('.ws-pro-data');
  if(!badge){badge=document.createElement('span');badge.className='ws-pro-data';head.append(badge);}
  badge.dataset.state=state;badge.textContent=words[state];
  badge.title=source+' · '+(at?new Date(at).toLocaleTimeString():'—');
  node.dataset.proStatus=state;
 }
}
const monitorBtn=control('◉ PRO','monitor','ws-pro-monitor-button');
monitorBtn.title=T('Opzioni modalità Monitor','Monitor mode options');
$('wsFull').insertAdjacentElement('beforebegin',monitorBtn);
const monitorDialog=document.createElement('div');monitorDialog.className='ws-pro-monitor-options';monitorDialog.hidden=true;
monitorDialog.innerHTML='<strong>MONITOR / PRO</strong><button type="button" data-pro-close aria-label="Close">×</button><label><input type="checkbox" name="controls"> '+T('Comandi al passaggio','Hover controls')+'</label><label><input type="checkbox" name="header"> '+T('Mostra intestazioni','Show headings')+'</label><label><input type="checkbox" name="status"> '+T('Mostra stati dati','Show data statuses')+'</label><label><input type="checkbox" name="density"> '+T('Densità compatta','Compact density')+'</label>';
document.body.append(monitorDialog);
const monitorFloat=control('⚙','monitor','ws-pro-monitor-float');monitorFloat.title=monitorBtn.title;document.body.append(monitorFloat);
function monitor(){
 const p=preset();if(!p.monitor)p.monitor={density:'comfortable',controls:true,header:true,status:true};
 return p.monitor;
}
function renderMonitor(){
 const m=monitor();
 document.body.classList.toggle('ws-monitor-condensed',m.density==='compact');
 document.body.classList.toggle('ws-monitor-no-controls',m.controls===false);
 document.body.classList.toggle('ws-monitor-no-headings',m.header===false);
 document.body.classList.toggle('ws-monitor-no-status',m.status===false);
 for(const input of monitorDialog.querySelectorAll('input')){
  input.checked=input.name==='density'?m.density==='compact':m[input.name]!==false;
 }
}
function toggleMonitor(){monitorOpen=!monitorOpen;monitorDialog.hidden=!monitorOpen;renderMonitor();}
monitorBtn.addEventListener('click',toggleMonitor);monitorFloat.addEventListener('click',toggleMonitor);
monitorDialog.querySelector('[data-pro-close]').addEventListener('click',()=>{monitorOpen=false;monitorDialog.hidden=true;});
monitorDialog.addEventListener('change',e=>{
 const field=e.target.name;
 mutate(()=>{const m=monitor();if(field==='density')m.density=e.target.checked?'compact':'comfortable';else m[field]=e.target.checked;});
});
$('wsFull').addEventListener('click',()=>requestAnimationFrame(renderMonitor));
function thumbnail(itemsList){
 const thumb=document.createElement('div');thumb.className='ws-pro-preset-thumb';thumb.setAttribute('aria-hidden','true');
 const n=Math.min(9,itemsList.length);
 for(let j=0;j<n;j++){const tile=document.createElement('span');tile.className='ws-pro-preset-tile';tile.style.flexGrow=String((j%3)+1);thumb.append(tile);}
 return thumb;
}
const templates=[
 {id:'trading',it:'Trading',en:'Trading',types:['chart','orderbook','heatmap','price','change24','marketleaders']},
 {id:'staking',it:'Staking',en:'Staking',types:['staked','rewards','daily','velocity','ladderall','ratio']},
 {id:'treasury',it:'Treasury',en:'Treasury',types:['treasuryoverview','composition','treasuryproduction','walletlist','ownership']},
 {id:'overview',it:'Overview',en:'Overview',types:['worth','portfolio','price','chart','rewards','favoritesheatmap']}
];
const templateArea=document.createElement('section');templateArea.className='ws-pro-templates';
templateArea.innerHTML='<h3>'+T('Setup iniziali PRO','PRO starter setups')+'</h3><p>'+T('Crea un nuovo preset: quello attuale rimane invariato.','Create a new preset; your current setup stays untouched.')+'</p>';
const templateCards=document.createElement('div');templateCards.className='ws-pro-templates-grid';
for(const tmpl of templates){
 const b=control(T(tmpl.it,tmpl.en),'template-'+tmpl.id,'ws-pro-template');
 const heading=document.createElement('strong');heading.textContent=b.textContent;b.replaceChildren(thumbnail(tmpl.types),heading);
 b.title=T('Crea setup','Create setup')+' '+tmpl.it;b.addEventListener('click',()=>buildTemplate(tmpl));
 templateCards.append(b);
}
templateArea.append(templateCards);
$('wsPresetList').insertAdjacentElement('beforebegin',templateArea);
function buildTemplate(tmpl){
 const db=A.getDb();if(db.presets.length>=50)return notice(T('Massimo 50 preset','Maximum 50 presets'));
 pushHistory();
 const p={id:A.uid(),name:tmpl.it,locked:false,snap:true,monitor:{density:'comfortable',controls:true,header:true,status:true},items:[]};
 for(const type of tmpl.types){
  const spec=A.catalog.byType[type];if(!spec)continue;
  const item={...A.catalog.defaults(type),uid:A.uid(),type,source:spec.scope==='market'?'market':'selected',title:'',style:'solid',border:true,details:true,cardLocked:false,view:'standard',group:'',layouts:{}};
  for(const [key,c] of [['desktop',12],['mobile',4]])item.layouts[key]=A.model.firstFree(p.items,key,c,Math.min(c,spec.w),spec.h);
  p.items.push(item);
 }
 db.presets.push(p);db.active=p.id;A.persist();A.layout();A.refresh();$('wsPresetDialog').close();notice(T('Setup creato: ','Setup created: ')+tmpl.it);
}
function previewPresets(){
 for(const row of $('wsPresetList').querySelectorAll('.ws-preset-row')){
  if(row.querySelector('.ws-pro-preset-thumb'))continue;
  const name=row.querySelector('strong')?.textContent||'';
  const p=A.getDb().presets.find(p=>name.startsWith(p.name));
  if(p)row.insertBefore(thumbnail(p.items),row.firstChild);
 }
}
const presObs=new MutationObserver(previewPresets);presObs.observe($('wsPresetList'),{childList:true});$('wsPresets').addEventListener('click',()=>requestAnimationFrame(previewPresets));
window.addEventListener('storage',e=>{if(e.key==='inj_node_workspace_v1'){selected.clear();undoStack.length=0;redoStack.length=0;buttons();}});
window.addEventListener('pagehide',()=>{selected.clear();guides();});
buttons();renderMonitor();updateStatus(true);
})();
