'use strict';

// v15.98.66 — Live Charts: ultra-responsive ticks, true edge-to-edge time flow, mobile-fit candles
// and a grow-from-open entrance animation on every timeframe change. Historical candles stay on-screen
// until their body actually clears the left edge; short timeframes move continuously between buckets.

const $ = (id) => document.getElementById(id);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const mobile = matchMedia('(hover:none) and (pointer:coarse)').matches || innerWidth <= 820;
const maxFps = 60;
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
  lastPrice:0,targetPrice:0,visualPrice:0,lastTickAt:0,lastTickDir:0,flashUntil:0,
  colors:null,ws:null,reconnect:0,stopped:false,raf:0,lastFrame:0,
  rangeEnterAt:0, geometry:null,crosshair:{active:false,x:0,y:0}
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
function bookConnection(mode){const n=$('orderBookState');if(!n)return;n.className=`book-pill ${mode}`;const b=n.querySelector('b');if(b)b.textContent=mode==='online'?'LIVE':mode==='offline'?'OFF':'SYNC';}
function orderPriceText(v){return v>0?Number(v).toLocaleString('en-US',{minimumFractionDigits:v<10?4:3,maximumFractionDigits:v<10?4:3}):'—';}
function orderSizeText(v){return v>0?Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:v<100?3:2}):'—';}
function setBookOpen(open){state.book.open=!!open;const page=$('livePage');page?.classList.toggle('book-open',state.book.open);$('orderBookToggle')?.setAttribute('aria-pressed',String(state.book.open));}
function setLoading(mode){const n=$('chartLoading');if(!n)return;if(mode==='done')n.classList.add('done');else{n.classList.remove('done');const s=n.querySelector('span');if(s)s.textContent=mode==='live'?'LIVE':'SYNC';}}

function normalizeCandles(rows,bucketMs){
  const map=new Map();
  for(const raw of rows||[]){if(!raw)continue;const t=Math.floor(Number(raw.t)/bucketMs)*bucketMs;const o=+raw.o,h=+raw.h,l=+raw.l,c=+raw.c;if(!(t>=0&&o>0&&h>0&&l>0&&c>0))continue;const prev=map.get(t);if(!prev)map.set(t,{t,o,h,l,c});else{prev.h=Math.max(prev.h,h);prev.l=Math.min(prev.l,l);prev.c=c;}}
  return [...map.values()].sort((a,b)=>a.t-b.t);
}
function aggregateCandles(rows,bucketMs){return normalizeCandles(rows,bucketMs);}
function trimSeries(key,now=Date.now()){const cfg=ranges[key];if(!cfg)return;const arr=state.series[cfg.source]||[];const cutoff=now-cfg.windowMs-cfg.bucketMs*2;while(arr.length>2&&arr[0].t<cutoff)arr.shift();const cap=Math.max(cfg.expected+6,72);if(arr.length>cap)arr.splice(0,arr.length-cap);}
function mergeLiveInto(key,raw){const cfg=ranges[key],arr=state.series[cfg.source];if(!cfg||!arr)return;const t=Math.floor(raw.t/cfg.bucketMs)*cfg.bucketMs;let last=arr[arr.length-1];if(!last||last.t<t){last={t,o:raw.o,h:raw.h,l:raw.l,c:raw.c};arr.push(last);}else if(last.t===t){last.h=Math.max(last.h,raw.h);last.l=Math.min(last.l,raw.l);last.c=raw.c;}else{const found=arr.find(c=>c.t===t);if(found){found.h=Math.max(found.h,raw.h);found.l=Math.min(found.l,raw.l);found.c=raw.c;}}trimSeries(key,raw.t);}
function mergeTradeInto(key,price,time){const cfg=ranges[key],arr=state.series[cfg.source];if(!cfg||!arr||!state.loaded[cfg.source]||!(price>0))return;const t=Math.floor(time/cfg.bucketMs)*cfg.bucketMs;let last=arr[arr.length-1];if(!last||last.t<t){const open=last?.c>0?last.c:price;last={t,o:open,h:Math.max(open,price),l:Math.min(open,price),c:price};arr.push(last);}else if(last.t===t){last.h=Math.max(last.h,price);last.l=Math.min(last.l,price);last.c=price;}else{const found=arr.find(c=>c.t===t);if(found){found.h=Math.max(found.h,price);found.l=Math.min(found.l,price);found.c=price;}}trimSeries(key,time);}
function applyTrade(price,time=Date.now()){if(!(price>0))return;const previous=state.targetPrice>0?state.targetPrice:(state.lastPrice>0?state.lastPrice:price);state.lastTickDir=price>previous?1:price<previous?-1:state.lastTickDir;state.lastPrice=price;state.targetPrice=price;if(!(state.visualPrice>0))state.visualPrice=price;state.lastTickAt=Date.now();state.flashUntil=performance.now()+420;for(const key of Object.keys(ranges))mergeTradeInto(key,price,time);}

async function fetchKlines(interval,limit){
  const bases=['https://api.binance.com','https://data-api.binance.vision','https://api1.binance.com'];
  let lastErr;
  for(const base of bases){
    try{const url=`${base}/api/v3/klines?symbol=INJUSDT&interval=${encodeURIComponent(interval)}&limit=${limit}`;const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('history '+r.status);const data=await r.json();const rows=data.map(row=>({t:+row[0],o:+row[1],h:+row[2],l:+row[3],c:+row[4]})).filter(c=>c.o>0&&c.h>0&&c.l>0&&c.c>0);if(rows.length)return rows;}catch(e){lastErr=e;}
  }
  throw lastErr||new Error('history');
}
async function loadShortHistory(){
  if(['m1','m5','m10','h1'].includes(state.active))setLoading('sync');
  try{
    let seconds=[];try{seconds=await fetchKlines('1s',610);}catch(_){}
    const minutes=await fetchKlines('1m',65);
    if(seconds.length){state.series.short1=normalizeCandles(seconds,ranges.m1.bucketMs);state.series.short5=aggregateCandles(seconds,ranges.m5.bucketMs);state.series.short10=aggregateCandles(seconds,ranges.m10.bucketMs);}else{
      // Safe visual fallback for browsers that temporarily reject Binance 1s klines.
      // Never stretch a 1-minute OHLC over a 1s/5s/10s candle: use flat real minute opens until live aggTrades replace them.
      const now=Date.now();
      const flat=(bucketMs,windowMs)=>{const out=[];const first=Math.floor((now-windowMs)/bucketMs)*bucketMs;for(let t=first;t<=now;t+=bucketMs){let row=minutes[0];for(const m of minutes){if(m.t<=t)row=m;else break;}const px=row?.o||minutes.at(-1)?.c||state.targetPrice;if(px>0)out.push({t,o:px,h:px,l:px,c:px});}return out;};
      state.series.short1=flat(ranges.m1.bucketMs,ranges.m1.windowMs+ranges.m1.bucketMs*2);
      state.series.short5=flat(ranges.m5.bucketMs,ranges.m5.windowMs+ranges.m5.bucketMs*2);
      state.series.short10=flat(ranges.m10.bucketMs,ranges.m10.windowMs+ranges.m10.bucketMs*2);
    }
    state.series.h1=normalizeCandles(minutes,ranges.h1.bucketMs);
    state.loaded.short1=state.loaded.short5=state.loaded.short10=state.loaded.h1=true;
    for(const k of ['m1','m5','m10','h1'])trimSeries(k);
    const latest=seconds.at(-1)?.c||minutes.at(-1)?.c;if(latest>0){if(!(state.lastPrice>0))state.lastPrice=latest;if(!(state.targetPrice>0))state.targetPrice=latest;if(!(state.visualPrice>0))state.visualPrice=latest;}
    if(state.targetPrice>0){const now=Date.now();for(const k of ['m1','m5','m10','h1'])mergeTradeInto(k,state.targetPrice,now);}
    if(['m1','m5','m10','h1'].includes(state.active)){state.rangeEnterAt=performance.now();setLoading('done');}
  }catch(_){if(['m1','m5','m10','h1'].includes(state.active))setLoading('live');}
}
async function ensureHistory(key){const cfg=ranges[key];if(!cfg)return;if(state.loaded[cfg.source]){if(key===state.active)setLoading('done');return;}if(!cfg.interval||state.loading[key])return;state.loading[key]=true;if(key===state.active)setLoading('sync');try{const rows=await fetchKlines(cfg.interval,cfg.limit);state.series[cfg.source]=normalizeCandles(rows,cfg.bucketMs);state.loaded[cfg.source]=true;state.scales[key]=null;trimSeries(key);const latest=rows.at(-1)?.c;if(latest>0){if(!(state.lastPrice>0))state.lastPrice=latest;if(!(state.targetPrice>0))state.targetPrice=latest;if(!(state.visualPrice>0))state.visualPrice=latest;}if(state.targetPrice>0)mergeTradeInto(key,state.targetPrice,Date.now());if(key===state.active){state.rangeEnterAt=performance.now();setLoading('done');}}catch(_){if(key===state.active)setLoading('live');}finally{state.loading[key]=false;}}

function normalizeBookSide(levels,desc=false){
  return (levels||[]).map(l=>Array.isArray(l)?{p:+l[0],q:+l[1]}:{p:+l.price,q:+l.qty}).filter(l=>l.p>0&&l.q>0).sort((a,b)=>desc?b.p-a.p:a.p-b.p);
}
function queueBookRender(){
  const now=performance.now(),wait=Math.max(0,80-(now-state.book.renderAt));
  if(state.book.timer)return;
  state.book.timer=setTimeout(()=>{state.book.timer=0;renderOrderBook();},wait);
}
function renderBookRows(targetId,rows,side,maxQty){
  const host=$(targetId); if(!host) return;
  host.textContent='';
  if(!rows.length){ const empty=document.createElement('div'); empty.className='orderbook-empty'; empty.textContent='WAITING FOR BOOK'; host.appendChild(empty); return; }
  const frag=document.createDocumentFragment();
  for(const row of rows){
    const item=document.createElement('div'); item.className=`book-row ${side}`; item.style.setProperty('--depth', `${Math.max(6,Math.min(100,(row.q/Math.max(maxQty,1))*100))}%`);
    const p=document.createElement('span'); p.className='price'; p.textContent=orderPriceText(row.p);
    const s=document.createElement('span'); s.textContent=orderSizeText(row.q);
    const t=document.createElement('span'); t.className='muted'; t.textContent=orderSizeText(row.total);
    item.append(p,s,t); frag.appendChild(item);
  }
  host.appendChild(frag);
}
function renderOrderBook(){
  state.book.renderAt=performance.now();
  const askLevels=state.book.asks.slice(0,mobile?8:10);
  const bidLevels=state.book.bids.slice(0,mobile?8:10);
  const asksCalc=[]; let aTotal=0; for(const l of askLevels){aTotal+=l.q; asksCalc.push({...l,total:aTotal});}
  const bidsCalc=[]; let bTotal=0; for(const l of bidLevels){bTotal+=l.q; bidsCalc.push({...l,total:bTotal});}
  const askRows=asksCalc.slice().reverse();
  const bidRows=bidsCalc;
  const maxQty=Math.max(...askLevels.map(l=>l.q),...bidLevels.map(l=>l.q),1);
  renderBookRows('bookAsks',askRows,'ask',maxQty);
  renderBookRows('bookBids',bidRows,'bid',maxQty);
  const bestAsk=askLevels[0]?.p||0,bestBid=bidLevels[0]?.p||0,spread=bestAsk>0&&bestBid>0?Math.max(0,bestAsk-bestBid):0;
  const bidVol=bidLevels.reduce((s,l)=>s+l.q,0),askVol=askLevels.reduce((s,l)=>s+l.q,0),sum=bidVol+askVol,imb=sum>0?(bidVol/sum)*100:0;
  setText('bookSpread', spread>0 ? `${spread.toFixed(bestAsk<10?4:3)} · ${(((spread/Math.max(bestBid,1))*100)).toFixed(2)}%` : '—');
  setText('bookImbalance', sum>0 ? `BOOK ${Math.round(imb)}% BUY` : 'BOOK —');
}
function applyBook(payload){
  const asks=normalizeBookSide(payload.asks||payload.a,false).slice(0,20);
  const bids=normalizeBookSide(payload.bids||payload.b,true).slice(0,20);
  if(!asks.length && !bids.length) return;
  state.book.asks=asks; state.book.bids=bids; state.book.bestAsk=asks[0]?.p||0; state.book.bestBid=bids[0]?.p||0; state.book.spread=state.book.bestAsk>0&&state.book.bestBid>0?state.book.bestAsk-state.book.bestBid:0;
  queueBookRender();
}
async function loadOrderBookSnapshot(){
  try{
    const r=await fetch('https://api.binance.com/api/v3/depth?symbol=INJUSDT&limit=20',{cache:'no-store'}); if(!r.ok) throw new Error('book');
    const data=await r.json(); applyBook(data); bookConnection('online');
  }catch(_){ bookConnection('offline'); }
}
function connectBook(){
  if(state.stopped||document.hidden) return; clearTimeout(state.depthReconnect); bookConnection('connecting');
  try{
    const ws=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@depth20@100ms'); state.depthWs=ws;
    ws.onopen=()=>bookConnection('online');
    ws.onmessage=(e)=>{ try{ const d=JSON.parse(e.data); applyBook(d); }catch(_){} };
    ws.onerror=()=>{};
    ws.onclose=()=>{ if(state.depthWs===ws) state.depthWs=null; bookConnection('offline'); if(!state.stopped&&!document.hidden) state.depthReconnect=setTimeout(connectBook,1800); };
  }catch(_){ bookConnection('offline'); state.depthReconnect=setTimeout(connectBook,2000); }
}
function connect(){
  if(state.stopped||document.hidden)return;clearTimeout(state.reconnect);connection('connecting');
  try{
    const ws=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@aggTrade');state.ws=ws;
    ws.onopen=()=>connection('online');
    ws.onmessage=(e)=>{try{const d=JSON.parse(e.data);const price=+d.p,time=+(d.T||d.E||Date.now());if(price>0)applyTrade(price,time);}catch(_){}};
    ws.onerror=()=>{};
    ws.onclose=()=>{if(state.ws===ws)state.ws=null;connection('offline');if(!state.stopped&&!document.hidden)state.reconnect=setTimeout(connect,1500);};
  }catch(_){connection('offline');state.reconnect=setTimeout(connect,2000);}
}

const canvas=$('mainCanvas');
function resizeCanvas(){if(!canvas)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,mobile?1.7:2);const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas._dpr=dpr;canvas._cssW=r.width;canvas._cssH=r.height;}}
new ResizeObserver(resizeCanvas).observe($('plot'));
resizeCanvas();

function visibleCandles(now,key,cfg){const arr=state.series[cfg.source]||[];if(!arr.length)return[];const cutoff=now-cfg.windowMs-cfg.bucketMs*3;return arr.filter(c=>c.t>=cutoff&&c.t<=now);}
function timeframeStats(candles){if(!candles.length)return null;let hi=-Infinity,lo=Infinity;for(const c of candles){hi=Math.max(hi,c.h);lo=Math.min(lo,c.l);}const open=candles[0].o,close=candles.at(-1).c,change=open>0?(close/open-1)*100:0;return{open,high:hi,low:lo,close,change};}
function computeScale(dt,key,cfg,candles){let lo=Infinity,hi=-Infinity;for(const c of candles){if(c.l<lo)lo=c.l;if(c.h>hi)hi=c.h;}const latest=candles.at(-1)?.c||state.lastPrice;if(!(lo<Infinity&&hi>0&&latest>0))return null;const floor=latest<10?.00005:.0005;const minSpan=Math.max(latest*cfg.minSpan,floor);let span=hi-lo;if(span<minSpan){const mid=(hi+lo)/2;lo=mid-minSpan/2;hi=mid+minSpan/2;span=minSpan;}const targetMin=lo-span*.12,targetMax=hi+span*.12;let sc=state.scales[key];if(!sc)sc=state.scales[key]={min:targetMin,max:targetMax};else{const aMin=1-Math.exp(-dt/(targetMin<sc.min?cfg.expand:cfg.relax));const aMax=1-Math.exp(-dt/(targetMax>sc.max?cfg.expand:cfg.relax));sc.min+=(targetMin-sc.min)*aMin;sc.max+=(targetMax-sc.max)*aMax;}lo=sc.min;hi=sc.max;span=Math.max(hi-lo,minSpan);const breath=Math.max(span*.075,minSpan*.10);if(latest<lo+breath){lo=latest-breath;sc.min=lo;}if(latest>hi-breath){hi=latest+breath;sc.max=hi;}return{min:lo,max:hi,span:Math.max(hi-lo,minSpan),latest};}
function drawGuides(ctx,left,right,top,bottom){const pw=right-left,ph=bottom-top;ctx.save();ctx.lineWidth=1;ctx.strokeStyle='rgba(135,165,205,.055)';for(const f of [.25,.5,.75]){const y=top+ph*f;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}ctx.strokeStyle='rgba(135,165,205,.030)';for(const f of [.2,.4,.6,.8]){const x=left+pw*f;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}ctx.restore();}
function drawRangeTags(ctx,candles,xs,toY,right,bottom){if(candles.length<4)return;let hiI=0,loI=0;for(let i=1;i<candles.length;i++){if(candles[i].h>candles[hiI].h)hiI=i;if(candles[i].l<candles[loI].l)loI=i;}ctx.save();ctx.font=`800 ${mobile?7:8}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;ctx.fillStyle=hexAlpha(state.colors.muted2,.58);ctx.textBaseline='middle';const hx=Math.min(right-12,xs[hiI]+5),hy=Math.max(9,toY(candles[hiI].h)-8);ctx.fillText('H',hx,hy);const lx=Math.min(right-12,xs[loI]+5),ly=Math.min(bottom-5,toY(candles[loI].l)+9);ctx.fillText('L',lx,ly);ctx.restore();}
function pad2(v){return String(v).padStart(2,'0');}
function timeAxisText(ts,key){const d=new Date(ts),hh=pad2(d.getHours()),mm=pad2(d.getMinutes()),ss=pad2(d.getSeconds());if(key==='m1')return `${hh}:${mm}:${ss}`;if(key==='w1'){const day=['DOM','LUN','MAR','MER','GIO','VEN','SAB'][d.getDay()];return `${day} ${pad2(d.getDate())} · ${hh}`;}return `${hh}:${mm}`;}
function crosshairTimeText(ts,key){const d=new Date(ts);if(key==='w1'||key==='d1')return d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});if(key==='m1')return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;}
function drawTimeAxis(ctx,key,candles,xs,left,right,bottom,h,now,cfg){
  const axisTop=bottom+7,axisTextY=h-(mobile?5:6),usable=Math.max(1,right-left);
  const minGap=key==='m1'?(mobile?58:72):(key==='w1'?(mobile?68:82):(mobile?54:68));
  const wanted=Math.max(2,Math.min(mobile?5:7,Math.floor(usable/minGap)+1));
  ctx.save();ctx.strokeStyle=hexAlpha(state.colors.muted2,.13);ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(left,axisTop);ctx.lineTo(right,axisTop);ctx.stroke();ctx.font=`650 ${mobile?6.3:7.4}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;ctx.fillStyle=hexAlpha(state.colors.muted2,.54);ctx.textBaseline='alphabetic';
  for(let n=0;n<wanted;n++){const f=n/(wanted-1),x=left+usable*f,stamp=now-cfg.windowMs*(1-f),label=timeAxisText(stamp,key);ctx.strokeStyle=hexAlpha(state.colors.muted2,.18);ctx.beginPath();ctx.moveTo(x,axisTop);ctx.lineTo(x,axisTop+3);ctx.stroke();const tw=ctx.measureText(label).width,tx=Math.max(left+tw/2,Math.min(right-tw/2,x));ctx.textAlign='center';ctx.fillText(label,tx,axisTextY);}
  ctx.restore();
}
function drawCrosshair(ctx,key,candles,xs,left,right,top,bottom,min,span){if(!state.crosshair.active||!state.geometry||!candles.length)return;const x=Math.max(left,Math.min(right,state.crosshair.x)),y=Math.max(top,Math.min(bottom,state.crosshair.y));let idx=0,best=Infinity;for(let i=0;i<xs.length;i++){const d=Math.abs(xs[i]-x);if(d<best){best=d;idx=i;}}const candle=candles[idx],cx=xs[idx],price=min+(bottom-y)/(bottom-top)*span;ctx.save();ctx.setLineDash([3,4]);ctx.lineWidth=.75;ctx.strokeStyle=hexAlpha(state.colors.muted2,.32);ctx.beginPath();ctx.moveTo(cx,top);ctx.lineTo(cx,bottom);ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);ctx.font=`800 ${mobile?7.2:8.2}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;const tLabel=crosshairTimeText(candle.t,key),pLabel=priceText(price);ctx.textBaseline='middle';const tW=ctx.measureText(tLabel).width+12,pW=ctx.measureText(pLabel).width+12;const boxH=18;let tx=Math.max(left,Math.min(right-tW,cx-tW/2));ctx.fillStyle=hexAlpha(state.colors.canvas,.90);ctx.strokeStyle=hexAlpha(state.colors.muted2,.22);ctx.fillRect(tx,bottom-boxH,tW,boxH);ctx.strokeRect(tx,bottom-boxH,tW,boxH);ctx.fillStyle=hexAlpha(state.colors.muted2,.92);ctx.textAlign='center';ctx.fillText(tLabel,tx+tW/2,bottom-boxH/2);let py=Math.max(top,Math.min(bottom-boxH,y-boxH/2));ctx.fillStyle=hexAlpha(state.colors.canvas,.92);ctx.fillRect(right-pW,py,pW,boxH);ctx.strokeRect(right-pW,py,pW,boxH);ctx.fillStyle=hexAlpha(state.colors.muted2,.95);ctx.fillText(pLabel,right-pW/2,py+boxH/2);ctx.restore();}
function updateScaleText(now,min,max,span,latest){if(now-state.scaleTextAt<100)return;state.scaleTextAt=now;setText('scaleTop',priceText(max));setText('scaleQ3',priceText(min+span*.75));setText('scaleMid',priceText(min+span*.5));setText('scaleQ1',priceText(min+span*.25));setText('scaleBottom',priceText(min));setText('scaleLive',priceText(latest));}
function updateStats(candles){const stats=timeframeStats(candles);if(!stats)return;setText('statOpen',priceText(stats.open));setText('statHigh',priceText(stats.high));setText('statLow',priceText(stats.low));setText('statChange',pctText(stats.change));setText('headerRangeChange',pctText(stats.change));setTrendClass($('statChange'),stats.change);setTrendClass($('headerRangeChange'),stats.change);const shell=$('terminalShell');shell?.classList.remove('up','down','neutral');shell?.classList.add(stats.change>0?'up':stats.change<0?'down':'neutral');}

function drawActive(now,dt,ts){
  const key=state.active,cfg=ranges[key];if(!cfg||!state.loaded[cfg.source])return;
  const visible=visibleCandles(now,key,cfg);if(!visible.length)return;
  // Keep the extra candles needed to physically travel beyond the left viewport edge.
  const rawCandles=visible;
  const visual=state.visualPrice>0?state.visualPrice:(state.lastPrice>0?state.lastPrice:rawCandles.at(-1).c);const candles=rawCandles.slice(),rawLast=candles.at(-1);if(rawLast&&visual>0)candles[candles.length-1]={...rawLast,c:visual,h:Math.max(rawLast.h,visual),l:Math.min(rawLast.l,visual)};
  const ctx=canvas?.getContext('2d');if(!ctx)return;resizeCanvas();const dpr=canvas._dpr||1,w=canvas._cssW||canvas.clientWidth,h=canvas._cssH||canvas.clientHeight;if(w<2||h<2)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const scale=computeScale(dt,key,cfg,candles);if(!scale)return;const{min,max,span,latest}=scale;const axisH=mobile?19:22,left=mobile?9:13,right=w-(mobile?8:12),top=mobile?9:12,bottom=h-axisH-8,plotH=Math.max(1,bottom-top),plotW=Math.max(1,right-left),toY=(p)=>bottom-Math.max(0,Math.min(1,(p-min)/span))*plotH;
  state.geometry={left,right,top,bottom,min,max,span};drawGuides(ctx,left,right,top,bottom);
  const count=candles.length,step=plotW/Math.max(1,cfg.expected);
  const smoothFlow=key==='m1'||key==='m5'||key==='m10';
  // Time-anchored X position: every candle moves continuously and is removed only after its body clears the left edge.
  const bodyRatio=mobile?(smoothFlow?.68:.64):(smoothFlow?.76:.70);
  const bodyW=Math.max(mobile?2.6:2.2,Math.min(mobile?9:48,step*bodyRatio)),xs=[];
  const enterElapsed=Math.max(0,ts-(state.rangeEnterAt||0));
  for(let i=0;i<count;i++){
    const c=candles[i];
    let x;
    if(smoothFlow){x=right-step*(.5+(now-c.t)/cfg.bucketMs);}
    else{x=right-step*(count-i-.5);}
    xs.push(x);
    const up=c.c>=c.o,color=up?state.colors.up:state.colors.down,yO=toY(c.o),rawYH=toY(c.h),rawYL=toY(c.l),rawYC=toY(c.c),isLast=i===count-1;
    if(x+bodyW/2<left||x-bodyW/2>right)continue;
    // Opening animation: wick and body stretch naturally away from OPEN, without altering actual data or scale.
    const stagger=Math.min(130,(i/Math.max(1,count-1))*130),q=Math.max(0,Math.min(1,(enterElapsed-stagger)/430)),grow=1-Math.pow(1-q,3);
    const yH=yO+(rawYH-yO)*grow,yL=yO+(rawYL-yO)*grow,yC=yO+(rawYC-yO)*grow;
    ctx.save();ctx.strokeStyle=hexAlpha(color,isLast?.99:.88);ctx.lineWidth=isLast?1.25:1;ctx.beginPath();ctx.moveTo(x,yH);ctx.lineTo(x,yL);ctx.stroke();let by=Math.min(yO,yC),bh=Math.abs(yC-yO);if(bh<1.8){by=(yO+yC)/2-.9;bh=1.8;}ctx.fillStyle=hexAlpha(color,isLast?.99:.94);ctx.fillRect(x-bodyW/2,by,bodyW,bh);if(isLast){ctx.strokeStyle=hexAlpha(color,.99);ctx.lineWidth=.65;ctx.strokeRect(x-bodyW/2-.25,by-.25,bodyW+.5,bh+.5);}ctx.restore();
  }
  drawRangeTags(ctx,candles,xs,toY,right,bottom);drawTimeAxis(ctx,key,candles,xs,left,right,bottom,h,now,cfg);
  // v15.98.64 — Price Pulse Halo + micro Edge Tick on the active candle.
  // The marker sits on the true live close, follows it vertically and uses the latest tick direction.
  const last=candles.at(-1),lastX=xs.at(-1),yO=toY(last.o),rawLastYC=toY(last.c),bullish=last.c>=last.o;
  const lastStagger=Math.min(130,130),lastQ=Math.max(0,Math.min(1,(enterElapsed-lastStagger)/430)),lastGrow=1-Math.pow(1-lastQ,3),yC=yO+(rawLastYC-yO)*lastGrow;
  const flash=Math.max(0,Math.min(1,(state.flashUntil-ts)/560));
  const signalDir=state.lastTickDir||(bullish?1:-1),signalColor=signalDir>=0?state.colors.up:state.colors.down;
  const anchorY=Math.max(top+1,Math.min(bottom-1,yC));
  const tickStart=lastX+bodyW/2+1.1,tickLen=Math.max(4.5,Math.min(8.5,bodyW*.82)),tickEnd=Math.min(right-1,tickStart+tickLen);
  ctx.save();
  if(flash>0){
    const phase=1-flash,haloRadius=Math.max(3.2,bodyW*.62)+phase*7.5;
    ctx.strokeStyle=hexAlpha(signalColor,.10+flash*.28);ctx.lineWidth=.8+flash*.8;
    ctx.shadowColor=hexAlpha(signalColor,.26+flash*.26);ctx.shadowBlur=3+flash*7;
    ctx.beginPath();ctx.arc(lastX,anchorY,haloRadius,0,Math.PI*2);ctx.stroke();
  }
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=hexAlpha(signalColor,.76+flash*.24);ctx.lineWidth=1.35+flash*.55;
  if(flash>0){ctx.shadowColor=hexAlpha(signalColor,.20+flash*.30);ctx.shadowBlur=2+flash*4;}
  ctx.beginPath();ctx.moveTo(tickStart,anchorY);ctx.lineTo(tickEnd,anchorY);ctx.lineTo(tickEnd,anchorY+(signalDir>=0?-2.1:2.1));ctx.stroke();
  ctx.restore();
  drawCrosshair(ctx,key,candles,xs,left,right,top,bottom,min,span);
  updateScaleText(now,min,max,span,latest);updateStats(candles);const marker=$('scaleMarker');if(marker){const pct=100-Math.max(0,Math.min(1,(latest-min)/span))*100;marker.style.top=Math.max(5,Math.min(95,pct))+'%';}
}

function selectRange(key){if(!ranges[key]||key===state.active)return;state.active=key;state.crosshair.active=false;state.rangeEnterAt=performance.now();try{localStorage.setItem('inj_node_live_chart_range',key);}catch(_){}document.querySelectorAll('.timeframe').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===key));setText('activeRangeLabel',ranges[key].label);setText('watermarkRange',ranges[key].label);setText('footerRange',ranges[key].label);$('terminalShell')?.setAttribute('data-range-key',key);state.scaleTextAt=0;if(state.loaded[ranges[key].source])setLoading('done');else{setLoading('sync');void ensureHistory(key);} }

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
$('orderBookToggle')?.addEventListener('click',()=>setBookOpen(!state.book.open));
$('orderBookBackdrop')?.addEventListener('click',()=>setBookOpen(false));

function frame(ts){state.raf=0;if(document.hidden||state.stopped)return;if(ts-state.lastFrame<minFrameMs){state.raf=requestAnimationFrame(frame);return;}const dt=Math.max(8,Math.min(80,ts-(state.lastFrame||ts-minFrameMs)));state.lastFrame=ts;const target=state.targetPrice>0?state.targetPrice:state.lastPrice;if(target>0){if(!(state.visualPrice>0))state.visualPrice=target;const delta=target-state.visualPrice;state.visualPrice+=delta*(1-Math.exp(-dt/38));if(Math.abs(target-state.visualPrice)<Math.max(.0000005,target*1e-8))state.visualPrice=target;setText('headerLivePrice',priceText(state.visualPrice));drawActive(Date.now(),dt,ts);}if(state.lastTickAt){const age=Date.now()-state.lastTickAt;setText('lastTickText',age<1100?'NOW':age<60000?`${Math.floor(age/1000)}s`:`${Math.floor(age/60000)}m`);}state.raf=requestAnimationFrame(frame);}
function start(){if(!state.raf&&!document.hidden&&!state.stopped)state.raf=requestAnimationFrame(frame);}
function stop(){state.stopped=true;if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;clearTimeout(state.reconnect);clearTimeout(state.depthReconnect);if(state.book.timer){clearTimeout(state.book.timer);state.book.timer=0;}try{state.ws?.close();}catch(_){}try{state.depthWs?.close();}catch(_){}state.ws=null;state.depthWs=null;}

$('liveChartsBack')?.addEventListener('click',()=>{stop();if(history.length>1)history.back();else location.href='./index.html';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;try{state.ws?.close();}catch(_){}try{state.depthWs?.close();}catch(_){}}else if(!state.stopped){start();connect();connectBook();loadOrderBookSnapshot();}});

colors();
document.querySelectorAll('.timeframe').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===state.active));
setText('activeRangeLabel',ranges[state.active].label);setText('watermarkRange',ranges[state.active].label);setText('footerRange',ranges[state.active].label);
bookConnection('connecting'); if(!mobile) setBookOpen(false);
start();connect();void loadOrderBookSnapshot();connectBook();void loadShortHistory().then(()=>Promise.allSettled([ensureHistory('d1'),ensureHistory('w1')])).then(()=>ensureHistory(state.active));
