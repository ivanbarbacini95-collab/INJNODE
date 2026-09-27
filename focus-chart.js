/* INJ Node v15.99.116 — Real 15-minute history plus the shared live price feed. */
(() => {
  'use strict';
  const windowMs = 15 * 60_000;
  let samples = [], lastPrice = 0, direction = 0, loadedAt = 0, loading = false, frame = 0;
  const canvas = () => document.getElementById('focusChartCanvas');
  const visible = () => {
    const dialog = document.getElementById('focusDisplayDialog');
    return dialog && !dialog.hidden && !dialog.classList.contains('mode-parked') && !dialog.classList.contains('is-closing') && !document.hidden;
  };
  function trim(now) { samples = samples.filter(p => p.t >= now - windowMs - 60_000 && p.t <= now).slice(-1000); }
  function push(price, time) {
    if (!(price > 0) || !Number.isFinite(time)) return;
    if (samples.at(-1)?.live && time < samples.at(-1).t) return;
    if (lastPrice && price !== lastPrice) direction = price > lastPrice ? 1 : -1;
    lastPrice = price;
    const point = {t: time, p: price, live: true};
    const last = samples.at(-1);
    if (last && time < last.t) return;
    if (last && Math.floor(last.t / 1000) === Math.floor(time / 1000)) samples[samples.length - 1] = point;
    else samples.push(point);
    trim(Date.now()); schedule();
  }
  function schedule() { if (visible() && !frame) frame = requestAnimationFrame(draw); }
  function draw() {
    frame = 0;
    const node = canvas(); if (!node || !visible()) return;
    const rect = node.getBoundingClientRect(), w = rect.width, h = rect.height;
    if (w < 2 || h < 2) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (node.width !== Math.round(w * ratio) || node.height !== Math.round(h * ratio)) { node.width = Math.round(w * ratio); node.height = Math.round(h * ratio); }
    const ctx = node.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,w,h);
    const now = Date.now(); trim(now);
    const points = samples.filter(p => p.t >= now - windowMs);
    const label = document.getElementById('focusChartLabel');
    const fresh = points.length && now - points.at(-1).t < 20_000;
    const title = !points.length ? '15 MIN · IN ATTESA' : !fresh ? '15 MIN · ULTIMO DATO' : points[0].t > now-windowMs+90_000 ? '15 MIN · STORICO PARZIALE' : '15 MIN · LIVE';
    if (label && label.textContent !== title) label.textContent = title;
    if (!points.length) return;
    let low = Math.min(...points.map(p=>p.p)), high = Math.max(...points.map(p=>p.p));
    const span = Math.max(high-low,high*.0005), middle=(high+low)/2;
    low=middle-span*.65;high=middle+span*.65;
    const x=p=>14+((p.t-(now-windowMs))/windowMs)*(w-28);
    const y=p=>h*.2+(1-(p.p-low)/(high-low))*h*.6;
    const theme = getComputedStyle(document.documentElement);
    const color=theme.getPropertyValue(direction>0?'--up':direction<0?'--down':'--accent').trim() || '#55dcb2';
    ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=.26;
    ctx.beginPath();points.forEach((p,i)=>{if(!i||p.t-points[i-1].t>90_000)ctx.moveTo(x(p),y(p));else ctx.lineTo(x(p),y(p));});ctx.stroke();
    const end=points.at(-1), ex=x(end),ey=y(end);
    const glow=ctx.createRadialGradient(ex,ey,0,ex,ey,15);glow.addColorStop(0,color);glow.addColorStop(1,'transparent');
    ctx.globalAlpha=fresh ? .18 : .08;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(ex,ey,15,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=fresh ? .9 : .35;ctx.fillStyle=color;ctx.beginPath();ctx.arc(ex,ey,3.3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  async function open() {
    schedule();
    if (loading || Date.now()-loadedAt<60_000) return;
    loading=true;
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetch('https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=1m&limit=16',{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error('history');
      const rows=await response.json(), now=Date.now();
      if(!Array.isArray(rows))throw new Error('history');
      const history=rows.filter(r=>Number(r[4])>0 && Number(r[0])<=now).map(r=>({t:Math.min(Number(r[6]),now),p:Number(r[4])})).filter(p=>Number.isFinite(p.t));
      const live=samples.filter(p=>p.live);
      samples=[...history.filter(p=>!live.some(l=>Math.abs(l.t-p.t)<1000)),...live].sort((a,b)=>a.t-b.t);
      if(!lastPrice && samples.length){if(samples.length>1)direction=Math.sign(samples.at(-1).p-samples.at(-2).p);lastPrice=samples.at(-1).p;}
      trim(now);loadedAt=now;schedule();
    } catch (_) { schedule(); } finally {clearTimeout(timer);loading=false;}
  }
  window.INJ_FOCUS_CHART={push,open};
  window.addEventListener('resize',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(visible())void open();});
  new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  // Refresh freshness and the time axis without inventing market samples.
  setInterval(()=>{if(visible())schedule();},1000);
})();
