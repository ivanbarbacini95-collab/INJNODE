'use strict';

// v15.98.64 — Live Charts 2.1: exchange-native candle intervals + smoother active-candle motion.
// Timeframe buttons now represent real Binance kline intervals (1m, 5m, 15m, 1h, 4h, 1d, 1w).
// aggTrade keeps the current candle moving trade-by-trade; kline streams periodically reconcile exact OHLC/boundaries.

const $ = (id) => document.getElementById(id);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const mobile = matchMedia('(hover:none) and (pointer:coarse)').matches || innerWidth <= 820;
const maxFps = mobile ? 40 : 60;
const minFrameMs = 1000 / maxFps;

const ranges = {
  m1:  { label:'1 MIN',       interval:'1m',  bucketMs:MINUTE,    visible:mobile?36:54, limit:80, minSpan:.00055, expand:105, relax:1500 },
  m5:  { label:'5 MIN',       interval:'5m',  bucketMs:5*MINUTE,  visible:mobile?36:54, limit:80, minSpan:.00110, expand:115, relax:1900 },
  m15: { label:'15 MIN',      interval:'15m', bucketMs:15*MINUTE, visible:mobile?34:52, limit:78, minSpan:.00175, expand:125, relax:2500 },
  h1:  { label:'1 ORA',       interval:'1h',  bucketMs:HOUR,      visible:mobile?34:50, limit:76, minSpan:.0030,  expand:145, relax:3600 },
  h4:  { label:'4 ORE',       interval:'4h',  bucketMs:4*HOUR,    visible:mobile?32:48, limit:74, minSpan:.0060,  expand:165, relax:4800 },
  d1:  { label:'1 GIORNO',    interval:'1d',  bucketMs:DAY,       visible:mobile?30:46, limit:72, minSpan:.0120,  expand:190, relax:6500 },
  w1:  { label:'1 SETTIMANA', interval:'1w',  bucketMs:WEEK,      visible:mobile?28:42, limit:68, minSpan:.0250,  expand:220, relax:8200 }
};

const savedRange = (() => {
  try {
    const v = localStorage.getItem('inj_node_live_chart_range');
    return ranges[v] ? v : 'm1';
  } catch (_) { return 'm1'; }
})();

const state = {
  active:savedRange,
  series:Object.fromEntries(Object.keys(ranges).map(k => [k, []])),
  loaded:Object.fromEntries(Object.keys(ranges).map(k => [k, false])),
  loading:{}, scales:{}, scaleTextAt:0,
  lastPrice:0, targetPrice:0, visualPrice:0, lastTickAt:0, flashUntil:0,
  visualLast:{}, colors:null, ws:null, reconnect:0, stopped:false,
  raf:0, lastFrame:0, geometry:null, crosshair:{active:false,x:0,y:0}
};
for (const key of Object.keys(ranges)) state.scales[key] = null;

function priceText(v){
  if (!(v > 0)) return '—';
  const d = v < 10 ? 4 : v < 100 ? 3 : 2;
  return '$' + v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
}
function pctText(v){ return Number.isFinite(v) ? `${v>=0?'+':''}${v.toFixed(2)}%` : '—'; }
function setText(id,text){ const n=$(id); if(n && n.textContent!==text) n.textContent=text; }
function setTrendClass(node,value){ if(!node)return; node.classList.remove('up','down','neutral'); node.classList.add(value>0?'up':value<0?'down':'neutral'); }
function hexAlpha(color,alpha){
  if(!color) return `rgba(85,168,255,${alpha})`;
  if(color.startsWith('#')){let h=color.slice(1);if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;}
  const m=color.match(/[\d.]+/g); if(m&&m.length>=3) return `rgba(${m[0]},${m[1]},${m[2]},${alpha})`;
  return color;
}
function colors(){
  const cs=getComputedStyle(document.documentElement);
  state.colors={
    up:cs.getPropertyValue('--up').trim(), down:cs.getPropertyValue('--down').trim(), accent:cs.getPropertyValue('--accent').trim(),
    canvas:cs.getPropertyValue('--canvas').trim(), muted:cs.getPropertyValue('--muted').trim(), muted2:cs.getPropertyValue('--muted2').trim(),
    yellow:cs.getPropertyValue('--yellow').trim()||'#ffd84d'
  };
}
function connection(mode){const n=$('connectionState');if(!n)return;n.className=`connection-pill ${mode}`;const b=n.querySelector('b');if(b)b.textContent=mode==='online'?'LIVE':mode==='offline'?'RECONNECT':'CONNECTING';}
function setLoading(mode){const n=$('chartLoading');if(!n)return;if(mode==='done')n.classList.add('done');else{n.classList.remove('done');const s=n.querySelector('span');if(s)s.textContent=mode==='live'?'LIVE':'SYNC';}}

function bucketStart(time,key){
  const cfg=ranges[key];
  if(!cfg) return time;
  if(key==='w1'){
    const d=new Date(time); const day=(d.getUTCDay()+6)%7;
    return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day,0,0,0,0);
  }
  return Math.floor(time/cfg.bucketMs)*cfg.bucketMs;
}
function normalizeCandles(rows){
  return (rows||[]).filter(Boolean).map(raw=>({t:+raw.t,o:+raw.o,h:+raw.h,l:+raw.l,c:+raw.c}))
    .filter(c=>c.t>=0&&c.o>0&&c.h>0&&c.l>0&&c.c>0).sort((a,b)=>a.t-b.t);
}
function trimSeries(key){
  const arr=state.series[key],cfg=ranges[key]; if(!arr||!cfg)return;
  const cap=Math.max(cfg.limit+8,88); if(arr.length>cap)arr.splice(0,arr.length-cap);
}
function upsertCandle(key,raw){
  const arr=state.series[key]; if(!arr||!raw||!(raw.o>0&&raw.h>0&&raw.l>0&&raw.c>0))return;
  const c={t:+raw.t,o:+raw.o,h:+raw.h,l:+raw.l,c:+raw.c};
  const last=arr.at(-1);
  if(!last||c.t>last.t) arr.push(c);
  else if(c.t===last.t) Object.assign(last,c);
  else { const i=arr.findIndex(x=>x.t===c.t); if(i>=0)arr[i]=c; }
  trimSeries(key);
}
function mergeTradeInto(key,price,time){
  if(!(price>0)||!state.loaded[key])return;
  const arr=state.series[key],t=bucketStart(time,key),last=arr.at(-1);
  if(!last||last.t<t){
    const open=last?.c>0?last.c:price;
    arr.push({t,o:open,h:Math.max(open,price),l:Math.min(open,price),c:price});
  }else if(last.t===t){
    last.h=Math.max(last.h,price); last.l=Math.min(last.l,price); last.c=price;
  }
  trimSeries(key);
}
function applyTrade(price,time=Date.now()){
  if(!(price>0))return;
  const prev=state.targetPrice;
  state.lastPrice=price; state.targetPrice=price;
  if(!(state.visualPrice>0))state.visualPrice=price;
  state.lastTickAt=Date.now();
  if(!(prev>0)||Math.abs(price-prev)>1e-12) state.flashUntil=performance.now()+360;
  for(const key of Object.keys(ranges)) mergeTradeInto(key,price,time);
}
function applyKline(key,k){
  if(!ranges[key]||!k)return;
  upsertCandle(key,{t:+k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c});
  state.loaded[key]=true;
  const close=+k.c; if(close>0&&!(state.targetPrice>0)){state.lastPrice=close;state.targetPrice=close;if(!(state.visualPrice>0))state.visualPrice=close;}
  if(key===state.active)setLoading('done');
}

async function fetchKlines(key){
  const cfg=ranges[key];
  const url=`https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=${encodeURIComponent(cfg.interval)}&limit=${cfg.limit}`;
  const r=await fetch(url,{cache:'no-store'}); if(!r.ok)throw new Error('history');
  const data=await r.json();
  return normalizeCandles(data.map(row=>({t:+row[0],o:+row[1],h:+row[2],l:+row[3],c:+row[4]})));
}
async function ensureHistory(key){
  if(!ranges[key]||state.loading[key])return;
  if(state.loaded[key]){if(key===state.active)setLoading('done');return;}
  state.loading[key]=true; if(key===state.active)setLoading('sync');
  try{
    const rows=await fetchKlines(key); state.series[key]=rows; state.loaded[key]=true; state.scales[key]=null;
    const latest=rows.at(-1)?.c; if(latest>0){if(!(state.lastPrice>0))state.lastPrice=latest;if(!(state.targetPrice>0))state.targetPrice=latest;if(!(state.visualPrice>0))state.visualPrice=latest;}
    if(state.targetPrice>0)mergeTradeInto(key,state.targetPrice,Date.now());
    if(key===state.active)setLoading('done');
  }catch(_){if(key===state.active)setLoading('live');}
  finally{state.loading[key]=false;}
}
async function loadAllHistory(){
  setLoading('sync');
  await Promise.allSettled(Object.keys(ranges).map(ensureHistory));
  if(state.loaded[state.active])setLoading('done');
}

function connect(){
  if(state.stopped||document.hidden)return;
  clearTimeout(state.reconnect); connection('connecting');
  try{
    const streams=['injusdt@aggTrade',...Object.values(ranges).map(cfg=>`injusdt@kline_${cfg.interval}`)].join('/');
    const ws=new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`); state.ws=ws;
    ws.onopen=()=>connection('online');
    ws.onmessage=(e)=>{
      try{
        const envelope=JSON.parse(e.data),d=envelope?.data||envelope;
        if(d.e==='aggTrade'){
          const price=+d.p,time=+(d.T||d.E||Date.now()); if(price>0)applyTrade(price,time);
          return;
        }
        if(d.e==='kline'&&d.k){
          const key=Object.keys(ranges).find(k=>ranges[k].interval===d.k.i); if(key)applyKline(key,d.k);
        }
      }catch(_){}
    };
    ws.onerror=()=>{};
    ws.onclose=()=>{if(state.ws===ws)state.ws=null;connection('offline');if(!state.stopped&&!document.hidden)state.reconnect=setTimeout(connect,1400);};
  }catch(_){connection('offline');state.reconnect=setTimeout(connect,2000);}
}

const canvas=$('mainCanvas');
function resizeCanvas(){
  if(!canvas)return; const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,mobile?2:2.25);
  const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas._dpr=dpr;canvas._cssW=r.width;canvas._cssH=r.height;}
}
new ResizeObserver(resizeCanvas).observe($('plot')); resizeCanvas();

function visibleCandles(key){const cfg=ranges[key],arr=state.series[key]||[];return arr.slice(-cfg.visible);}
function timeframeStats(candles){if(!candles.length)return null;let hi=-Infinity,lo=Infinity;for(const c of candles){hi=Math.max(hi,c.h);lo=Math.min(lo,c.l);}const open=candles[0].o,close=candles.at(-1).c,change=open>0?(close/open-1)*100:0;return{open,high:hi,low:lo,close,change};}
function computeScale(dt,key,cfg,candles){
  let lo=Infinity,hi=-Infinity;for(const c of candles){if(c.l<lo)lo=c.l;if(c.h>hi)hi=c.h;}
  const latest=candles.at(-1)?.c||state.lastPrice;if(!(lo<Infinity&&hi>0&&latest>0))return null;
  const floor=latest<10?.00020:.0015,minSpan=Math.max(latest*cfg.minSpan,floor);let span=hi-lo;
  if(span<minSpan){const mid=(hi+lo)/2;lo=mid-minSpan/2;hi=mid+minSpan/2;span=minSpan;}
  const targetMin=lo-span*.10,targetMax=hi+span*.10;let sc=state.scales[key];
  if(!sc)sc=state.scales[key]={min:targetMin,max:targetMax};
  else{
    const aMin=1-Math.exp(-dt/(targetMin<sc.min?cfg.expand:cfg.relax));
    const aMax=1-Math.exp(-dt/(targetMax>sc.max?cfg.expand:cfg.relax));
    sc.min+=(targetMin-sc.min)*aMin;sc.max+=(targetMax-sc.max)*aMax;
  }
  lo=sc.min;hi=sc.max;span=Math.max(hi-lo,minSpan);
  const breath=Math.max(span*.06,minSpan*.08);
  if(latest<lo+breath){lo=latest-breath;sc.min=lo;} if(latest>hi-breath){hi=latest+breath;sc.max=hi;}
  return{min:lo,max:hi,span:Math.max(hi-lo,minSpan),latest};
}
function drawGuides(ctx,left,right,top,bottom){const pw=right-left,ph=bottom-top;ctx.save();ctx.lineWidth=1;ctx.strokeStyle='rgba(135,165,205,.052)';for(const f of [.25,.5,.75]){const y=top+ph*f;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}ctx.strokeStyle='rgba(135,165,205,.028)';for(const f of [.2,.4,.6,.8]){const x=left+pw*f;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}ctx.restore();}
function drawRangeTags(ctx,candles,xs,toY,right,bottom){if(candles.length<4)return;let hiI=0,loI=0;for(let i=1;i<candles.length;i++){if(candles[i].h>candles[hiI].h)hiI=i;if(candles[i].l<candles[loI].l)loI=i;}ctx.save();ctx.font=`800 ${mobile?7:8}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;ctx.fillStyle=hexAlpha(state.colors.muted2,.56);ctx.textBaseline='middle';ctx.fillText('H',Math.min(right-12,xs[hiI]+5),Math.max(9,toY(candles[hiI].h)-8));ctx.fillText('L',Math.min(right-12,xs[loI]+5),Math.min(bottom-5,toY(candles[loI].l)+9));ctx.restore();}
function pad2(v){return String(v).padStart(2,'0');}
function timeAxisText(ts,key){
  const d=new Date(ts),hh=pad2(d.getHours()),mm=pad2(d.getMinutes());
  if(key==='m1'||key==='m5'||key==='m15'||key==='h1')return `${hh}:${mm}`;
  if(key==='h4')return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)} ${hh}`;
  if(key==='d1')return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)}`;
}
function crosshairTimeText(ts,key){
  const d=new Date(ts);
  if(key==='d1'||key==='w1')return d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit'});
  return d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function drawTimeAxis(ctx,key,candles,xs,left,right,bottom,h){
  if(candles.length<2||xs.length!==candles.length)return; const axisTop=bottom+7,axisTextY=h-(mobile?5:6),usable=Math.max(1,right-left);
  const wanted=Math.max(2,Math.min(mobile?5:7,Math.floor(usable/(mobile?58:76))+1)),chosen=[];
  for(let n=0;n<wanted;n++){const i=Math.round((candles.length-1)*(n/(wanted-1)));if(!chosen.includes(i))chosen.push(i);}
  ctx.save();ctx.strokeStyle=hexAlpha(state.colors.muted2,.13);ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(left,axisTop);ctx.lineTo(right,axisTop);ctx.stroke();
  ctx.font=`650 ${mobile?6.3:7.4}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;ctx.fillStyle=hexAlpha(state.colors.muted2,.54);ctx.textBaseline='alphabetic';
  for(const i of chosen){const x=xs[i],label=timeAxisText(candles[i].t,key);ctx.strokeStyle=hexAlpha(state.colors.muted2,.18);ctx.beginPath();ctx.moveTo(x,axisTop);ctx.lineTo(x,axisTop+3);ctx.stroke();const tw=ctx.measureText(label).width,tx=Math.max(left+tw/2,Math.min(right-tw/2,x));ctx.textAlign='center';ctx.fillText(label,tx,axisTextY);}ctx.restore();
}
function drawCrosshair(ctx,key,candles,xs,left,right,top,bottom,min,span){
  if(!state.crosshair.active||!state.geometry||!candles.length)return;
  const x=Math.max(left,Math.min(right,state.crosshair.x)),y=Math.max(top,Math.min(bottom,state.crosshair.y));let idx=0,best=Infinity;
  for(let i=0;i<xs.length;i++){const d=Math.abs(xs[i]-x);if(d<best){best=d;idx=i;}}
  const candle=candles[idx],cx=xs[idx],price=min+(bottom-y)/(bottom-top)*span;ctx.save();ctx.setLineDash([3,4]);ctx.lineWidth=.75;ctx.strokeStyle=hexAlpha(state.colors.muted2,.32);ctx.beginPath();ctx.moveTo(cx,top);ctx.lineTo(cx,bottom);ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);
  ctx.font=`800 ${mobile?7.2:8.2}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;const tLabel=crosshairTimeText(candle.t,key),pLabel=priceText(price);ctx.textBaseline='middle';const tW=ctx.measureText(tLabel).width+12,pW=ctx.measureText(pLabel).width+12,boxH=18;let tx=Math.max(left,Math.min(right-tW,cx-tW/2));ctx.fillStyle=hexAlpha(state.colors.canvas,.90);ctx.strokeStyle=hexAlpha(state.colors.muted2,.22);ctx.fillRect(tx,bottom-boxH,tW,boxH);ctx.strokeRect(tx,bottom-boxH,tW,boxH);ctx.fillStyle=hexAlpha(state.colors.muted2,.92);ctx.textAlign='center';ctx.fillText(tLabel,tx+tW/2,bottom-boxH/2);let py=Math.max(top,Math.min(bottom-boxH,y-boxH/2));ctx.fillStyle=hexAlpha(state.colors.canvas,.92);ctx.fillRect(right-pW,py,pW,boxH);ctx.strokeRect(right-pW,py,pW,boxH);ctx.fillStyle=hexAlpha(state.colors.muted2,.95);ctx.fillText(pLabel,right-pW/2,py+boxH/2);ctx.restore();
}
function updateScaleText(now,min,max,span,latest){if(now-state.scaleTextAt<90)return;state.scaleTextAt=now;setText('scaleTop',priceText(max));setText('scaleQ3',priceText(min+span*.75));setText('scaleMid',priceText(min+span*.5));setText('scaleQ1',priceText(min+span*.25));setText('scaleBottom',priceText(min));setText('scaleLive',priceText(latest));}
function updateStats(candles){const stats=timeframeStats(candles);if(!stats)return;setText('statOpen',priceText(stats.open));setText('statHigh',priceText(stats.high));setText('statLow',priceText(stats.low));setText('statChange',pctText(stats.change));setText('headerRangeChange',pctText(stats.change));setTrendClass($('statChange'),stats.change);setTrendClass($('headerRangeChange'),stats.change);const shell=$('terminalShell');shell?.classList.remove('up','down','neutral');shell?.classList.add(stats.change>0?'up':stats.change<0?'down':'neutral');}
function smoothLastCandle(key,raw,dt){
  let v=state.visualLast[key];
  if(!v||v.t!==raw.t){v=state.visualLast[key]={...raw};return {...v};}
  const closeA=1-Math.exp(-dt/72),extremeA=1-Math.exp(-dt/52);
  v.o=raw.o;v.c+=(raw.c-v.c)*closeA;v.h+=(raw.h-v.h)*extremeA;v.l+=(raw.l-v.l)*extremeA;
  if(Math.abs(v.c-raw.c)<1e-7)v.c=raw.c;if(Math.abs(v.h-raw.h)<1e-7)v.h=raw.h;if(Math.abs(v.l-raw.l)<1e-7)v.l=raw.l;
  v.h=Math.max(v.h,v.o,v.c);v.l=Math.min(v.l,v.o,v.c);return {...v};
}
function candleProgress(now,key){const cfg=ranges[key],start=bucketStart(now,key);return Math.max(0,Math.min(1,(now-start)/cfg.bucketMs));}
function closeCountdown(now,key){const cfg=ranges[key],start=bucketStart(now,key),ms=Math.max(0,start+cfg.bucketMs-now),total=Math.ceil(ms/1000);if(total<60)return `${total}s`;const m=Math.floor(total/60),s=total%60;if(m<60)return `${m}:${pad2(s)}`;const h=Math.floor(m/60),mm=m%60;if(h<48)return `${h}h ${mm}m`;const d=Math.floor(h/24),hh=h%24;return `${d}g ${hh}h`;}
function updateTimeframeProgress(now,key){document.querySelectorAll('.timeframe').forEach(btn=>{if(btn.dataset.range===key)btn.style.setProperty('--candle-progress',`${(candleProgress(now,key)*100).toFixed(2)}%`);else btn.style.removeProperty('--candle-progress');});setText('closeCountdown',closeCountdown(now,key));}

function drawActive(now,dt,ts){
  const key=state.active,cfg=ranges[key];if(!cfg||!state.loaded[key])return;const rawCandles=visibleCandles(key);if(!rawCandles.length)return;
  const candles=rawCandles.slice(),rawLast=candles.at(-1);if(rawLast)candles[candles.length-1]=smoothLastCandle(key,rawLast,dt);
  const visual=state.visualPrice>0?state.visualPrice:state.lastPrice;if(visual>0&&candles.length){const last=candles.at(-1);last.c=visual;last.h=Math.max(last.h,visual);last.l=Math.min(last.l,visual);}
  const ctx=canvas?.getContext('2d');if(!ctx)return;resizeCanvas();const dpr=canvas._dpr||1,w=canvas._cssW||canvas.clientWidth,h=canvas._cssH||canvas.clientHeight;if(w<2||h<2)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const scale=computeScale(dt,key,cfg,candles);if(!scale)return;const{min,max,span,latest}=scale;const axisH=mobile?19:22,left=mobile?9:13,right=w-(mobile?8:12),top=mobile?9:12,bottom=h-axisH-8,plotH=Math.max(1,bottom-top),plotW=Math.max(1,right-left),toY=(p)=>bottom-Math.max(0,Math.min(1,(p-min)/span))*plotH;
  state.geometry={left,right,top,bottom,min,max,span};drawGuides(ctx,left,right,top,bottom);
  const count=candles.length,step=plotW/Math.max(count,1),bodyW=Math.max(2.3,Math.min(mobile?9.5:12.5,step*.64)),xs=[];
  for(let i=0;i<count;i++){
    const c=candles[i],x=left+step*(i+.5);xs.push(x);const up=c.c>=c.o,color=up?state.colors.up:state.colors.down,yH=toY(c.h),yL=toY(c.l),yO=toY(c.o),yC=toY(c.c),isLast=i===count-1;
    ctx.save();if(isLast&&state.flashUntil>ts){ctx.shadowColor=hexAlpha(color,.30);ctx.shadowBlur=5+5*Math.max(0,(state.flashUntil-ts)/360);}ctx.strokeStyle=hexAlpha(color,isLast?.98:.72);ctx.lineWidth=isLast?1.45:.90;ctx.beginPath();ctx.moveTo(x,yH);ctx.lineTo(x,yL);ctx.stroke();let by=Math.min(yO,yC),bh=Math.abs(yC-yO);if(bh<1.6){by=(yO+yC)/2-.8;bh=1.6;}ctx.fillStyle=hexAlpha(color,isLast?.98:.76);ctx.fillRect(x-bodyW/2,by,bodyW,bh);if(isLast){ctx.strokeStyle=hexAlpha(color,.98);ctx.lineWidth=.85;ctx.strokeRect(x-bodyW/2-.35,by-.35,bodyW+.7,bh+.7);}ctx.restore();
  }
  drawRangeTags(ctx,candles,xs,toY,right,bottom);drawTimeAxis(ctx,key,candles,xs,left,right,bottom,h);
  const last=candles.at(-1),lastX=xs.at(-1),yO=toY(last.o),yC=toY(last.c),bodyTop=Math.min(yO,yC),bodyBottom=Math.max(yO,yC),bullish=last.c>=last.o,flash=Math.max(0,Math.min(1,(state.flashUntil-ts)/360)),tickGap=2,tickY=Math.max(top+1,Math.min(bottom-1,bullish?bodyTop-tickGap:bodyBottom+tickGap)),tickHalf=bodyW*.52;
  ctx.save();ctx.lineCap='round';ctx.strokeStyle=hexAlpha(state.colors.yellow,.84+flash*.16);ctx.lineWidth=2.0+flash*.9;if(flash>0){ctx.shadowColor=hexAlpha(state.colors.yellow,.25+flash*.34);ctx.shadowBlur=2+flash*5;}ctx.beginPath();ctx.moveTo(lastX-tickHalf,tickY);ctx.lineTo(lastX+tickHalf,tickY);ctx.stroke();ctx.restore();
  drawCrosshair(ctx,key,candles,xs,left,right,top,bottom,min,span);updateScaleText(now,min,max,span,latest);updateStats(candles);updateTimeframeProgress(now,key);
  const marker=$('scaleMarker');if(marker){const pct=100-Math.max(0,Math.min(1,(latest-min)/span))*100;marker.style.top=Math.max(5,Math.min(95,pct))+'%';}
}

function selectRange(key){
  if(!ranges[key]||key===state.active)return;state.active=key;state.crosshair.active=false;
  try{localStorage.setItem('inj_node_live_chart_range',key);}catch(_){}
  document.querySelectorAll('.timeframe').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===key));
  setText('activeRangeLabel',ranges[key].label);setText('watermarkRange',ranges[key].label);setText('footerRange',ranges[key].label);$('terminalShell')?.setAttribute('data-range-key',key);state.scaleTextAt=0;
  if(state.loaded[key])setLoading('done');else{setLoading('sync');void ensureHistory(key);}
}
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

function frame(ts){
  state.raf=0;if(document.hidden||state.stopped)return;if(ts-state.lastFrame<minFrameMs){state.raf=requestAnimationFrame(frame);return;}
  const dt=Math.max(6,Math.min(64,ts-(state.lastFrame||ts-minFrameMs)));state.lastFrame=ts;const target=state.targetPrice>0?state.targetPrice:state.lastPrice;
  if(target>0){if(!(state.visualPrice>0))state.visualPrice=target;const delta=target-state.visualPrice;state.visualPrice+=delta*(1-Math.exp(-dt/68));if(Math.abs(target-state.visualPrice)<Math.max(.0000004,target*8e-9))state.visualPrice=target;setText('headerLivePrice',priceText(state.visualPrice));drawActive(Date.now(),dt,ts);}
  if(state.lastTickAt){const age=Date.now()-state.lastTickAt;setText('lastTickText',age<1100?'NOW':age<60000?`${Math.floor(age/1000)}s`:`${Math.floor(age/60000)}m`);}
  state.raf=requestAnimationFrame(frame);
}
function start(){if(!state.raf&&!document.hidden&&!state.stopped)state.raf=requestAnimationFrame(frame);}
function stop(){state.stopped=true;if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;clearTimeout(state.reconnect);try{state.ws?.close();}catch(_){}state.ws=null;}

$('liveChartsBack')?.addEventListener('click',()=>{stop();if(history.length>1)history.back();else location.href='./index.html';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;try{state.ws?.close();}catch(_){}}else if(!state.stopped){start();connect();}});

colors();document.querySelectorAll('.timeframe').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===state.active));setText('activeRangeLabel',ranges[state.active].label);setText('watermarkRange',ranges[state.active].label);setText('footerRange',ranges[state.active].label);start();connect();void loadAllHistory();
