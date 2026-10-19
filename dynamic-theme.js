/* INJ Node Dynamic Theme v16.01.05
   Follows the same real INJ daily price return used by P/L today.
   Neutral at zero; burgundy losses; luminous green gains. */
(() => {
 'use strict';
 const root=document.documentElement, KEY='inj_node_dynamic_signal_v1';
 const props=['--dynamic-rgb','--bg','--canvas','--theme-canvas','--theme-browser',
 '--surface','--surface-strong','--surface-soft','--panel','--panel-strong','--accent','--accent-soft',
 '--line','--line-strong','--header-glow-a','--header-glow-b','--header-edge','--page-gradient'];
 const stops=[
 {p:-8,bg:[26,5,10],surface:[42,11,20],strong:[54,16,27],soft:[66,22,34],accent:[255,70,92]},
 {p:-3,bg:[21,8,14],surface:[36,15,23],strong:[46,19,29],soft:[55,27,38],accent:[221,74,96]},
 {p:-.35,bg:[10,13,18],surface:[17,24,29],strong:[24,32,37],soft:[31,43,49],accent:[143,157,161]},
 {p:0,bg:[8,13,18],surface:[15,23,29],strong:[21,31,37],soft:[28,41,48],accent:[143,166,173]},
 {p:.35,bg:[9,16,17],surface:[15,28,25],strong:[22,37,31],soft:[31,50,39],accent:[119,190,166]},
 {p:3,bg:[4,21,16],surface:[10,37,26],strong:[14,49,32],soft:[22,65,40],accent:[47,220,131]},
 {p:8,bg:[3,26,14],surface:[7,46,24],strong:[12,63,32],soft:[18,79,39],accent:[46,255,149]}
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
 let currentMood='',currentStep=NaN,lastWrite=0;
 function paint(pct){
  if(root.dataset.theme!=='dynamic')return;
  const good=Number.isFinite(pct), bounded=good?Math.max(-8,Math.min(8,pct)):0;
  const step=Math.round(bounded*5)/5, mood=Math.abs(step)<.35?'neutral':step<0?'bear':'bull';
  if(mood===currentMood&&step===currentStep)return;
  currentMood=mood;currentStep=step;
  const v=palette(step),rgb=v.accent.map(Math.round).join(',');
  const bg=hx(v.bg),sf=hx(v.surface),st=hx(v.strong),soft=hx(v.soft);
  const lv=Math.min(1,Math.max(0,(Math.abs(step)-.35)/7.65));
  const values={
    '--dynamic-rgb':rgb,
    '--bg':bg,'--canvas':bg,'--theme-canvas':bg,'--theme-browser':bg,
    '--surface':sf,'--panel':sf,'--surface-strong':st,'--panel-strong':st,'--surface-soft':soft,
    '--accent':hx(v.accent),'--accent-soft':'rgba('+rgb+',.13)',
    '--line':'rgba('+rgb+',.14)','--line-strong':'rgba('+rgb+',.29)',
    '--header-glow-a':'rgba('+rgb+',.15)','--header-glow-b':'rgba('+rgb+',.06)',
    '--header-edge':'rgba('+rgb+',.22)',
    '--page-gradient':'radial-gradient(ellipse at 70% 0%,rgba('+rgb+','+(.04+.08*lv).toFixed(3)+'),transparent 48%),linear-gradient(155deg,'+sf+','+bg+' 65%,'+bg+')'
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
  if(now-lastWrite<2500&&Math.abs(pct-currentStep)<.25)return;
  lastWrite=now;
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
})();
