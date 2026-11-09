/* Status Network | persistent independent measurements + QuickNode incident overlays.
 * Historical green means recorded recent blocks, never an inferred green interval.
 * Live current bar updates from actual RPC verification every ~10 seconds.
 */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 if(!$('uptimeBars'))return;
 const en=document.documentElement.lang==='en';
 const tr=(it,english)=>en?english:it;
 const DAY=86400000,MINUTE=60000,intervalMinutes=15;
 const ranges={
  '1D':{duration:DAY,count:48,step:30*MINUTE},
  '1S':{duration:7*DAY,count:56,step:180*MINUTE},
  '1M':{duration:30*DAY,count:60,step:720*MINUTE}
 };
 const states=['online','degraded','halted','unknown'];
 const stateLabel={
  online:tr('Produzione confermata','Production confirmed'),
  degraded:tr('Rallentamento / incidente','Delay / reported incident'),
  halted:tr('Possibile interruzione','Possible halt'),
  unknown:tr('Dati non disponibili','No measurements')
 };
 let range='1D',selected=null,latestLive=null,history={samples:[],incidents:[],generatedAt:null,intervalMinutes:15};
 try{const stored=localStorage.getItem('inj_network_range_v1');if(ranges[stored])range=stored;}catch(_){}
 const fmtTime=ms=>new Intl.DateTimeFormat(en?'en-GB':'it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date(ms));
 const fmtDate=ms=>new Intl.DateTimeFormat(en?'en-GB':'it-IT',{day:'2-digit',month:'short'}).format(new Date(ms));
 const fmtRange=(a,b)=>fmtDate(a)+' '+fmtTime(a)+' – '+fmtDate(b)+' '+fmtTime(b);
 const isFresh=(obj,ms)=>obj&&Number.isFinite(Date.parse(obj.checkedAt))&&Date.now()-Date.parse(obj.checkedAt)<ms;
 function normalizeIncident(incident){
  const start=Date.parse(incident.start||''),end=Date.parse(incident.end||'');
  if(!Number.isFinite(start))return null;
  return {...incident,_start:start,_end:Number.isFinite(end)?end:Date.now()};
 }
 function calculate(timeNow=Date.now()){
  const definition=ranges[range],start=timeNow-definition.duration;
  const samples=Array.isArray(history.samples)?history.samples:[];
  const incidents=(Array.isArray(history.incidents)?history.incidents:[]).map(normalizeIncident).filter(Boolean);
  const last=isFresh(latestLive,35000)?latestLive:null;
  const values=[];
  for(let i=0;i<definition.count;i++){
   const from=start+i*definition.step,to=from+definition.step;
   const bucketSamples=samples.filter(row=>Array.isArray(row)&&Number.isFinite(row[0])&&row[0]*MINUTE>=from&&row[0]*MINUTE<to);
   const observed=bucketSamples.filter(row=>states.includes(row[1])&&row[1]!=='unknown');
   const expected=Math.max(1,Math.round(definition.step/((history.intervalMinutes||intervalMinutes)*MINUTE)));
   const coverage=observed.length/expected;
   const overlapped=incidents.filter(item=>item._start<to&&item._end>from&&item._start<=timeNow);
   const live=Boolean(last && i===definition.count-1 && Date.parse(last.checkedAt)>=from);
   const signals=observed.map(row=>row[1]);
   if(live)signals.push(last.state);
   let level='unknown',source='none';
   if(signals.includes('halted')){level='halted';source='measured';}
   else if(signals.includes('degraded')){level='degraded';source='measured';}
   else if(signals.includes('online')&&(coverage>=0.5||live)){level='online';source='measured';}
   if(overlapped.length&&level!=='halted'){level='degraded';source='provider';}
   values.push({i,from,to,level,source,observed:observed.length,expected,coverage,incident:overlapped[0]||null,incidentCount:overlapped.length,live,latestHeight:bucketSamples.at(-1)?.[2]||null});
  }
  return {start,timeNow,values,range:definition,incidents};
 }
 function summaryFor(bucket){
  if(bucket.live)return tr('In corso · aggiornamento live della rete','In progress · live network verification');
  if(bucket.source==='provider')return tr('Segnalazione QuickNode nell’intervallo. Non equivale a un halt confermato della blockchain.','QuickNode reported an incident in this interval. This does not confirm a blockchain halt.');
  if(bucket.level==='unknown')return tr('Nessuna misurazione RPC sufficiente. Lo stato non può essere ricostruito.','Insufficient RPC measurements. The actual network status cannot be reconstructed.');
  const coverage=Math.min(100,Math.round(bucket.coverage*100));
  return tr('Misurazioni: ','Measured samples: ')+bucket.observed+'/'+bucket.expected+' · '+tr('copertura intervallo','interval coverage')+' '+coverage+'%';
 }
 function render(){
  const {start,timeNow,values,incidents}=calculate();
  const count=values.length;
  if(selected===null||selected>=count||selected<0)selected=count-1;
  const root=$('uptimeBars');root.style.setProperty('--segments',count);
  const fragment=document.createDocumentFragment();
  for(const bar of values){
   const button=document.createElement('button');
   button.type='button';
   button.className='uptime-bar';
   button.dataset.level=bar.level;
   button.dataset.index=String(bar.i);
   button.dataset.current=String(bar.i===count-1);
   button.setAttribute('aria-pressed',String(bar.i===selected));
   const label=fmtRange(bar.from,bar.to)+' · '+stateLabel[bar.level]+
    (bar.incident?' · QuickNode: '+bar.incident.name:'');
   button.setAttribute('aria-label',label);
   button.title=label;
   fragment.appendChild(button);
  }
  root.replaceChildren(fragment);
  for(const button of document.querySelectorAll('[data-network-range]')){
   button.setAttribute('aria-pressed',String(button.dataset.networkRange===range));
  }
  $('uptimeAxisLeft').textContent=fmtDate(start)+' '+fmtTime(start);
  $('uptimeAxisRight').textContent=fmtDate(timeNow)+' '+fmtTime(timeNow);
  const chosen=values[selected];
  $('uptimeDetailTitle').textContent=fmtRange(chosen.from,chosen.to)+' · '+stateLabel[chosen.level];
  $('uptimeDetailBody').textContent=summaryFor(chosen);
  const link=$('uptimeIncidentLink');
  if(chosen.incident){
   const dest=String(chosen.incident.url||'');
   link.href=/^https:\/\/(?:[\w-]+\.)?(?:quicknode\.com|statuspage\.io)(?:\/|$)/i.test(dest)?dest:'https://status.quicknode.com/';
   link.textContent=tr('QuickNode: ','QuickNode: ')+chosen.incident.name+' ↗';
   link.hidden=false;
  }else link.hidden=true;
  const known=values.filter(v=>v.level!=='unknown');
  // Coverage is based on actual saved observations, excluding incident-only bars.
  const observations=(Array.isArray(history.samples)?history.samples:[]).filter(row=>
    Array.isArray(row)&&row[0]*MINUTE>=start&&row[0]*MINUTE<=timeNow&&row[1]!=='unknown').length;
  const expectedTotal=Math.max(1,Math.round((timeNow-start)/((history.intervalMinutes||intervalMinutes)*MINUTE)));
  const coverage=Math.min(100,Math.round(100*observations/expectedTotal));
  $('uptimeCoverage').textContent=tr('Copertura misurazioni: ','Measurement coverage: ')+coverage+'%';
  const incidentsInRange=new Set(incidents.filter(i=>i._start<=timeNow&&i._end>=start).map(i=>i.id)).size;
  $('uptimeCoverageNote').textContent=tr('Campioni RPC salvati: ','Stored RPC samples: ')+observations+
   ' · '+tr('incidenti QuickNode: ','QuickNode incidents: ')+incidentsInRange+
   (history.generatedAt?' · '+tr('Archivio al ','Archive as of ')+fmtDate(Date.parse(history.generatedAt))+' '+fmtTime(Date.parse(history.generatedAt)): ' · '+tr('Archivio non ancora popolato','Archive not yet populated'));
  const verifiedLive=Boolean(isFresh(latestLive,35000)&&latestLive?.state!=='unknown');
  $('uptimeLive').dataset.live=String(verifiedLive);
  $('uptimeLiveText').textContent=verifiedLive?'LIVE · 10s':tr('VERIFICA IN CORSO','CHECKING LIVE');
  $('uptimeSourceNote').textContent=tr(
   'Verde solo con campioni RPC sufficienti. Giallo anche per incidenti segnalati da QuickNode. Grigio = periodo non misurato (non presume rete operativa). Lo storico inizia dal primo controllo archiviato.',
   'Green only with sufficient RPC samples. Yellow can indicate QuickNode reported incidents. Gray = unmeasured (never assumed online). Historical monitoring starts with the first archived check.'
  );
 }
 function labels(){
  $('uptimeTitle').textContent=tr('Storico rete','Network history');
  $('uptimeLegendOnline').textContent=tr('Operativa','Operational');
  $('uptimeLegendDegraded').textContent=tr('Degradata / incidente','Degraded / incident');
  $('uptimeLegendHalted').textContent=tr('Possibile halt','Possible halt');
  $('uptimeLegendUnknown').textContent=tr('Non verificata','Unverified');
 }
 async function loadHistory(){
  try{
   const response=await fetch('./market-data/inj-network-history.json?ts='+Date.now(),{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   if(!Array.isArray(data.samples)||!Array.isArray(data.incidents)||data.chainId!=='injective-1')throw Error('Invalid history');
   history=data;
  }catch(_){/* Keep prior verified records; never turn missing measurements green. */}
  render();
 }
 const rangeControls=document.querySelectorAll('[data-network-range]');
 for(const button of rangeControls){
  button.addEventListener('click',()=>{
   const value=button.dataset.networkRange;if(!ranges[value])return;
   range=value;selected=null;
   try{localStorage.setItem('inj_network_range_v1',range);}catch(_){}
   render();
  });
 }
 $('uptimeBars').addEventListener('click',event=>{
  const bar=event.target.closest('button[data-index]');if(!bar)return;
  selected=Number(bar.dataset.index);render();
 });
 window.addEventListener('injnode:network-status',event=>{
  latestLive=event.detail;
  render();
 });
 labels();
 render();
 loadHistory();
 setInterval(()=>{if(!document.hidden)render();},10000);
 setInterval(()=>{if(!document.hidden)loadHistory();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadHistory();});
})();
