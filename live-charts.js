'use strict';

// v15.98.60 — Live Charts: yellow candle-width Price Tick replaces the live dot/connector; flashes only on new market data.
// v15.98.60 — Global Market Motion parity: isolated Live Charts now interpolates the live candle/header with the same 125 ms response used by Command Center.
// v15.98.60 — Mobile Live Charts Candles.
// v15.98.60 — adds 1 MIN with the same realtime OHLC + yellow Price Tick behavior.
// Isolated Canvas renderer. Real OHLC candles with timeframe-specific density:
// 1m=1s, 5m=5s, 10m=10s, 1h=1m, 1d=30m, 1w=4h.

const $ = (id) => document.getElementById(id);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const mobile = matchMedia('(hover:none) and (pointer:coarse)').matches || innerWidth <= 820;
const maxFps = mobile ? 24 : 30;
const minFrameMs = 1000 / maxFps;

const ranges = {
  m1: {
    windowMs: MINUTE, bucketMs: SECOND, source: 'short1',
    canvas: 'canvas1m', card: 'card1m', loading: 'loading1m',
    ids: ['top1m','q31m','mid1m','q11m','bottom1m','marker1m','live1m'],
    minSpan: .000055, expand: 110, relax: 1800, expected: 60
  },
  m5: {
    windowMs: 5 * MINUTE, bucketMs: 5 * SECOND, source: 'short5',
    canvas: 'canvas5m', card: 'card5m', loading: 'loading5m',
    ids: ['top5m','q35m','mid5m','q15m','bottom5m','marker5m','live5m'],
    minSpan: .000075, expand: 125, relax: 2200, expected: 60
  },
  m10: {
    windowMs: 10 * MINUTE, bucketMs: 10 * SECOND, source: 'short10',
    canvas: 'canvas10m', card: 'card10m', loading: 'loading10m',
    ids: ['top10m','q310m','mid10m','q110m','bottom10m','marker10m','live10m'],
    minSpan: .00010, expand: 145, relax: 3100, expected: 60
  },
  h1: {
    windowMs: HOUR, bucketMs: MINUTE, source: 'h1',
    canvas: 'canvas1h', card: 'card1h', loading: 'loading1h',
    ids: ['top1h','q31h','mid1h','q11h','bottom1h','marker1h','live1h'],
    minSpan: .00022, expand: 180, relax: 5400, expected: 60
  },
  d1: {
    windowMs: DAY, bucketMs: 30 * MINUTE, source: 'd1', interval: '30m', limit: 50,
    canvas: 'canvas1d', card: 'card1d', loading: 'loading1d',
    ids: ['top1d','q31d','mid1d','q11d','bottom1d','marker1d','live1d'],
    minSpan: .0013, expand: 240, relax: 8200, expected: 48
  },
  w1: {
    windowMs: 7 * DAY, bucketMs: 4 * HOUR, source: 'w1', interval: '4h', limit: 44,
    canvas: 'canvas1w', card: 'card1w', loading: 'loading1w',
    ids: ['top1w','q31w','mid1w','q11w','bottom1w','marker1w','live1w'],
    minSpan: .0030, expand: 300, relax: 12000, expected: 42
  }
};

const state = {
  series: { short1: [], short5: [], short10: [], h1: [], d1: [], w1: [] },
  loaded: { short1: false, short5: false, short10: false, h1: false, d1: false, w1: false },
  loading: {}, scales: {}, scaleTextAt: {},
  lastPrice: 0, targetPrice: 0, visualPrice: 0, lastTickAt: 0, flashUntil: 0,
  colors: null, ws: null, reconnect: 0, stopped: false,
  raf: 0, lastFrame: 0, visible: new Set(['m1','m5','m10','h1'])
};
for (const key of Object.keys(ranges)) { state.scales[key] = null; state.scaleTextAt[key] = 0; }

function priceText(v) {
  if (!(v > 0)) return '—';
  const d = v < 10 ? 4 : v < 100 ? 3 : 2;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function setText(id, text) { const n = $(id); if (n && n.textContent !== text) n.textContent = text; }
function hexAlpha(color, alpha) {
  if (!color) return `rgba(85,168,255,${alpha})`;
  if (color.startsWith('#')) {
    let h = color.slice(1); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
  }
  const m = color.match(/[\d.]+/g); if (m && m.length >= 3) return `rgba(${m[0]},${m[1]},${m[2]},${alpha})`;
  return color;
}
function colors() {
  const cs = getComputedStyle(document.documentElement);
  state.colors = {
    up: cs.getPropertyValue('--up').trim(),
    down: cs.getPropertyValue('--down').trim(),
    accent: cs.getPropertyValue('--accent').trim(),
    canvas: cs.getPropertyValue('--canvas').trim(),
    muted: cs.getPropertyValue('--muted').trim(),
    muted2: cs.getPropertyValue('--muted2').trim()
  };
}
function connection(mode) {
  const n = $('connectionState'); if (!n) return;
  n.className = mode;
  n.lastChild.textContent = mode === 'online' ? 'LIVE' : mode === 'offline' ? 'RECONNECT' : 'CONNECTING';
}
function setLoading(key, mode) {
  const cfg = ranges[key], n = cfg && $(cfg.loading); if (!n) return;
  if (mode === 'done') n.classList.add('done');
  else { n.classList.remove('done'); const s=n.querySelector('span'); if(s) s.textContent = mode === 'live' ? 'LIVE' : 'SYNC'; }
}

function normalizeCandles(rows, bucketMs) {
  const map = new Map();
  for (const raw of rows || []) {
    if (!raw) continue;
    const t = Math.floor(Number(raw.t) / bucketMs) * bucketMs;
    const o = +raw.o, h = +raw.h, l = +raw.l, c = +raw.c;
    if (!(t >= 0 && o > 0 && h > 0 && l > 0 && c > 0)) continue;
    const prev = map.get(t);
    if (!prev) map.set(t, { t, o, h, l, c });
    else { prev.h = Math.max(prev.h, h); prev.l = Math.min(prev.l, l); prev.c = c; }
  }
  return [...map.values()].sort((a,b)=>a.t-b.t);
}
function aggregateCandles(rows, bucketMs) { return normalizeCandles(rows, bucketMs); }
function trimSeries(key, now = Date.now()) {
  const cfg = ranges[key]; if (!cfg) return;
  const arr = state.series[cfg.source] || [];
  const cutoff = now - cfg.windowMs - cfg.bucketMs * 2;
  while (arr.length > 2 && arr[0].t < cutoff) arr.shift();
  const cap = Math.max(cfg.expected + 6, 72);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}
function mergeLiveInto(key, raw) {
  const cfg = ranges[key], arr = state.series[cfg.source]; if (!cfg || !arr) return;
  const t = Math.floor(raw.t / cfg.bucketMs) * cfg.bucketMs;
  let last = arr[arr.length - 1];
  if (!last || last.t < t) {
    last = { t, o: raw.o, h: raw.h, l: raw.l, c: raw.c };
    arr.push(last);
  } else if (last.t === t) {
    last.h = Math.max(last.h, raw.h); last.l = Math.min(last.l, raw.l); last.c = raw.c;
  } else {
    const found = arr.find(c => c.t === t);
    if (found) { found.h=Math.max(found.h,raw.h); found.l=Math.min(found.l,raw.l); found.c=raw.c; }
  }
  trimSeries(key, raw.t);
}

async function fetchKlines(interval, limit) {
  const url = `https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('history');
  const data = await r.json();
  return data.map(row => ({ t:+row[0], o:+row[1], h:+row[2], l:+row[3], c:+row[4] })).filter(c=>c.o>0&&c.h>0&&c.l>0&&c.c>0);
}
async function loadShortHistory() {
  for (const k of ['m1','m5','m10','h1']) setLoading(k,'sync');
  try {
    let seconds = [];
    try { seconds = await fetchKlines('1s', 610); } catch (_) {}
    const minutes = await fetchKlines('1m', 65);

    if (seconds.length) {
      state.series.short1 = normalizeCandles(seconds, ranges.m1.bucketMs);
      state.series.short5 = aggregateCandles(seconds, ranges.m5.bucketMs);
      state.series.short10 = aggregateCandles(seconds, ranges.m10.bucketMs);
    } else {
      // Graceful fallback: 1 MIN starts sparse until realtime 1-second updates fill it.
      state.series.short1 = normalizeCandles(minutes, ranges.m1.bucketMs);
      state.series.short5 = aggregateCandles(minutes, ranges.m5.bucketMs);
      state.series.short10 = aggregateCandles(minutes, ranges.m10.bucketMs);
    }
    state.series.h1 = normalizeCandles(minutes, ranges.h1.bucketMs);
    state.loaded.short1 = state.loaded.short5 = state.loaded.short10 = state.loaded.h1 = true;
    for (const k of ['m1','m5','m10','h1']) { trimSeries(k); setLoading(k,'done'); }
    const latest = seconds.at(-1)?.c || minutes.at(-1)?.c;
    if (latest > 0) { state.lastPrice = latest; state.targetPrice = latest; if (!(state.visualPrice > 0)) state.visualPrice = latest; }
  } catch (_) {
    for (const k of ['m1','m5','m10','h1']) setLoading(k,'live');
  }
}
async function ensureHistory(key) {
  const cfg = ranges[key]; if (!cfg || !cfg.interval || state.loaded[cfg.source] || state.loading[key]) return;
  state.loading[key]=true; setLoading(key,'sync');
  try {
    const rows=await fetchKlines(cfg.interval,cfg.limit);
    state.series[cfg.source]=normalizeCandles(rows,cfg.bucketMs);
    state.loaded[cfg.source]=true; state.scales[key]=null; trimSeries(key); setLoading(key,'done');
    const latest=rows.at(-1)?.c; if(latest>0){ if(!(state.lastPrice>0)) state.lastPrice=latest; if(!(state.targetPrice>0)) state.targetPrice=latest; if(!(state.visualPrice>0)) state.visualPrice=latest; }
  } catch (_) { setLoading(key,'live'); }
  finally { state.loading[key]=false; }
}

function connect() {
  if (state.stopped || document.hidden) return;
  clearTimeout(state.reconnect); connection('connecting');
  try {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/injusdt@kline_1s');
    state.ws=ws;
    ws.onopen=()=>connection('online');
    ws.onmessage=(e)=>{
      try {
        const d=JSON.parse(e.data), k=d.k; if(!k) return;
        const raw={t:+k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c};
        if(!(raw.c>0))return;
        state.lastPrice=raw.c; state.targetPrice=raw.c; if(!(state.visualPrice>0))state.visualPrice=raw.c; state.lastTickAt=Date.now(); state.flashUntil=performance.now()+560;
        for(const key of Object.keys(ranges)) {
          const cfg=ranges[key];
          if(state.loaded[cfg.source]) mergeLiveInto(key,raw);
        }
      } catch (_) {}
    };
    ws.onerror=()=>{};
    ws.onclose=()=>{
      if(state.ws===ws)state.ws=null; connection('offline');
      if(!state.stopped&&!document.hidden)state.reconnect=setTimeout(connect,1800);
    };
  } catch (_) { connection('offline'); state.reconnect=setTimeout(connect,2200); }
}

function setupCanvases() {
  for(const cfg of Object.values(ranges)){
    const canvas=$(cfg.canvas); if(!canvas)continue;
    const resize=()=>{
      const r=canvas.getBoundingClientRect();
      const dpr=Math.min(devicePixelRatio||1,mobile?1.5:1.8);
      const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas._dpr=dpr;canvas._cssW=r.width;canvas._cssH=r.height;}
    };
    canvas._resize=resize;resize();
  }
  const ro=new ResizeObserver(()=>{for(const cfg of Object.values(ranges))$(cfg.canvas)?._resize?.();});
  document.querySelectorAll('.plot').forEach(n=>ro.observe(n));
}
function setupVisibility() {
  const stack=$('chartsStack');
  if(!('IntersectionObserver'in window)||!stack){state.visible=new Set(Object.keys(ranges));for(const k of ['d1','w1'])void ensureHistory(k);return;}
  const io=new IntersectionObserver(entries=>{
    for(const entry of entries){const key=entry.target?.dataset?.rangeKey;if(!key)continue;if(entry.isIntersecting){state.visible.add(key);void ensureHistory(key);}else state.visible.delete(key);}
  },{root:stack,rootMargin:'45% 0px 45% 0px',threshold:.01});
  document.querySelectorAll('.chart-card[data-range-key]').forEach(card=>io.observe(card));
}

function visibleCandles(now,key,cfg){
  const arr=state.series[cfg.source]||[]; if(!arr.length)return[];
  const cutoff=now-cfg.windowMs-cfg.bucketMs;
  return arr.filter(c=>c.t+cfg.bucketMs>=cutoff&&c.t<=now);
}
function timeframeDirection(candles){
  if(!candles.length)return 0;
  const first=candles[0],last=candles[candles.length-1];
  const delta=last.c-first.o,dead=Math.max(last.c*.000006,.000001);
  return Math.abs(delta)<=dead?0:Math.sign(delta);
}
function computeScale(now,dt,key,cfg,candles){
  let lo=Infinity,hi=-Infinity;
  for(const c of candles){if(c.l<lo)lo=c.l;if(c.h>hi)hi=c.h;}
  const latest=candles.at(-1)?.c||state.lastPrice;
  if(!(lo<Infinity&&hi>0&&latest>0))return null;
  const floor=latest<10?.00005:.0005;
  const minSpan=Math.max(latest*cfg.minSpan,floor);
  let span=hi-lo;
  if(span<minSpan){const mid=(hi+lo)/2;lo=mid-minSpan/2;hi=mid+minSpan/2;span=minSpan;}
  const targetMin=lo-span*.12,targetMax=hi+span*.12;
  let sc=state.scales[key];
  if(!sc)sc=state.scales[key]={min:targetMin,max:targetMax};
  else{
    const aMin=1-Math.exp(-dt/(targetMin<sc.min?cfg.expand:cfg.relax));
    const aMax=1-Math.exp(-dt/(targetMax>sc.max?cfg.expand:cfg.relax));
    sc.min+=(targetMin-sc.min)*aMin;sc.max+=(targetMax-sc.max)*aMax;
  }
  lo=sc.min;hi=sc.max;span=Math.max(hi-lo,minSpan);
  const breath=Math.max(span*.075,minSpan*.10);
  if(latest<lo+breath){lo=latest-breath;sc.min=lo;}
  if(latest>hi-breath){hi=latest+breath;sc.max=hi;}
  return{min:lo,max:hi,span:Math.max(hi-lo,minSpan),latest};
}
function drawGuides(ctx,left,right,top,bottom){
  const pw=right-left,ph=bottom-top;ctx.save();ctx.lineWidth=1;ctx.strokeStyle='rgba(135,165,205,.052)';
  for(const f of [.25,.5,.75]){const y=top+ph*f;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
  ctx.strokeStyle='rgba(135,165,205,.025)';
  for(const f of [1/3,2/3]){const x=left+pw*f;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}
  ctx.restore();
}
function drawRangeTags(ctx,candles,xs,toY,right){
  if(candles.length<4)return;
  let hiI=0,loI=0;for(let i=1;i<candles.length;i++){if(candles[i].h>candles[hiI].h)hiI=i;if(candles[i].l<candles[loI].l)loI=i;}
  ctx.save();ctx.font=`700 ${mobile?7:8}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;ctx.fillStyle=hexAlpha(state.colors.muted2,.58);ctx.textBaseline='middle';
  const hx=Math.min(right-12,xs[hiI]+4),hy=Math.max(8,toY(candles[hiI].h)-7);ctx.fillText('H',hx,hy);
  const lx=Math.min(right-12,xs[loI]+4),ly=Math.min(ctx.canvas._cssH-8,toY(candles[loI].l)+8);ctx.fillText('L',lx,ly);ctx.restore();
}
function updateScaleText(now,key,cfg,min,max,span,latest){
  if(now-state.scaleTextAt[key]<120)return;state.scaleTextAt[key]=now;
  const ids=cfg.ids;setText(ids[0],priceText(max));setText(ids[1],priceText(min+span*.75));setText(ids[2],priceText(min+span*.5));setText(ids[3],priceText(min+span*.25));setText(ids[4],priceText(min));setText(ids[6],priceText(latest));
}

function drawOne(now,dt,key,cfg,ts){
  if(!state.loaded[cfg.source])return;
  const rawCandles=visibleCandles(now,key,cfg);if(!rawCandles.length)return;
  const visual=state.visualPrice>0?state.visualPrice:(state.lastPrice>0?state.lastPrice:rawCandles.at(-1).c);
  const candles=rawCandles.slice();
  const rawLast=candles.at(-1);
  if(rawLast&&visual>0){candles[candles.length-1]={...rawLast,c:visual,h:Math.max(rawLast.h,visual),l:Math.min(rawLast.l,visual)};}
  const canvas=$(cfg.canvas),ctx=canvas?.getContext('2d');if(!ctx)return;
  canvas._resize?.();const dpr=canvas._dpr||1,w=canvas._cssW||canvas.clientWidth,h=canvas._cssH||canvas.clientHeight;if(w<2||h<2)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const scale=computeScale(now,dt,key,cfg,candles);if(!scale)return;
  const {min,max,span,latest}=scale;
  const left=mobile?8:11,right=w-(mobile?10:13),top=9,bottom=h-9,plotH=Math.max(1,bottom-top),plotW=Math.max(1,right-left);
  const toY=(p)=>bottom-Math.max(0,Math.min(1,(p-min)/span))*plotH;
  drawGuides(ctx,left,right,top,bottom);

  const count=candles.length;
  const step=plotW/Math.max(count,1);
  const bodyW=Math.max(1.5,Math.min(mobile?5.2:6.4,step*.62));
  const xs=[];
  for(let i=0;i<count;i++){
    const c=candles[i],x=left+step*(i+.5);xs.push(x);
    const up=c.c>=c.o,color=up?state.colors.up:state.colors.down;
    const yH=toY(c.h),yL=toY(c.l),yO=toY(c.o),yC=toY(c.c);
    const isLast=i===count-1;
    ctx.save();
    ctx.strokeStyle=hexAlpha(color,isLast?.94:.72);ctx.lineWidth=isLast?1.15:.9;
    ctx.beginPath();ctx.moveTo(x,yH);ctx.lineTo(x,yL);ctx.stroke();
    let by=Math.min(yO,yC),bh=Math.abs(yC-yO);
    if(bh<1.35){by=(yO+yC)/2-.675;bh=1.35;}
    ctx.fillStyle=hexAlpha(color,isLast?.92:.74);
    ctx.fillRect(x-bodyW/2,by,bodyW,bh);
    if(isLast){ctx.strokeStyle=hexAlpha(color,.95);ctx.lineWidth=.75;ctx.strokeRect(x-bodyW/2-.35,by-.35,bodyW+.7,bh+.7);}
    ctx.restore();
  }

  const dir=timeframeDirection(candles),card=$(cfg.card);if(card){card.classList.remove('up','down','neutral');card.classList.add(dir>0?'up':dir<0?'down':'neutral');}
  const tfColor=dir>0?state.colors.up:dir<0?state.colors.down:state.colors.accent;
  const last=candles.at(-1),lastX=xs.at(-1),lastY=toY(last.c);
  drawRangeTags(ctx,candles,xs,toY,right);

  // v15.98.60 — compact live Price Tick: same width as the final candle body.
  // Bullish candle -> tick rests just above the body; bearish candle -> just below.
  // Yellow is reserved for the live-price indicator so it never gets confused with candle direction.
  const yO=toY(last.o),yC=toY(last.c);
  const bodyTop=Math.min(yO,yC),bodyBottom=Math.max(yO,yC);
  const bullish=last.c>=last.o;
  const flash=Math.max(0,Math.min(1,(state.flashUntil-ts)/560));
  const tickGap=1.35;
  const tickY=Math.max(top+1,Math.min(bottom-1,bullish?bodyTop-tickGap:bodyBottom+tickGap));
  const tickHalf=bodyW/2;
  const tickColor='#ffd84d';
  ctx.save();
  ctx.lineCap='round';
  ctx.strokeStyle=hexAlpha(tickColor,.78+flash*.22);
  ctx.lineWidth=1.8+flash*1.25;
  if(flash>0){
    ctx.shadowColor=hexAlpha(tickColor,.32+flash*.42);
    ctx.shadowBlur=2+flash*6;
  }
  ctx.beginPath();
  ctx.moveTo(lastX-tickHalf,tickY);
  ctx.lineTo(lastX+tickHalf,tickY);
  ctx.stroke();
  ctx.restore();

  updateScaleText(now,key,cfg,min,max,span,latest);
  const marker=$(cfg.ids[5]);if(marker){const pct=100-Math.max(0,Math.min(1,(latest-min)/span))*100;marker.style.top=Math.max(5,Math.min(95,pct))+'%';}
}

function frame(ts){
  state.raf=0;if(document.hidden||state.stopped)return;
  if(ts-state.lastFrame<minFrameMs){state.raf=requestAnimationFrame(frame);return;}
  const dt=Math.max(8,Math.min(80,ts-(state.lastFrame||ts-minFrameMs)));state.lastFrame=ts;
  const target=state.targetPrice>0?state.targetPrice:state.lastPrice;
  if(target>0){
    if(!(state.visualPrice>0))state.visualPrice=target;
    const delta=target-state.visualPrice;
    state.visualPrice+=delta*(1-Math.exp(-dt/125));
    if(Math.abs(target-state.visualPrice)<Math.max(.0000005,target*1e-8))state.visualPrice=target;
    setText('headerLivePrice',priceText(state.visualPrice));
    const now=Date.now();for(const key of state.visible){const cfg=ranges[key];if(cfg)drawOne(now,dt,key,cfg,ts);}
  }
  state.raf=requestAnimationFrame(frame);
}
function start(){if(!state.raf&&!document.hidden&&!state.stopped)state.raf=requestAnimationFrame(frame);}
function stop(){state.stopped=true;if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;clearTimeout(state.reconnect);try{state.ws?.close();}catch(_){}state.ws=null;}

$('liveChartsBack')?.addEventListener('click',()=>{stop();if(history.length>1)history.back();else location.href='./index.html';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;try{state.ws?.close();}catch(_){}}else if(!state.stopped){start();connect();}});

colors();setupCanvases();setupVisibility();start();void loadShortHistory();connect();
