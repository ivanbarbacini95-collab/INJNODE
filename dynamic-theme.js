/* INJ Node · Dynamic Theme v16.01.06
   Stable graphite surfaces; live INJ daily performance shifts discreet accents,
   never major layout backgrounds. Same baseline used by P/L today. */
(() => {
 'use strict';
 const root=document.documentElement, KEY='inj_node_dynamic_signal_v1';
 const props=['--dynamic-rgb','--bg','--canvas','--theme-canvas','--theme-browser',
 '--surface','--surface-strong','--surface-soft','--panel','--panel-strong','--accent','--accent-soft',
 '--line','--line-strong','--header-glow-a','--header-glow-b','--header-edge','--page-gradient'];
 const stops=[
 {p:-8,bg:[7,13,19],surface:[14,23,29],strong:[21,32,39],soft:[30,43,51],accent:[174,67,91]},
 {p:-3,bg:[7,13,19],surface:[14,23,29],strong:[21,32,39],soft:[30,43,51],accent:[150,79,101]},
 {p:-.5,bg:[7,13,19],surface:[14,23,29],strong:[21,32,39],soft:[30,43,51],accent:[113,139,149]},
 {p:0,bg:[7,13,19],surface:[14,23,29],strong:[21,32,39],soft:[30,43,51],accent:[115,151,159]},
 {p:.5,bg:[7,13,19],surface:[14,23,29],strong:[21,32,39],soft:[30,43,51],accent:[107,165,155]},
 {p:3,bg:[7,13,19],surface:[14,23,29],strong:[21,32,39],soft:[30,43,51],accent:[59,178,134]},
 {p:8,bg:[7,13,19],surface:[14,23,29],strong:[21,32,39],soft:[30,43,51],accent:[46,214,145]}
 ];
 const hx=v=>'#'+v.map(n=>Math.min(255,Math.max(0,Math.round(n))).toString(16).padStart(2,'0')).join('');
 const blend=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
 const dateKey=()=>{const n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0')};
 function palette(p){
  const x=Math.max(-8,Math.min(8,p));let j=0;
  while(j<stops.length-2&&x>stops[j+1].p)j++;
  const a=stops[j],b=stops[j+1],t=Math.max(0,Math.min(1,(x-a.p)/(b.p-a.p)));
  return Object.fromEntries(['bg','surface','strong','soft','accent'].map(k=>[k,blend(a[k],b[k],t)]));
 }
 function cache(){
  try{const x=JSON.parse(localStorage.getItem(KEY)||'null');
   if(x&&x.day===dateKey()&&Number.isFinite(x.pct)&&Date.now()-x.updated<4*3600000)return x;
  }catch(_){}
  return null;
 }
 let currentMood='',currentStep=NaN,lastWrite=0,lastSavedPercent=NaN;
 function paint(pct){
  if(root.dataset.theme!=='dynamic')return;
  const good=Number.isFinite(pct), bounded=good?Math.max(-8,Math.min(8,pct)):0;
  const step=Math.round(bounded*4)/4, mood=Math.abs(step)<.5?'neutral':step<0?'bear':'bull';
  if(mood===currentMood&&step===currentStep)return;
  currentMood=mood;currentStep=step;
  const v=palette(step),rgb=v.accent.map(Math.round).join(',');
  const bg=hx(v.bg),sf=hx(v.surface),st=hx(v.strong),soft=hx(v.soft);
  const lv=Math.min(1,Math.max(0,(Math.abs(step)-.5)/7.5));
  const values={
    '--dynamic-rgb':rgb,
    '--bg':bg,'--canvas':bg,'--theme-canvas':bg,'--theme-browser':bg,
    '--surface':sf,'--panel':sf,'--surface-strong':st,'--panel-strong':st,'--surface-soft':soft,
    '--accent':hx(v.accent),'--accent-soft':'rgba('+rgb+',.065)',
    '--line':'rgba('+rgb+',.09)','--line-strong':'rgba('+rgb+',.18)',
    '--header-glow-a':'rgba('+rgb+',.07)','--header-glow-b':'rgba('+rgb+',.025)',
    '--header-edge':'rgba('+rgb+',.12)',
    '--page-gradient':'radial-gradient(ellipse at 70% 0%,rgba('+rgb+','+(.012+.017*lv).toFixed(3)+'),transparent 48%),linear-gradient(155deg,'+sf+','+bg+' 65%,'+bg+')'
  };
  Object.entries(values).forEach(([k,val])=>root.style.setProperty(k,val));
  root.dataset.dynamicMood=mood;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',bg);
 }
 function clear(){
  props.forEach(k=>root.style.removeProperty(k));
  delete root.dataset.dynamicMood;currentMood='';currentStep=NaN;
 }
 function apply(theme){
  if(theme==='dynamic'){
   root.dataset.theme='dynamic';currentMood='';currentStep=NaN;
   paint(cache()?.pct??NaN);
  }else clear();
 }
 function updatePerformance(pct,openPrice){
  if(!Number.isFinite(pct)||!Number.isFinite(openPrice)||openPrice<=0)return;
  const now=Date.now();
  if(lastWrite&&now-lastWrite<12000&&Number.isFinite(lastSavedPercent)&&Math.abs(pct-lastSavedPercent)<.18)return;
  lastWrite=now;lastSavedPercent=pct;
  const x={day:dateKey(),updated:now,pct:Math.max(-25,Math.min(25,pct)),openPrice};
  try{localStorage.setItem(KEY,JSON.stringify(x))}catch(_){}
  if(root.dataset.theme==='dynamic')paint(x.pct);
 }
 window.INJ_DYNAMIC_THEME={apply,updatePerformance,refresh:()=>apply(root.dataset.theme)};
 try{if(localStorage.getItem('inj_monitor_theme')==='dynamic')apply('dynamic')}catch(_){}
 window.addEventListener('pageshow',()=>{if(root.dataset.theme==='dynamic')apply('dynamic')});
 window.addEventListener('storage',e=>{
  if(e.key===KEY&&root.dataset.theme==='dynamic'){currentMood='';paint(cache()?.pct??NaN)}
  if(e.key==='inj_monitor_theme'){
   if(e.newValue==='dynamic')apply('dynamic');
   else{clear();if(e.newValue)root.dataset.theme=e.newValue}
  }
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&root.dataset.theme==='dynamic')apply('dynamic')});
 // Isolated views have their own data feeds. Once per minute, reconcile the
 // palette with a fresh INJ spot price against Home's actual 00:00 reference.
 // Only active for Dynamic, never for ordinary themes or the main Home page.
 const isolated=()=>root.dataset.injPage!=='index';
 let fetching=false;
 async function reconcileIsolated(){
  if(!isolated()||document.hidden||root.dataset.theme!=='dynamic'||fetching)return;
  const reading=cache(),open=Number(reading?.openPrice);
  if(!Number.isFinite(open)||open<=0)return;
  fetching=true;
  try{
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6500);
   let data;
   try{
    const response=await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=INJUSDT',
      {cache:'no-store',signal:ctrl.signal});
    if(!response.ok)throw Error('Price unavailable');
    data=await response.json();
   }finally{clearTimeout(timer)}
   const spot=Number(data?.price);
   if(Number.isFinite(spot)&&spot>0)updatePerformance((spot-open)/open*100,open);
  }catch(_){/* Retain last known colour, never invent a price. */}
  finally{fetching=false}
 }
 if(isolated()){
  window.addEventListener('pageshow',()=>{void reconcileIsolated()},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void reconcileIsolated()});
  setInterval(()=>{void reconcileIsolated()},60000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>void reconcileIsolated(),1800)},{once:true});
  else setTimeout(()=>void reconcileIsolated(),1800);
 }
})();
