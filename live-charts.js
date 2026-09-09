'use strict';

// v15.98.44 — Institutional Live: 5m / 10m / 1h / 1d / 1w / 1mo / ALL.
// The isolated Canvas page from v15.98.42 remains intact. Long ranges use
// lightweight aggregated Binance candles and lazy rendering so iPhone stays responsive.

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'inj_node_live_charts_isolated_v1';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const MAX_SHORT_SAMPLES = 3900;
const mobile = matchMedia('(hover:none) and (pointer:coarse)').matches || innerWidth <= 820;
const maxFps = mobile ? 24 : 30;
const minFrameMs = 1000 / maxFps;

const ranges = {
  m5: {
    ms: 5 * 60_000, source: 'short',
    canvas: 'canvas5m', card: 'card5m', loading: 'loading5m',
    ids: ['top5m','q35m','mid5m','q15m','bottom5m','marker5m','live5m'],
    momentum: 28_000, minSpan: .00007, smooth: .09, relax: 2300, expand: 135,
    maxPtsMobile: 132, maxPtsDesktop: 180, tail: .18
  },
  m10: {
    ms: 10 * 60_000, source: 'short',
    canvas: 'canvas10m', card: 'card10m', loading: 'loading10m',
    ids: ['top10m','q310m','mid10m','q110m','bottom10m','marker10m','live10m'],
    momentum: 75_000, minSpan: .00010, smooth: .14, relax: 3400, expand: 150,
    maxPtsMobile: 126, maxPtsDesktop: 170, tail: .16
  },
  h1: {
    ms: HOUR, source: 'short',
    canvas: 'canvas1h', card: 'card1h', loading: 'loading1h',
    ids: ['top1h','q31h','mid1h','q11h','bottom1h','marker1h','live1h'],
    momentum: 5 * 60_000, minSpan: .00022, smooth: .20, relax: 6200, expand: 190,
    maxPtsMobile: 112, maxPtsDesktop: 150, tail: .13
  },
  d1: {
    ms: DAY, source: 'history', interval: '5m', limit: 289,
    canvas: 'canvas1d', card: 'card1d', loading: 'loading1d',
    ids: ['top1d','q31d','mid1d','q11d','bottom1d','marker1d','live1d'],
    momentum: 2 * HOUR, minSpan: .0013, smooth: .22, relax: 9000, expand: 260,
    maxPtsMobile: 124, maxPtsDesktop: 170, tail: .11
  },
  w1: {
    ms: 7 * DAY, source: 'history', interval: '30m', limit: 337,
    canvas: 'canvas1w', card: 'card1w', loading: 'loading1w',
    ids: ['top1w','q31w','mid1w','q11w','bottom1w','marker1w','live1w'],
    momentum: 12 * HOUR, minSpan: .0030, smooth: .25, relax: 13000, expand: 320,
    maxPtsMobile: 120, maxPtsDesktop: 164, tail: .095
  },
  mo1: {
    ms: 30 * DAY, source: 'history', interval: '2h', limit: 361,
    canvas: 'canvas1mo', card: 'card1mo', loading: 'loading1mo',
    ids: ['top1mo','q31mo','mid1mo','q11mo','bottom1mo','marker1mo','live1mo'],
    momentum: 2 * DAY, minSpan: .0080, smooth: .28, relax: 18000, expand: 380,
    maxPtsMobile: 116, maxPtsDesktop: 158, tail: .08
  },
  all: {
    ms: 0, all: true, source: 'history', interval: '1w', limit: 1000,
    canvas: 'canvasall', card: 'cardall', loading: 'loadingall',
    ids: ['topall','q3all','midall','q1all','bottomall','markerall','liveall'],
    momentum: 30 * DAY, minSpan: .025, smooth: .32, relax: 24000, expand: 440,
    maxPtsMobile: 112, maxPtsDesktop: 160, tail: .065
  }
};

const state = {
  samples: [], series: { d1: [], w1: [], mo1: [], all: [] }, loaded: {}, loading: {},
  target: 0, visual: 0, lastTick: 0, lastSample: 0,
  raf: 0, lastFrame: 0, ws: null, reconnect: 0, stopped: false,
  scales: {}, scaleTextAt: {}, colors: null, lastPersist: 0,
  visible: new Set(['m5','m10','h1'])
};
for (const key of Object.keys(ranges)) { state.scales[key] = null; state.scaleTextAt[key] = 0; }

function priceText(v) {
  if (!(v > 0)) return '—';
  const d = v < 10 ? 4 : v < 100 ? 3 : 2;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function setText(id, text) { const n = $(id); if (n && n.textContent !== text) n.textContent = text; }
function lowerBoundIn(arr, t) {
  let l = 0, h = arr.length;
  while (l < h) { const m = (l + h) >> 1; if (arr[m].t < t) l = m + 1; else h = m; }
  return l;
}
function normalizeRows(rows, cutoff = -Infinity, maxRows = Infinity) {
  const all = rows.filter(r => r && r.t >= cutoff && r.price > 0).sort((a,b) => a.t - b.t);
  const out = [];
  for (const r of all) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.t - r.t) < 500) {
      if (r.t >= last.t) { last.t = r.t; last.price = r.price; }
    } else out.push({ t: r.t, price: r.price });
  }
  if (out.length > maxRows) out.splice(0, out.length - maxRows);
  return out;
}
function mergeShort(rows) {
  const cutoff = Date.now() - HOUR - 120000;
  state.samples = normalizeRows([...state.samples, ...rows], cutoff, MAX_SHORT_SAMPLES);
}
function addTick(price, t = Date.now()) {
  if (!(price > 0)) return;
  state.target = price; state.lastTick = t;
  if (!(state.visual > 0)) state.visual = price;
  const last = state.samples[state.samples.length - 1];
  if (last && t - state.lastSample < 850) { last.t = t; last.price = price; }
  else { state.samples.push({ t, price }); state.lastSample = t; }
  const cutoff = t - HOUR - 120000;
  while (state.samples.length > 2 && state.samples[0].t < cutoff) state.samples.shift();
  if (state.samples.length > MAX_SHORT_SAMPLES) state.samples.splice(0, state.samples.length - MAX_SHORT_SAMPLES);
  if (t - state.lastPersist > 15000) { persist(); state.lastPersist = t; }
}
function restore() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(raw)) mergeShort(raw.map(r => ({ t: +r[0], price: +r[1] })));
  } catch (_) {}
}
function persist() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state.samples.slice(-MAX_SHORT_SAMPLES).map(r => [Math.round(r.t), +r.price]))); }
  catch (_) {}
}

function setLoading(key, mode) {
  const cfg = ranges[key], n = cfg && $(cfg.loading);
  if (!n) return;
  if (mode === 'done') n.classList.add('done');
  else { n.classList.remove('done'); const s = n.querySelector('span'); if (s) s.textContent = mode === 'live' ? 'LIVE' : 'SYNC'; }
}
async function fetchKlines(interval, limit) {
  const url = `https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('history');
  const data = await r.json();
  const now = Date.now();
  return data.map(row => ({ t: Math.min(+row[6] || +row[0], now), price: +row[4] })).filter(r => r.price > 0);
}
async function loadShortHistory() {
  try {
    const rows = await fetchKlines('1m', 61);
    mergeShort(rows);
    if (state.samples.length) {
      const p = state.samples[state.samples.length - 1].price;
      if (!(state.target > 0)) state.target = p;
      if (!(state.visual > 0)) state.visual = p;
    }
    for (const k of ['m5','m10','h1']) setLoading(k, 'done');
    persist();
  } catch (_) { for (const k of ['m5','m10','h1']) setLoading(k, 'live'); }
}
async function ensureHistory(key) {
  const cfg = ranges[key];
  if (!cfg || cfg.source !== 'history' || state.loaded[key] || state.loading[key]) return;
  state.loading[key] = true; setLoading(key, 'sync');
  try {
    const rows = await fetchKlines(cfg.interval, cfg.limit);
    state.series[key] = normalizeRows(rows);
    state.loaded[key] = true;
    state.scales[key] = null;
    setLoading(key, 'done');
    if (!(state.target > 0) && rows.length) { state.target = rows.at(-1).price; state.visual = state.target; }
  } catch (_) { setLoading(key, 'live'); }
  finally { state.loading[key] = false; }
}

function connection(mode) {
  const n = $('connectionState'); if (!n) return;
  n.className = mode;
  n.lastChild.textContent = mode === 'online' ? 'LIVE' : mode === 'offline' ? 'RECONNECT' : 'CONNECTING';
}
function connect() {
  if (state.stopped || document.hidden) return;
  clearTimeout(state.reconnect); connection('connecting');
  try {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/injusdt@miniTicker');
    state.ws = ws;
    ws.onopen = () => connection('online');
    ws.onmessage = (e) => { try { const d = JSON.parse(e.data); const p = +d.c; if (p > 0) addTick(p, Date.now()); } catch (_) {} };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (state.ws === ws) state.ws = null;
      connection('offline');
      if (!state.stopped && !document.hidden) state.reconnect = setTimeout(connect, 1800);
    };
  } catch (_) { connection('offline'); state.reconnect = setTimeout(connect, 2200); }
}

function setupCanvases() {
  for (const cfg of Object.values(ranges)) {
    const canvas = $(cfg.canvas); if (!canvas) continue;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.55);
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h; canvas._dpr = dpr; canvas._cssW = r.width; canvas._cssH = r.height;
      }
    };
    canvas._resize = resize; resize();
  }
  const ro = new ResizeObserver(() => { for (const cfg of Object.values(ranges)) $(cfg.canvas)?._resize?.(); });
  document.querySelectorAll('.plot').forEach(n => ro.observe(n));
}
function setupVisibility() {
  const stack = $('chartsStack');
  if (!('IntersectionObserver' in window) || !stack) {
    state.visible = new Set(Object.keys(ranges));
    for (const k of ['d1','w1','mo1','all']) void ensureHistory(k);
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const key = entry.target?.dataset?.rangeKey; if (!key) continue;
      if (entry.isIntersecting) { state.visible.add(key); void ensureHistory(key); }
      else state.visible.delete(key);
    }
  }, { root: stack, rootMargin: '55% 0px 55% 0px', threshold: .01 });
  document.querySelectorAll('.chart-card[data-range-key]').forEach(card => io.observe(card));
}
function colors() {
  const cs = getComputedStyle(document.documentElement);
  state.colors = {
    up: cs.getPropertyValue('--up').trim(), down: cs.getPropertyValue('--down').trim(), accent: cs.getPropertyValue('--accent').trim(),
    canvas: cs.getPropertyValue('--canvas').trim(), muted: cs.getPropertyValue('--muted').trim(), muted2: cs.getPropertyValue('--muted2').trim(), line: cs.getPropertyValue('--line').trim()
  };
}
function hexAlpha(hex, alpha) {
  const clean = String(hex || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255))).toString(16).padStart(2, '0');
  return clean + a;
}
function sourceFor(key) { return ranges[key]?.source === 'short' ? state.samples : (state.series[key] || []); }
function momentum(now, key, cfg, latest) {
  const data = sourceFor(key); if (!data.length) return 0;
  const target = now - cfg.momentum;
  let i = lowerBoundIn(data, target); if (i >= data.length) i = data.length - 1;
  if (i > 0 && Math.abs(data[i-1].t - target) < Math.abs(data[i].t - target)) i--;
  const a = data[Math.max(0, i)]?.price || latest, delta = latest - a;
  const dead = Math.max(latest * (cfg.source === 'history' ? .00008 : .000014), .000002);
  return Math.abs(delta) >= dead ? Math.sign(delta) : 0;
}

function buildPoints(now, cfg, visual, dt, key) {
  const data = sourceFor(key);
  if (!data.length && !(visual > 0)) return null;
  const firstDataTime = data[0]?.t || now;
  const start = cfg.all ? firstDataTime : now - cfg.ms;
  let first = lowerBoundIn(data, start), seed = Math.max(0, first - 1);
  const seedPrice = data[seed]?.price || visual;
  let min = Math.min(seedPrice, visual), max = Math.max(seedPrice, visual);
  let last = data.length - 1; while (last >= 0 && data[last].t > now) last--;
  for (let i = first; i <= last; i++) { const p = data[i]?.price; if (p > 0) { if (p < min) min = p; if (p > max) max = p; } }

  const absFloor = visual < 10 ? .00005 : .0005;
  const minSpan = Math.max(visual * cfg.minSpan, absFloor);
  let span = max - min;
  if (span < minSpan) { const c = (max + min) / 2; min = c - minSpan / 2; max = c + minSpan / 2; span = minSpan; }

  const targetMin = min - span * .14, targetMax = max + span * .14;
  let sc = state.scales[key];
  if (!sc) sc = state.scales[key] = { min: targetMin, max: targetMax };
  else {
    const aMin = 1 - Math.exp(-dt / (targetMin < sc.min ? cfg.expand : cfg.relax));
    const aMax = 1 - Math.exp(-dt / (targetMax > sc.max ? cfg.expand : cfg.relax));
    sc.min += (targetMin - sc.min) * aMin; sc.max += (targetMax - sc.max) * aMax;
  }
  min = sc.min; max = sc.max; span = Math.max(max - min, minSpan);
  const breathing = Math.max(span * .095, minSpan * .12);
  if (visual < min + breathing) { min = visual - breathing; sc.min = min; }
  if (visual > max - breathing) { max = visual + breathing; sc.max = max; }
  span = Math.max(max - min, minSpan);

  const visibleCount = Math.max(0, last - first + 1), maxPts = mobile ? cfg.maxPtsMobile : cfg.maxPtsDesktop;
  const step = visibleCount > maxPts ? visibleCount / maxPts : 1;
  const pts = [{ t: start, p: seedPrice }];
  if (step <= 1) {
    for (let i = first; i <= last; i++) { const r = data[i]; if (r?.price > 0) pts.push({ t: r.t, p: r.price }); }
  } else {
    for (let c = 0; c < visibleCount; c += step) {
      const i = Math.min(last, first + Math.floor(c)), r = data[i];
      if (r?.price > 0) pts.push({ t: r.t, p: r.price });
    }
  }
  pts.push({ t: now, p: visual });
  return { pts, min, max, mid: (min + max) / 2, span, start };
}

function softenPoints(points, strength) {
  if (!points || points.length < 4 || !(strength > 0)) return points || [];
  let out = points.map(p => ({ ...p })); const passes = strength >= .18 ? 2 : 1, w = Math.min(.22, strength);
  for (let pass = 0; pass < passes; pass++) {
    const src = out, next = src.map(p => ({ ...p }));
    for (let i = 1; i < src.length - 1; i++) next[i].y = src[i].y * (1 - 2*w) + src[i-1].y * w + src[i+1].y * w;
    next[0].y = src[0].y; next[next.length - 1].y = src[src.length - 1].y; out = next;
  }
  return out;
}
function traceSmooth(ctx, points) {
  if (!points?.length) return; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) return; if (points.length === 2) { ctx.lineTo(points[1].x, points[1].y); return; }
  for (let i = 1; i < points.length - 1; i++) { const p = points[i], n = points[i+1]; ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2); }
  const pen = points[points.length - 2], last = points[points.length - 1]; ctx.quadraticCurveTo(pen.x, pen.y, last.x, last.y);
}
function drawGuides(ctx, w, h, left, right, top, bottom) {
  const plotW = right - left, plotH = bottom - top; ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(135,165,205,.055)';
  for (const f of [.25,.5,.75]) { const y = top + plotH * f; ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(135,165,205,.028)';
  for (const f of [1/3,2/3]) { const x = left + plotW * f; ctx.beginPath(); ctx.moveTo(x,top); ctx.lineTo(x,bottom); ctx.stroke(); }
  ctx.restore();
}
function drawHighLow(ctx, xy, color, w, h) {
  if (!xy || xy.length < 5) return; let hi = xy[0], lo = xy[0];
  for (const p of xy) { if (p.y < hi.y) hi = p; if (p.y > lo.y) lo = p; }
  const live = xy[xy.length - 1]; ctx.save(); ctx.font = `700 ${mobile ? 7 : 8}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;
  ctx.textBaseline = 'middle'; ctx.fillStyle = hexAlpha(state.colors.muted2,.58); ctx.strokeStyle = hexAlpha(color,.42); ctx.lineWidth = 1;
  for (const [tag,p,dy] of [['H',hi,-8],['L',lo,9]]) {
    if (Math.abs(p.x-live.x)<28) continue; const tx=Math.max(10,Math.min(w-20,p.x)), ty=Math.max(9,Math.min(h-9,p.y+dy));
    ctx.beginPath(); ctx.arc(p.x,p.y,1.7,0,Math.PI*2); ctx.stroke(); ctx.fillText(tag,tx+4,ty);
  } ctx.restore();
}
function updateScaleText(now,key,cfg,min,max,span,visual) {
  if (now - state.scaleTextAt[key] < 120) return; state.scaleTextAt[key] = now;
  const q3=min+span*.75, mid=min+span*.5, q1=min+span*.25, ids=cfg.ids;
  setText(ids[0],priceText(max)); setText(ids[1],priceText(q3)); setText(ids[2],priceText(mid)); setText(ids[3],priceText(q1)); setText(ids[4],priceText(min)); setText(ids[6],priceText(visual));
}
function drawOne(now, dt, key, cfg) {
  if (cfg.source === 'history' && !state.loaded[key]) return;
  const canvas=$(cfg.canvas), ctx=canvas?.getContext('2d'); if (!ctx || !(state.visual>0)) return;
  canvas._resize?.(); const dpr=canvas._dpr||1, w=canvas._cssW||canvas.clientWidth, h=canvas._cssH||canvas.clientHeight; if(w<2||h<2)return;
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  const data=buildPoints(now,cfg,state.visual,dt,key); if(!data)return;
  const {pts,min,max,span,start}=data, padX=mobile?9:12, endX=w-(mobile?24:28), top=10, bottom=h-10, plotH=Math.max(1,bottom-top), rawXY=[];
  const duration=Math.max(1, now-start);
  for(const r of pts){const ratioX=Math.max(0,Math.min(1,(r.t-start)/duration)),x=padX+ratioX*(endX-padX),y=bottom-Math.max(0,Math.min(1,(r.p-min)/span))*plotH;rawXY.push({x,y,p:r.p,t:r.t});}
  const xy=softenPoints(rawXY,cfg.smooth); if(!xy.length)return; xy[xy.length-1].y=rawXY[rawXY.length-1].y;
  const dir=momentum(now,key,cfg,state.visual), card=$(cfg.card); card.classList.remove('up','down','neutral'); card.classList.add(dir>0?'up':dir<0?'down':'neutral');
  const color=dir>0?state.colors.up:dir<0?state.colors.down:state.colors.accent; drawGuides(ctx,w,h,padX,endX,top,bottom);
  if(xy.length>1){
    traceSmooth(ctx,xy); const last=xy[xy.length-1],first=xy[0];ctx.lineTo(last.x,bottom);ctx.lineTo(first.x,bottom);ctx.closePath();
    const fill=ctx.createLinearGradient(0,top,0,bottom);fill.addColorStop(0,hexAlpha(color,.075));fill.addColorStop(.58,hexAlpha(color,.025));fill.addColorStop(1,hexAlpha(color,0));ctx.fillStyle=fill;ctx.fill();
    traceSmooth(ctx,xy);ctx.lineWidth=mobile?3.4:3.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=hexAlpha(color,.105);ctx.stroke();
    traceSmooth(ctx,xy);ctx.lineWidth=mobile?1.18:1.28;ctx.strokeStyle=hexAlpha(color,.88);ctx.stroke();
    const tailStart=padX+(endX-padX)*(1-cfg.tail);ctx.save();ctx.beginPath();ctx.rect(tailStart,0,Math.max(1,w-tailStart),h);ctx.clip();traceSmooth(ctx,xy);ctx.lineWidth=mobile?4.2:4.8;ctx.strokeStyle=hexAlpha(color,.10);ctx.stroke();traceSmooth(ctx,xy);ctx.lineWidth=mobile?1.55:1.7;ctx.strokeStyle=hexAlpha(color,.98);ctx.stroke();ctx.restore();
    drawHighLow(ctx,rawXY,color,w,h);
    ctx.save();ctx.setLineDash([2,3]);ctx.lineWidth=1;ctx.strokeStyle=hexAlpha(color,.25);ctx.beginPath();ctx.moveTo(last.x+7,last.y);ctx.lineTo(w-1,last.y);ctx.stroke();ctx.restore();
    const pulse=.5+.5*Math.sin(now/620);ctx.beginPath();ctx.arc(last.x,last.y,(mobile?7.6:8.4)+pulse*.7,0,Math.PI*2);ctx.fillStyle=hexAlpha(color,.075+pulse*.025);ctx.fill();ctx.beginPath();ctx.arc(last.x,last.y,mobile?4.6:5.0,0,Math.PI*2);ctx.fillStyle=hexAlpha(color,.20);ctx.fill();ctx.beginPath();ctx.arc(last.x,last.y,mobile?3.15:3.45,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1.8;ctx.strokeStyle=state.colors.canvas;ctx.stroke();
  }
  updateScaleText(now,key,cfg,min,max,span,state.visual); const marker=$(cfg.ids[5]); if(marker){const pct=100-Math.max(0,Math.min(1,(state.visual-min)/span))*100;marker.style.top=Math.max(5,Math.min(95,pct))+'%';}
}

function frame(ts) {
  state.raf=0; if(document.hidden||state.stopped)return;
  if(ts-state.lastFrame<minFrameMs){state.raf=requestAnimationFrame(frame);return;}
  const dt=Math.max(8,Math.min(80,ts-(state.lastFrame||ts-minFrameMs)));state.lastFrame=ts;
  if(state.target>0){if(!(state.visual>0))state.visual=state.target;const delta=state.target-state.visual,eps=Math.max(state.target*.0000003,.0000005);if(Math.abs(delta)<=eps)state.visual=state.target;else state.visual+=delta*(1-Math.exp(-dt/125));}
  if(state.visual>0){setText('headerLivePrice',priceText(state.visual));const now=Date.now();for(const key of state.visible){const cfg=ranges[key];if(cfg)drawOne(now,dt,key,cfg);}}
  state.raf=requestAnimationFrame(frame);
}
function start(){if(!state.raf&&!document.hidden&&!state.stopped)state.raf=requestAnimationFrame(frame);}
function stop(){state.stopped=true;if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;clearTimeout(state.reconnect);try{state.ws?.close();}catch(_){}state.ws=null;persist();}

$('liveChartsBack')?.addEventListener('click',()=>{stop();if(history.length>1)history.back();else location.href='./index.html';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;try{state.ws?.close();}catch(_){}}else if(!state.stopped){start();connect();}});
window.addEventListener('pagehide',persist,{passive:true});

restore(); colors(); setupCanvases(); setupVisibility();
if(state.samples.length){const p=state.samples[state.samples.length-1].price;state.target=p;state.visual=p;}
start(); void loadShortHistory(); connect();
