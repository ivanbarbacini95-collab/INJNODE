/* INJ Node · Dynamic Trading Desk v16.01.07
   Real daily INJ return subtly adjusts trim only. Backgrounds remain charcoal.
   No synthetic performance, no full-screen green or red fills. */
(() => {
 'use strict';
 const root=document.documentElement, KEY='inj_node_dynamic_signal_v1';
 const legacySurfaceProps=['--bg','--canvas','--theme-canvas','--theme-browser','--surface','--surface-strong',
 '--surface-soft','--panel','--panel-strong','--page-gradient'];
 const props=['--dynamic-rgb','--dynamic-tint','--dynamic-strength','--accent','--accent-soft',
 '--line','--line-strong','--header-glow-a','--header-glow-b','--header-edge',...legacySurfaceProps];
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
 function syncBadge(pct){
  const badge=document.getElementById('dynamicMarketPulse');
  if(!badge)return;
  const active=root.dataset.theme==='dynamic'&&Number.isFinite(pct);
  badge.hidden=!active;
  if(!active)return;
  const lang=root.lang==='en'?'en-US':'it-IT';
  const percent=badge.querySelector('.dynamic-pulse-percent');
  const caption=badge.querySelector('.dynamic-pulse-caption');
  const name=badge.querySelector('.dynamic-pulse-name');
  const mood=Math.abs(pct)<.5?'neutral':pct<0?'bear':'bull';
  const suffix=pct>0?'+':pct<0?'−':'';
  if(percent)percent.textContent=suffix+Math.abs(pct).toLocaleString(lang,{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
  if(name)name.textContent=root.lang==='en'?'INJ TODAY':'INJ OGGI';
  if(caption)caption.textContent=root.lang==='en'?
    (mood==='bull'?'UP':mood==='bear'?'DOWN':'FLAT'):
    (mood==='bull'?'RIALZO':mood==='bear'?'RIBASSO':'STABILE');
 }
 function paint(pct){
  if(root.dataset.theme!=='dynamic')return;
  const valid=Number.isFinite(pct);
  syncBadge(valid?pct:NaN);
  // Neutral fallback for missing data; do not infer a daily return.
  const limited=valid?Math.max(-8,Math.min(8,pct)):0;
  const step=Math.round(limited*4)/4;
  const mood=Math.abs(step)<.5?'neutral':step<0?'bear':'bull';
  if(mood===currentMood&&step===currentStep)return;
  currentMood=mood;currentStep=step;
  const v=palette(step),rgb=v.accent.map(Math.round).join(',');
  const power=Math.min(1,Math.max(0,(Math.abs(step)-.5)/7.5));
  // Older Dynamic iterations changed global surface backgrounds. Remove those
  // inline overrides. Only fine detailing receives the market signal now.
  legacySurfaceProps.forEach(k=>root.style.removeProperty(k));
  const values={
    '--dynamic-rgb':rgb,
    '--dynamic-strength':power.toFixed(3),
    '--dynamic-tint':'rgba('+rgb+','+(.04+.06*power).toFixed(3)+')',
    '--accent':hx(v.accent),
    '--accent-soft':'rgba('+rgb+','+(.045+.015*power).toFixed(3)+')',
    '--line':'rgba('+rgb+',.12)',
    '--line-strong':'rgba('+rgb+',.23)',
    '--header-glow-a':'rgba('+rgb+',.05)',
    '--header-glow-b':'rgba('+rgb+',.025)',
    '--header-edge':'rgba('+rgb+',.12)'
  };
  Object.entries(values).forEach(([key,value])=>root.style.setProperty(key,value));
  root.dataset.dynamicMood=mood;
  root.dataset.dynamicIntensity=power>.66?'high':power>.25?'medium':'low';
  // Safari's top safe area remains dark rather than turning into green/red.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#070b10');
 }
 function clear(){
  props.forEach(k=>root.style.removeProperty(k));
  delete root.dataset.dynamicMood;delete root.dataset.dynamicIntensity;
  syncBadge(NaN);currentMood='';currentStep=NaN;
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
  if(root.dataset.theme==='dynamic')syncBadge(pct);
  if(lastWrite&&now-lastWrite<12000&&Number.isFinite(lastSavedPercent)&&Math.abs(pct-lastSavedPercent)<.18)return;
  lastWrite=now;lastSavedPercent=pct;
  const x={day:dateKey(),updated:now,pct:Math.max(-25,Math.min(25,pct)),openPrice};
  try{localStorage.setItem(KEY,JSON.stringify(x))}catch(_){}
  if(root.dataset.theme==='dynamic')paint(x.pct);
 }
 window.INJ_DYNAMIC_THEME={apply,updatePerformance,refresh:()=>apply(root.dataset.theme)};
 window.addEventListener('injnode:languagechange',()=>{
   if(root.dataset.theme==='dynamic')syncBadge(cache()?.pct??NaN);
 });
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
