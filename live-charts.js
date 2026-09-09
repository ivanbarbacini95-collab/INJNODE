'use strict';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'inj_node_live_charts_isolated_v1';
const HOUR = 60 * 60_000;
const MAX_SAMPLES = 3900;
const mobile = matchMedia('(hover:none) and (pointer:coarse)').matches || innerWidth <= 820;
const maxFps = mobile ? 24 : 30;
const minFrameMs = 1000 / maxFps;

const ranges = {
  m5:  { ms: 5*60_000,  canvas:'canvas5m',  card:'card5m',  ids:['top5m','q35m','mid5m','q15m','bottom5m','marker5m','live5m'], momentum:30_000, minSpan:.00007 },
  m10: { ms:10*60_000,  canvas:'canvas10m', card:'card10m', ids:['top10m','q310m','mid10m','q110m','bottom10m','marker10m','live10m'], momentum:60_000, minSpan:.00010 },
  h1:  { ms:60*60_000,  canvas:'canvas1h',  card:'card1h',  ids:['top1h','q31h','mid1h','q11h','bottom1h','marker1h','live1h'], momentum:5*60_000, minSpan:.00022 }
};

const state = {
  samples: [], target: 0, visual: 0, lastTick: 0, lastSample: 0,
  raf: 0, lastFrame: 0, ws: null, reconnect: 0, stopped:false,
  scales: {m5:null,m10:null,h1:null}, colors:null, lastPersist:0
};

function priceText(v){
  if (!(v>0)) return '—';
  const d=v<10?4:v<100?3:2;
  return '$'+v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
}
function setText(id,text){const n=$(id); if(n&&n.textContent!==text)n.textContent=text}
function lowerBound(t){let l=0,h=state.samples.length;while(l<h){const m=(l+h)>>1;if(state.samples[m].t<t)l=m+1;else h=m}return l}
function merge(rows){
  const cutoff=Date.now()-HOUR-120000;
  const all=[...state.samples,...rows].filter(r=>r&&r.t>=cutoff&&r.price>0).sort((a,b)=>a.t-b.t);
  const out=[];
  for(const r of all){const last=out[out.length-1]; if(last&&Math.abs(last.t-r.t)<500){if(r.t>=last.t){last.t=r.t;last.price=r.price}}else out.push({t:r.t,price:r.price})}
  if(out.length>MAX_SAMPLES)out.splice(0,out.length-MAX_SAMPLES);
  state.samples=out;
}
function addTick(price,t=Date.now()){
  if(!(price>0))return;
  state.target=price; state.lastTick=t;
  if(!(state.visual>0))state.visual=price;
  const last=state.samples[state.samples.length-1];
  if(last&&t-state.lastSample<850){last.t=t;last.price=price}else{state.samples.push({t,price});state.lastSample=t}
  const cutoff=t-HOUR-120000; while(state.samples.length>2&&state.samples[0].t<cutoff)state.samples.shift();
  if(state.samples.length>MAX_SAMPLES)state.samples.splice(0,state.samples.length-MAX_SAMPLES);
  if(t-state.lastPersist>15000){persist();state.lastPersist=t}
}
function restore(){
  try{const raw=JSON.parse(sessionStorage.getItem(STORE_KEY)||'[]');if(Array.isArray(raw))merge(raw.map(r=>({t:+r[0],price:+r[1]})))}catch(_){ }
}
function persist(){try{sessionStorage.setItem(STORE_KEY,JSON.stringify(state.samples.slice(-MAX_SAMPLES).map(r=>[Math.round(r.t),+r.price])))}catch(_){}}

async function loadHistory(){
  try{
    const r=await fetch('https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=1m&limit=61',{cache:'no-store'});
    if(!r.ok)throw new Error('history');
    const data=await r.json(); const now=Date.now();
    merge(data.map(row=>({t:Math.min(+row[6]||+row[0],now),price:+row[4]})).filter(r=>r.price>0));
    if(state.samples.length){const p=state.samples[state.samples.length-1].price;if(!(state.target>0))state.target=p;if(!(state.visual>0))state.visual=p}
    document.querySelectorAll('.loading').forEach(n=>n.classList.add('done')); persist();
  }catch(_){document.querySelectorAll('.loading span').forEach(n=>n.textContent='LIVE')}
}

function connection(mode){const n=$('connectionState');if(!n)return;n.className=mode; n.lastChild.textContent=mode==='online'?'LIVE':mode==='offline'?'RECONNECT':'CONNECTING'}
function connect(){
  if(state.stopped||document.hidden)return;
  clearTimeout(state.reconnect); connection('connecting');
  try{
    const ws=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@miniTicker'); state.ws=ws;
    ws.onopen=()=>connection('online');
    ws.onmessage=(e)=>{try{const d=JSON.parse(e.data);const p=+d.c;if(p>0)addTick(p,Date.now())}catch(_){}};
    ws.onerror=()=>{};
    ws.onclose=()=>{if(state.ws===ws)state.ws=null;connection('offline');if(!state.stopped&&!document.hidden)state.reconnect=setTimeout(connect,1800)};
  }catch(_){connection('offline');state.reconnect=setTimeout(connect,2200)}
}

function setupCanvases(){
  for(const cfg of Object.values(ranges)){
    const canvas=$(cfg.canvas); if(!canvas)continue;
    const resize=()=>{const r=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,mobile?1.35:1.6);const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas._dpr=dpr;canvas._cssW=r.width;canvas._cssH=r.height}};
    canvas._resize=resize; resize();
  }
  const ro=new ResizeObserver(()=>{for(const cfg of Object.values(ranges))$(cfg.canvas)?._resize?.()});
  document.querySelectorAll('.plot').forEach(n=>ro.observe(n));
}
function colors(){
  const cs=getComputedStyle(document.documentElement);
  state.colors={up:cs.getPropertyValue('--up').trim(),down:cs.getPropertyValue('--down').trim(),accent:cs.getPropertyValue('--accent').trim(),canvas:cs.getPropertyValue('--canvas').trim()};
}
function momentum(now,cfg,latest){
  if(!state.samples.length)return 0; const target=now-cfg.momentum; let i=lowerBound(target); if(i>=state.samples.length)i=state.samples.length-1;if(i>0&&Math.abs(state.samples[i-1].t-target)<Math.abs(state.samples[i].t-target))i--;
  const a=state.samples[Math.max(0,i)]?.price||latest; const delta=latest-a; const dead=Math.max(latest*.000012, .000002); return Math.abs(delta)>=dead?Math.sign(delta):0;
}
function buildPoints(now,cfg,visual,dt,key){
  const start=now-cfg.ms; let first=lowerBound(start); const seed=Math.max(0,first-1); const seedPrice=state.samples[seed]?.price||visual;
  let min=Math.min(seedPrice,visual),max=Math.max(seedPrice,visual);let last=state.samples.length-1;while(last>=0&&state.samples[last].t>now)last--;
  for(let i=first;i<=last;i++){const p=state.samples[i]?.price;if(p>0){if(p<min)min=p;if(p>max)max=p}}
  const minSpan=Math.max(visual*cfg.minSpan,visual<10?.00005:.0005);let span=max-min;if(span<minSpan){const c=(max+min)/2;min=c-minSpan/2;max=c+minSpan/2;span=minSpan}
  const tMin=min-span*.15,tMax=max+span*.15;let sc=state.scales[key];if(!sc){sc=state.scales[key]={min:tMin,max:tMax}}else{
    const aMin=1-Math.exp(-dt/(tMin<sc.min?120:1600)); const aMax=1-Math.exp(-dt/(tMax>sc.max?120:1600));sc.min+=(tMin-sc.min)*aMin;sc.max+=(tMax-sc.max)*aMax;
  }
  min=sc.min;max=sc.max;span=Math.max(max-min,minSpan);const pad=Math.max(span*.08,minSpan*.1);if(visual<min+pad){min=visual-pad;sc.min=min}if(visual>max-pad){max=visual+pad;sc.max=max}span=Math.max(max-min,minSpan);
  const visibleCount=Math.max(0,last-first+1);const maxPts=mobile?150:210;const step=visibleCount>maxPts?visibleCount/maxPts:1;const pts=[{t:start,p:seedPrice}];
  if(step<=1){for(let i=first;i<=last;i++){const r=state.samples[i];if(r?.price>0)pts.push({t:r.t,p:r.price})}}else{for(let c=0;c<visibleCount;c+=step){const i=Math.min(last,first+Math.floor(c));const r=state.samples[i];if(r?.price>0)pts.push({t:r.t,p:r.price})}}
  pts.push({t:now,p:visual});return{pts,min,max,mid:(min+max)/2,span};
}
function drawOne(now,dt,key,cfg){
  const canvas=$(cfg.canvas),ctx=canvas?.getContext('2d');if(!ctx||!(state.visual>0))return;
  canvas._resize?.();const dpr=canvas._dpr||1,w=canvas._cssW||canvas.clientWidth,h=canvas._cssH||canvas.clientHeight;if(w<2||h<2)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const data=buildPoints(now,cfg,state.visual,dt,key);const {pts,min,max,span}=data;const padX=8,endX=w-14,top=9,bottom=h-9,plotH=Math.max(1,bottom-top);const xy=[];
  for(const r of pts){const x=padX+Math.max(0,Math.min(1,(r.t-(now-cfg.ms))/cfg.ms))*(endX-padX);const y=bottom-Math.max(0,Math.min(1,(r.p-min)/span))*plotH;xy.push({x,y})}
  const dir=momentum(now,cfg,state.visual);const card=$(cfg.card);card.classList.remove('up','down','neutral');card.classList.add(dir>0?'up':dir<0?'down':'neutral');const color=dir>0?state.colors.up:dir<0?state.colors.down:state.colors.accent;
  // Very faint horizontal guides.
  ctx.lineWidth=1;ctx.strokeStyle='rgba(130,160,200,.07)';for(const f of [.25,.5,.75]){const y=top+plotH*f;ctx.beginPath();ctx.moveTo(padX,y);ctx.lineTo(endX,y);ctx.stroke()}
  if(xy.length>1){ctx.beginPath();ctx.moveTo(xy[0].x,xy[0].y);for(let i=1;i<xy.length-1;i++){const a=xy[i],b=xy[i+1];ctx.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2)}const pen=xy[Math.max(0,xy.length-2)],last=xy[xy.length-1];ctx.quadraticCurveTo(pen.x,pen.y,last.x,last.y);ctx.lineWidth=1.35;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.stroke();
    const grad=ctx.createLinearGradient(0,top,0,bottom);grad.addColorStop(0,color+'18');grad.addColorStop(1,color+'00');ctx.lineTo(last.x,bottom);ctx.lineTo(xy[0].x,bottom);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
    ctx.beginPath();ctx.arc(last.x,last.y,mobile?3.9:4.4,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=state.colors.canvas;ctx.stroke();
  }
  const topV=max,q3=min+span*.75,mid=min+span*.5,q1=min+span*.25,bottomV=min;const ids=cfg.ids;setText(ids[0],priceText(topV));setText(ids[1],priceText(q3));setText(ids[2],priceText(mid));setText(ids[3],priceText(q1));setText(ids[4],priceText(bottomV));setText(ids[6],priceText(state.visual));const marker=$(ids[5]);if(marker){const pct=100-Math.max(0,Math.min(1,(state.visual-min)/span))*100;marker.style.top=Math.max(5,Math.min(95,pct))+'%'}
}
function frame(ts){
  state.raf=0;if(document.hidden||state.stopped)return;if(ts-state.lastFrame<minFrameMs){state.raf=requestAnimationFrame(frame);return}const dt=Math.max(8,Math.min(80,ts-(state.lastFrame||ts-minFrameMs)));state.lastFrame=ts;
  if(state.target>0){if(!(state.visual>0))state.visual=state.target;const delta=state.target-state.visual;const eps=Math.max(state.target*.0000003,.0000005);if(Math.abs(delta)<=eps)state.visual=state.target;else state.visual+=delta*(1-Math.exp(-dt/110))}
  if(state.visual>0){setText('headerLivePrice',priceText(state.visual));const now=Date.now();for(const [k,cfg] of Object.entries(ranges))drawOne(now,dt,k,cfg)}
  state.raf=requestAnimationFrame(frame);
}
function start(){if(!state.raf&&!document.hidden&&!state.stopped)state.raf=requestAnimationFrame(frame)}
function stop(){state.stopped=true;if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;clearTimeout(state.reconnect);try{state.ws?.close()}catch(_){}state.ws=null;persist()}

$('liveChartsBack')?.addEventListener('click',()=>{stop();if(history.length>1)history.back();else location.href='./index.html'});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;try{state.ws?.close()}catch(_){}}else if(!state.stopped){start();connect()}});
window.addEventListener('pagehide',persist,{passive:true});

restore();colors();setupCanvases();
if(state.samples.length){const p=state.samples[state.samples.length-1].price;state.target=p;state.visual=p}
start();void loadHistory();connect();
