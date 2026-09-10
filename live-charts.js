'use strict';

// v15.98.62 — Live Charts 2.0: single immersive terminal, timeframe switcher, OHLC strip,
// smooth autoscale, yellow candle-width live Price Tick, candle-synchronised time axis,
// pointer/touch crosshair and Focus mode. Other INJ Node surfaces are intentionally untouched.

const $ = (id) => document.getElementById(id);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const mobile = matchMedia('(hover:none) and (pointer:coarse)').matches || innerWidth <= 820;
const maxFps = mobile ? 28 : 36;
const minFrameMs = 1000 / maxFps;

const ranges = {
  m1: { label:'1 MIN', windowMs:MINUTE, bucketMs:SECOND, source:'short1', minSpan:.000055, expand:110, relax:1800, expected:60 },
  m5: { label:'5 MIN', windowMs:5*MINUTE, bucketMs:5*SECOND, source:'short5', minSpan:.000075, expand:125, relax:2200, expected:60 },
  m10:{ label:'10 MIN',windowMs:10*MINUTE,bucketMs:10*SECOND,source:'short10',minSpan:.00010,expand:145,relax:3100,expected:60 },
  h1: { label:'1 ORA', windowMs:HOUR, bucketMs:MINUTE, source:'h1', minSpan:.00022, expand:180, relax:5400, expected:60 },
  d1: { label:'1 GIORNO',windowMs:DAY,bucketMs:30*MINUTE,source:'d1',interval:'30m',limit:50,minSpan:.0013,expand:240,relax:8200,expected:48 },
  w1: { label:'1 SETTIMANA',windowMs:7*DAY,bucketMs:4*HOUR,source:'w1',interval:'4h',limit:44,minSpan:.0030,expand:300,relax:12000,expected:42 }
};

const savedRange = (()=>{ try { const v=localStorage.getItem('inj_node_live_chart_range'); return ranges[v]?v:'m1'; } catch(_){ return 'm1'; } })();
const state = {
  active:savedRange,
  series:{short1:[],short5:[],short10:[],h1:[],d1:[],w1:[]},
  loaded:{short1:false,short5:false,short10:false,h1:false,d1:false,w1:false},
  loading:{}, scales:{}, scaleTextAt:0,
  lastPrice:0,targetPrice:0,visualPrice:0,lastTickAt:0,flashUntil:0,
  colors:null,ws:null,reconnect:0,stopped:false,raf:0,lastFrame:0,
  geometry:null,crosshair:{active:false,x:0,y:0}
};
for(const key of Object.keys(ranges)) state.scales[key]=null;

function priceText(v){
  if(!(v>0))return '—';
  const d=v<10?4:v<100?3:2;
  return '$'+v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
}
function pctText(v){ if(!Number.isFinite(v))return '—'; return `${v>=0?'+':''}${v.toFixed(2)}%`; }
function setText(id,text){const n=$(id);if(n&&n.textContent!==text)n.textContent=text;}
function setTrendClass(node,value){if(!node)return;node.classList.remove('up','down','neutral');node.classList.add(value>0?'up':value<0?'down':'neutral');}
function hexAlpha(color,alpha){
  if(!color)return `rgba(85,168,255,${alpha})`;
  if(color.startsWith('#')){let h=color.slice(1);if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;}
  const m=color.match(/[\d.]+/g);if(m&&m.length>=3)return `rgba(${m[0]},${m[1]},${m[2]},${alpha})`;
  return color;
}
function colors(){const cs=getComputedStyle(document.documentElement);state.colors={up:cs.getPropertyValue('--up').trim(),down:cs.getPropertyValue('--down').trim(),accent:cs.getPropertyValue('--accent').trim(),canvas:cs.getPropertyValue('--canvas').trim(),muted:cs.getPropertyValue('--muted').trim(),muted2:cs.getPropertyValue('--muted2').trim(),yellow:cs.getPropertyValue('--yellow').trim()||'#ffd84d'};}
function connection(mode){const n=$('connectionState');if(!n)return;n.className=`connection-pill ${mode}`;const b=n.querySelector('b');if(b)b.textContent=mode==='online'?'LIVE':mode==='offline'?'RECONNECT':'CONNECTING';}
function setLoading(mode){const n=$('chartLoading');if(!n)return;if(mode==='done')n.classList.add('done');else{n.classList.remove('done');const s=n.querySelector('span');if(s)s.textContent=mode==='live'?'LIVE':'SYNC';}}

function normalizeCandles(rows,bucketMs){
  const map=new Map();
  for(const raw of rows||[]){if(!raw)continue;const t=Math.floor(Number(raw.t)/bucketMs)*bucketMs;const o=+raw.o,h=+raw.h,l=+raw.l,c=+raw.c;if(!(t>=0&&o>0&&h>0&&l>0&&c>0))continue;const prev=map.get(t);if(!prev)map.set(t,{t,o,h,l,c});else{prev.h=Math.max(prev.h,h);prev.l=Math.min(prev.l,l);prev.c=c;}}
  return [...map.values()].sort((a,b)=>a.t-b.t);
}
function aggregateCandles(rows,bucketMs){return normalizeCandles(rows,bucketMs);}
function trimSeries(key,now=Date.now()){const cfg=ranges[key];if(!cfg)return;const arr=state.series[cfg.source]||[];const cutoff=now-cfg.windowMs-cfg.bucketMs*2;while(arr.length>2&&arr[0].t<cutoff)arr.shift();const cap=Math.max(cfg.expected+6,72);if(arr.length>cap)arr.splice(0,arr.length-cap);}
function mergeLiveInto(key,raw){const cfg=ranges[key],arr=state.series[cfg.source];if(!cfg||!arr)return;const t=Math.floor(raw.t/cfg.bucketMs)*cfg.bucketMs;let last=arr[arr.length-1];if(!last||last.t<t){last={t,o:raw.o,h:raw.h,l:raw.l,c:raw.c};arr.push(last);}else if(last.t===t){last.h=Math.max(last.h,raw.h);last.l=Math.min(last.l,raw.l);last.c=raw.c;}else{const found=arr.find(c=>c.t===t);if(found){found.h=Math.max(found.h,raw.h);found.l=Math.min(found.l,raw.l);found.c=raw.c;}}trimSeries(key,raw.t);}

async function fetchKlines(interval,limit){const url=`https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=${encodeURIComponent(interval)}&limit=${limit}`;const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('history');const data=await r.json();return data.map(row=>({t:+row[0],o:+row[1],h:+row[2],l:+row[3],c:+row[4]})).filter(c=>c.o>0&&c.h>0&&c.l>0&&c.c>0);}
async function loadShortHistory(){
  if(['m1','m5','m10','h1'].includes(state.active))setLoading('sync');
  try{
    let seconds=[];try{seconds=await fetchKlines('1s',610);}catch(_){}
    const minutes=await fetchKlines('1m',65);
    if(seconds.length){state.series.short1=normalizeCandles(seconds,ranges.m1.bucketMs);state.series.short5=aggregateCandles(seconds,ranges.m5.bucketMs);state.series.short10=aggregateCandles(seconds,ranges.m10.bucketMs);}else{state.series.short1=normalizeCandles(minutes,ranges.m1.bucketMs);state.series.short5=aggregateCandles(minutes,ranges.m5.bucketMs);state.series.short10=aggregateCandles(minutes,ranges.m10.bucketMs);}
    state.series.h1=normalizeCandles(minutes,ranges.h1.bucketMs);
    state.loaded.short1=state.loaded.short5=state.loaded.short10=state.loaded.h1=true;
    for(const k of ['m1','m5','m10','h1'])trimSeries(k);
    const latest=seconds.at(-1)?.c||minutes.at(-1)?.c;if(latest>0){state.lastPrice=latest;state.targetPrice=latest;if(!(state.visualPrice>0))state.visualPrice=latest;}
    if(['m1','m5','m10','h1'].includes(state.active))setLoading('done');
  }catch(_){if(['m1','m5','m10','h1'].includes(state.active))setLoading('live');}
}
async function ensureHistory(key){const cfg=ranges[key];if(!cfg)return;if(state.loaded[cfg.source]){if(key===state.active)setLoading('done');return;}if(!cfg.interval||state.loading[key])return;state.loading[key]=true;if(key===state.active)setLoading('sync');try{const rows=await fetchKlines(cfg.interval,cfg.limit);state.series[cfg.source]=normalizeCandles(rows,cfg.bucketMs);state.loaded[cfg.source]=true;state.scales[key]=null;trimSeries(key);if(key===state.active)setLoading('done');const latest=rows.at(-1)?.c;if(latest>0){if(!(state.lastPrice>0))state.lastPrice=latest;if(!(state.targetPrice>0))state.targetPrice=latest;if(!(state.visualPrice>0))state.visualPrice=latest;}}catch(_){if(key===state.active)setLoading('live');}finally{state.loading[key]=false;}}

function connect(){
  if(state.stopped||document.hidden)return;clearTimeout(state.reconnect);connection('connecting');
  try{const ws=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@kline_1s');state.ws=ws;ws.onopen=()=>connection('online');ws.onmessage=(e)=>{try{const d=JSON.parse(e.data),k=d.k;if(!k)return;const raw={t:+k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c};if(!(raw.c>0))return;state.lastPrice=raw.c;state.targetPrice=raw.c;if(!(state.visualPrice>0))state.visualPrice=raw.c;state.lastTickAt=Date.now();state.flashUntil=performance.now()+560;for(const key of Object.keys(ranges)){const cfg=ranges[key];if(state.loaded[cfg.source])mergeLiveInto(key,raw);}}catch(_){}};ws.onerror=()=>{};ws.onclose=()=>{if(state.ws===ws)state.ws=null;connection('offline');if(!state.stopped&&!document.hidden)state.reconnect=setTimeout(connect,1800);};}catch(_){connection('offline');state.reconnect=setTimeout(connect,2200);}
}

const canvas=$('mainCanvas');
function resizeCanvas(){if(!canvas)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,mobile?1.7:2);const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas._dpr=dpr;canvas._cssW=r.width;canvas._cssH=r.height;}}
new ResizeObserver(resizeCanvas).observe($('plot'));
resizeCanvas();

function visibleCandles(now,key,cfg){const arr=state.series[cfg.source]||[];if(!arr.length)return[];const cutoff=now-cfg.windowMs-cfg.bucketMs;return arr.filter(c=>c.t+cfg.bucketMs>=cutoff&&c.t<=now);}
function timeframeStats(candles){if(!candles.length)return null;let hi=-Infinity,lo=Infinity;for(const c of candles){hi=Math.max(hi,c.h);lo=Math.min(lo,c.l);}const open=candles[0].o,close=candles.at(-1).c,change=open>0?(close/open-1)*100:0;return{open,high:hi,low:lo,close,change};}
function computeScale(dt,key,cfg,candles){let lo=Infinity,hi=-Infinity;for(const c of candles){if(c.l<lo)lo=c.l;if(c.h>hi)hi=c.h;}const latest=candles.at(-1)?.c||state.lastPrice;if(!(lo<Infinity&&hi>0&&latest>0))return null;const floor=latest<10?.00005:.0005;const minSpan=Math.max(latest*cfg.minSpan,floor);let span=hi-lo;if(span<minSpan){const mid=(hi+lo)/2;lo=mid-minSpan/2;hi=mid+minSpan/2;span=minSpan;}const targetMin=lo-span*.12,targetMax=hi+span*.12;let sc=state.scales[key];if(!sc)sc=state.scales[key]={min:targetMin,max:targetMax};else{const aMin=1-Math.exp(-dt/(targetMin<sc.min?cfg.expand:cfg.relax));const aMax=1-Math.exp(-dt/(targetMax>sc.max?cfg.expand:cfg.relax));sc.min+=(targetMin-sc.min)*aMin;sc.max+=(targetMax-sc.max)*aMax;}lo=sc.min;hi=sc.max;span=Math.max(hi-lo,minSpan);const breath=Math.max(span*.075,minSpan*.10);if(latest<lo+breath){lo=latest-breath;sc.min=lo;}if(latest>hi-breath){hi=latest+breath;sc.max=hi;}return{min:lo,max:hi,span:Math.max(hi-lo,minSpan),latest};}
function drawGuides(ctx,left,right,top,bottom){const pw=right-left,ph=bottom-top;ctx.save();ctx.lineWidth=1;ctx.strokeStyle='rgba(135,165,205,.055)';for(const f of [.25,.5,.75]){const y=top+ph*f;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}ctx.strokeStyle='rgba(135,165,205,.030)';for(const f of [.2,.4,.6,.8]){const x=left+pw*f;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}ctx.restore();}
function drawRangeTags(ctx,candles,xs,toY,right,bottom){if(candles.length<4)return;let hiI=0,loI=0;for(let i=1;i<candles.length;i++){if(candles[i].h>candles[hiI].h)hiI=i;if(candles[i].l<candles[loI].l)loI=i;}ctx.save();ctx.font=`800 ${mobile?7:8}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;ctx.fillStyle=hexAlpha(state.colors.muted2,.58);ctx.textBaseline='middle';const hx=Math.min(right-12,xs[hiI]+5),hy=Math.max(9,toY(candles[hiI].h)-8);ctx.fillText('H',hx,hy);const lx=Math.min(right-12,xs[loI]+5),ly=Math.min(bottom-5,toY(candles[loI].l)+9);ctx.fillText('L',lx,ly);ctx.restore();}
function pad2(v){return String(v).padStart(2,'0');}
function timeAxisText(ts,key){const d=new Date(ts),hh=pad2(d.getHours()),mm=pad2(d.getMinutes()),ss=pad2(d.getSeconds());if(key==='m1')return `${hh}:${mm}:${ss}`;if(key==='w1'){const day=['DOM','LUN','MAR','MER','GIO','VEN','SAB'][d.getDay()];return `${day} ${pad2(d.getDate())} · ${hh}`;}return `${hh}:${mm}`;}
function crosshairTimeText(ts,key){const d=new Date(ts);if(key==='w1'||key==='d1')return d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});if(key==='m1')return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;}
function drawTimeAxis(ctx,key,candles,xs,left,right,bottom,h){if(candles.length<2||xs.length!==candles.length)return;const axisTop=bottom+7,axisTextY=h-(mobile?5:6);const minGap=key==='m1'?(mobile?52:68):(key==='w1'?(mobile?62:76):(mobile?48:62));const usable=Math.max(1,right-left);const wanted=Math.max(2,Math.min(mobile?5:7,Math.floor(usable/minGap)+1));const chosen=[];for(let n=0;n<wanted;n++){const i=Math.round((candles.length-1)*(n/(wanted-1)));if(!chosen.includes(i))chosen.push(i);}ctx.save();ctx.strokeStyle=hexAlpha(state.colors.muted2,.13);ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(left,axisTop);ctx.lineTo(right,axisTop);ctx.stroke();ctx.font=`650 ${mobile?6.3:7.4}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;ctx.fillStyle=hexAlpha(state.colors.muted2,.54);ctx.textBaseline='alphabetic';for(const i of chosen){const x=xs[i],label=timeAxisText(candles[i].t,key);ctx.strokeStyle=hexAlpha(state.colors.muted2,.18);ctx.beginPath();ctx.moveTo(x,axisTop);ctx.lineTo(x,axisTop+3);ctx.stroke();const tw=ctx.measureText(label).width,tx=Math.max(left+tw/2,Math.min(right-tw/2,x));ctx.textAlign='center';ctx.fillText(label,tx,axisTextY);}ctx.restore();}
function drawCrosshair(ctx,key,candles,xs,left,right,top,bottom,min,span){if(!state.crosshair.active||!state.geometry||!candles.length)return;const x=Math.max(left,Math.min(right,state.crosshair.x)),y=Math.max(top,Math.min(bottom,state.crosshair.y));let idx=0,best=Infinity;for(let i=0;i<xs.length;i++){const d=Math.abs(xs[i]-x);if(d<best){best=d;idx=i;}}const candle=candles[idx],cx=xs[idx],price=min+(bottom-y)/(bottom-top)*span;ctx.save();ctx.setLineDash([3,4]);ctx.lineWidth=.75;ctx.strokeStyle=hexAlpha(state.colors.muted2,.32);ctx.beginPath();ctx.moveTo(cx,top);ctx.lineTo(cx,bottom);ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);ctx.font=`800 ${mobile?7.2:8.2}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;const tLabel=crosshairTimeText(candle.t,key),pLabel=priceText(price);ctx.textBaseline='middle';const tW=ctx.measureText(tLabel).width+12,pW=ctx.measureText(pLabel).width+12;const boxH=18;let tx=Math.max(left,Math.min(right-tW,cx-tW/2));ctx.fillStyle=hexAlpha(state.colors.canvas,.90);ctx.strokeStyle=hexAlpha(state.colors.muted2,.22);ctx.fillRect(tx,bottom-boxH,tW,boxH);ctx.strokeRect(tx,bottom-boxH,tW,boxH);ctx.fillStyle=hexAlpha(state.colors.muted2,.92);ctx.textAlign='center';ctx.fillText(tLabel,tx+tW/2,bottom-boxH/2);let py=Math.max(top,Math.min(bottom-boxH,y-boxH/2));ctx.fillStyle=hexAlpha(state.colors.canvas,.92);ctx.fillRect(right-pW,py,pW,boxH);ctx.strokeRect(right-pW,py,pW,boxH);ctx.fillStyle=hexAlpha(state.colors.muted2,.95);ctx.fillText(pLabel,right-pW/2,py+boxH/2);ctx.restore();}
function updateScaleText(now,min,max,span,latest){if(now-state.scaleTextAt<100)return;state.scaleTextAt=now;setText('scaleTop',priceText(max));setText('scaleQ3',priceText(min+span*.75));setText('scaleMid',priceText(min+span*.5));setText('scaleQ1',priceText(min+span*.25));setText('scaleBottom',priceText(min));setText('scaleLive',priceText(latest));}
function updateStats(candles){const stats=timeframeStats(candles);if(!stats)return;setText('statOpen',priceText(stats.open));setText('statHigh',priceText(stats.high));setText('statLow',priceText(stats.low));setText('statChange',pctText(stats.change));setText('headerRangeChange',pctText(stats.change));setTrendClass($('statChange'),stats.change);setTrendClass($('headerRangeChange'),stats.change);const shell=$('terminalShell');shell?.classList.remove('up','down','neutral');shell?.classList.add(stats.change>0?'up':stats.change<0?'down':'neutral');}

function drawActive(now,dt,ts){
  const key=state.active,cfg=ranges[key];if(!cfg||!state.loaded[cfg.source])return;
  const rawCandles=visibleCandles(now,key,cfg);if(!rawCandles.length)return;
  const visual=state.visualPrice>0?state.visualPrice:(state.lastPrice>0?state.lastPrice:rawCandles.at(-1).c);const candles=rawCandles.slice(),rawLast=candles.at(-1);if(rawLast&&visual>0)candles[candles.length-1]={...rawLast,c:visual,h:Math.max(rawLast.h,visual),l:Math.min(rawLast.l,visual)};
  const ctx=canvas?.getContext('2d');if(!ctx)return;resizeCanvas();const dpr=canvas._dpr||1,w=canvas._cssW||canvas.clientWidth,h=canvas._cssH||canvas.clientHeight;if(w<2||h<2)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const scale=computeScale(dt,key,cfg,candles);if(!scale)return;const{min,max,span,latest}=scale;const axisH=mobile?19:22,left=mobile?9:13,right=w-(mobile?8:12),top=mobile?9:12,bottom=h-axisH-8,plotH=Math.max(1,bottom-top),plotW=Math.max(1,right-left),toY=(p)=>bottom-Math.max(0,Math.min(1,(p-min)/span))*plotH;
  state.geometry={left,right,top,bottom,min,max,span};drawGuides(ctx,left,right,top,bottom);
  const count=candles.length,step=plotW/Math.max(count,1),bodyW=Math.max(1.7,Math.min(mobile?7.0:9.0,step*.60)),xs=[];
  for(let i=0;i<count;i++){const c=candles[i],x=left+step*(i+.5);xs.push(x);const up=c.c>=c.o,color=up?state.colors.up:state.colors.down,yH=toY(c.h),yL=toY(c.l),yO=toY(c.o),yC=toY(c.c),isLast=i===count-1;ctx.save();ctx.strokeStyle=hexAlpha(color,isLast?.96:.76);ctx.lineWidth=isLast?1.2:.92;ctx.beginPath();ctx.moveTo(x,yH);ctx.lineTo(x,yL);ctx.stroke();let by=Math.min(yO,yC),bh=Math.abs(yC-yO);if(bh<1.45){by=(yO+yC)/2-.725;bh=1.45;}ctx.fillStyle=hexAlpha(color,isLast?.95:.78);ctx.fillRect(x-bodyW/2,by,bodyW,bh);if(isLast){ctx.strokeStyle=hexAlpha(color,.96);ctx.lineWidth=.75;ctx.strokeRect(x-bodyW/2-.35,by-.35,bodyW+.7,bh+.7);}ctx.restore();}
  drawRangeTags(ctx,candles,xs,toY,right,bottom);drawTimeAxis(ctx,key,candles,xs,left,right,bottom,h);
  const last=candles.at(-1),lastX=xs.at(-1),yO=toY(last.o),yC=toY(last.c),bodyTop=Math.min(yO,yC),bodyBottom=Math.max(yO,yC),bullish=last.c>=last.o,flash=Math.max(0,Math.min(1,(state.flashUntil-ts)/560)),tickGap=1.6,tickY=Math.max(top+1,Math.min(bottom-1,bullish?bodyTop-tickGap:bodyBottom+tickGap)),tickHalf=bodyW/2;
  ctx.save();ctx.lineCap='round';ctx.strokeStyle=hexAlpha(state.colors.yellow,.80+flash*.20);ctx.lineWidth=1.85+flash*1.2;if(flash>0){ctx.shadowColor=hexAlpha(state.colors.yellow,.32+flash*.40);ctx.shadowBlur=2+flash*6;}ctx.beginPath();ctx.moveTo(lastX-tickHalf,tickY);ctx.lineTo(lastX+tickHalf,tickY);ctx.stroke();ctx.restore();
  drawCrosshair(ctx,key,candles,xs,left,right,top,bottom,min,span);
  updateScaleText(now,min,max,span,latest);updateStats(candles);const marker=$('scaleMarker');if(marker){const pct=100-Math.max(0,Math.min(1,(latest-min)/span))*100;marker.style.top=Math.max(5,Math.min(95,pct))+'%';}
}

function selectRange(key){if(!ranges[key]||key===state.active)return;state.active=key;state.crosshair.active=false;try{localStorage.setItem('inj_node_live_chart_range',key);}catch(_){}document.querySelectorAll('.timeframe').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===key));setText('activeRangeLabel',ranges[key].label);setText('watermarkRange',ranges[key].label);setText('footerRange',ranges[key].label);$('terminalShell')?.setAttribute('data-range-key',key);state.scaleTextAt=0;if(state.loaded[ranges[key].source])setLoading('done');else{setLoading('sync');void ensureHistory(key);} }

document.querySelectorAll('.timeframe').forEach(btn=>btn.addEventListener('click',()=>selectRange(btn.dataset.range)));
function pointerPosition(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
canvas?.addEventListener('pointerdown',(e)=>{canvas.setPointerCapture?.(e.pointerId);const p=pointerPosition(e);state.crosshair={active:true,x:p.x,y:p.y};e.preventDefault();});
canvas?.addEventListener('pointermove',(e)=>{if(e.pointerType==='mouse'&&!state.crosshair.active){const p=pointerPosition(e);state.crosshair={active:true,x:p.x,y:p.y};return;}if(state.crosshair.active){const p=pointerPosition(e);state.crosshair.x=p.x;state.crosshair.y=p.y;e.preventDefault();}});
canvas?.addEventListener('pointerup',(e)=>{if(e.pointerType!=='mouse')state.crosshair.active=false;canvas.releasePointerCapture?.(e.pointerId);});
canvas?.addEventListener('pointercancel',()=>{state.crosshair.active=false;});
canvas?.addEventListener('pointerleave',(e)=>{if(e.pointerType==='mouse')state.crosshair.active=false;});

const focusExit=document.createElement('button');focusExit.className='focus-exit';focusExit.type='button';focusExit.textContent='EXIT FOCUS';document.body.appendChild(focusExit);
function setFocus(on){$('livePage')?.classList.toggle('focus-mode',on);$('focusToggle')?.setAttribute('aria-pressed',String(on));requestAnimationFrame(resizeCanvas);}
$('focusToggle')?.addEventListener('click',()=>setFocus(!$('livePage')?.classList.contains('focus-mode')));focusExit.addEventListener('click',()=>setFocus(false));

function frame(ts){state.raf=0;if(document.hidden||state.stopped)return;if(ts-state.lastFrame<minFrameMs){state.raf=requestAnimationFrame(frame);return;}const dt=Math.max(8,Math.min(80,ts-(state.lastFrame||ts-minFrameMs)));state.lastFrame=ts;const target=state.targetPrice>0?state.targetPrice:state.lastPrice;if(target>0){if(!(state.visualPrice>0))state.visualPrice=target;const delta=target-state.visualPrice;state.visualPrice+=delta*(1-Math.exp(-dt/125));if(Math.abs(target-state.visualPrice)<Math.max(.0000005,target*1e-8))state.visualPrice=target;setText('headerLivePrice',priceText(state.visualPrice));drawActive(Date.now(),dt,ts);}if(state.lastTickAt){const age=Date.now()-state.lastTickAt;setText('lastTickText',age<1100?'NOW':age<60000?`${Math.floor(age/1000)}s`:`${Math.floor(age/60000)}m`);}state.raf=requestAnimationFrame(frame);}
function start(){if(!state.raf&&!document.hidden&&!state.stopped)state.raf=requestAnimationFrame(frame);}
function stop(){state.stopped=true;if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;clearTimeout(state.reconnect);try{state.ws?.close();}catch(_){}state.ws=null;}

$('liveChartsBack')?.addEventListener('click',()=>{stop();if(history.length>1)history.back();else location.href='./index.html';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;try{state.ws?.close();}catch(_){}}else if(!state.stopped){start();connect();}});

colors();
document.querySelectorAll('.timeframe').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===state.active));
setText('activeRangeLabel',ranges[state.active].label);setText('watermarkRange',ranges[state.active].label);setText('footerRange',ranges[state.active].label);
start();void loadShortHistory().then(()=>ensureHistory(state.active));connect();
