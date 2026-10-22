/* INJ Node · genuine rolling 1H Heatmap charts · v16.07.26
   Only timestamped observations from the existing Binance/CG price feed.
   No 7D resampling, independent polling, assumed prices or offline backfill. */
(()=>{
 'use strict';
 const market=()=>window.INJ_MARKET_VIEW_API;
 const views=window.INJ_MARKET_VIEWS;
 const global=document.getElementById('injGlobalMarket');
 const heat=document.getElementById('marketHeatmap');
 const grid=document.getElementById('marketHeatmapGrid');
 if(!views||!global||!heat||!grid)return;
 const storageKey='inj_node_heatmap_real_1h_v1';
 const windowMs=60*60*1000,stepMs=30000,maxPoints=155;
 const series=new Map();
 let currency='',dirty=false,paintPending=false,paintTimer=0,lastPaint=0;
 function currentCurrency(){return market()?.getCurrency?.()||'usd'}
 function restore(){
  try{
   const data=JSON.parse(localStorage.getItem(storageKey)||'null');
   if(!data||data.version!==1||!Array.isArray(data.series)||typeof data.currency!=='string')return;
   currency=data.currency;
   const now=Date.now();
   for(const entry of data.series.slice(0,250)){
    const id=String(entry?.[0]||'').trim();
    if(!/^[a-z0-9][a-z0-9_.-]{0,99}$/i.test(id)||!Array.isArray(entry?.[1]))continue;
    const samples=entry[1].filter(p=>Array.isArray(p)&&p.length===2
      &&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[1]>0
      &&p[0]>now-windowMs&&p[0]<=now+stepMs)
      .slice(-maxPoints).sort((a,b)=>a[0]-b[0]);
    if(samples.length)series.set(id,samples);
   }
  }catch(_){}
 }
 function ensureCurrency(){
  const next=currentCurrency();
  if(currency!==next){
   series.clear();currency=next;dirty=true;
  }
 }
 function prune(now=Date.now()){
  for(const [id,points] of series){
   while(points.length&&points[0][0]<=now-windowMs)points.shift();
   if(!points.length)series.delete(id);
  }
 }
 function save(){
  if(!dirty)return;
  prune();
  try{
   localStorage.setItem(storageKey,JSON.stringify({
    version:1,currency,series:[...series]
   }));
   dirty=false;
  }catch(_){/* Memory-only in private mode or storage quota exhaustion. */}
 }
 function record(coin,now=Date.now()){
  if(!coin||typeof coin.id!=='string')return false;
  const value=Number(coin.current_price);
  if(!Number.isFinite(value)||value<=0)return false;
  ensureCurrency();
  const bucket=Math.floor(now/stepMs)*stepMs;
  let points=series.get(coin.id);
  if(!points){points=[];series.set(coin.id,points)}
  while(points.length&&points[0][0]<=now-windowMs)points.shift();
  const last=points[points.length-1];
  if(last&&last[0]===bucket){
   if(last[1]===value)return false;
   last[1]=value;
  }else if(!last||bucket>last[0]){
   points.push([bucket,value]);
   if(points.length>maxPoints)points.splice(0,points.length-maxPoints);
  }else return false;
  dirty=true;
  return true;
 }
 function visible(){
  return !document.hidden&&!global.hidden&&!heat.hidden&&grid.isConnected;
 }
 // The horizontal axis is always NOW-60min ... NOW. A gap > 4min yields a
 // discontinuity instead of a fabricated smooth bridge across missing quotes.
 function draw(svg,id,now){
  const from=now-windowMs;
  const values=(series.get(id)||[]).filter(p=>p[0]>=from&&p[0]<=now);
  const ns='http://www.w3.org/2000/svg',fragment=document.createDocumentFragment();
  if(values.length){
   const lowValue=Math.min(...values.map(p=>p[1]));
   const highValue=Math.max(...values.map(p=>p[1]));
   const margin=(highValue-lowValue)*.12||lowValue*.001||.00001;
   const min=lowValue-margin,scale=highValue-lowValue+2*margin;
   const coord=(point)=>{
    const x=Math.max(0,Math.min(100,(point[0]-from)/windowMs*100));
    const y=Math.max(2,Math.min(22,22-(point[1]-min)/scale*20));
    return [x,y];
   };
   let segment=[],last=null;
   function emit(){
    if(segment.length>1){
     const poly=document.createElementNS(ns,'polyline');
     poly.setAttribute('points',segment.join(' '));
     fragment.append(poly);
    }
    segment=[];
   }
   for(const point of values){
    if(last&&point[0]-last[0]>240000)emit();
    const [x,y]=coord(point);
    segment.push(x.toFixed(2)+','+y.toFixed(2));
    last=point;
   }
   emit();
   const [cx,cy]=coord(values[values.length-1]);
   const dot=document.createElementNS(ns,'circle');
   dot.setAttribute('cx',cx.toFixed(2));
   dot.setAttribute('cy',cy.toFixed(2));
   dot.setAttribute('r','1.7');
   fragment.append(dot);
  }
  svg.replaceChildren(fragment);
 }
 function paint(){
  if(!visible())return;
  ensureCurrency();
  const now=Date.now();
  for(const tile of grid.querySelectorAll('.heatmap-tile[data-coin]')){
   const svg=tile.querySelector('.hm-spark');
   if(svg)draw(svg,tile.dataset.coin,now);
  }
  lastPaint=now;
 }
 function queuePaint(){
  if(!visible()||paintPending)return;
  const remaining=Math.max(0,1500-(Date.now()-lastPaint));
  paintPending=true;
  paintTimer=setTimeout(()=>{
   paintPending=false;
   if(visible())requestAnimationFrame(paint);
  },remaining);
 }
 function observeSnapshot(coins){
  if(!Array.isArray(coins))return;
  const now=Date.now();
  for(const c of coins)record(c,now);
  queuePaint();
 }
 // Hook only into the already established market stream. Other Market views
 // and the actual price ticker keep their original behavior.
 const originalTick=views.tick;
 views.tick=function(coin){
  const updated=record(coin);
  const result=originalTick?.(coin);
  if(updated)queuePaint();
  return result;
 };
 const observer=new MutationObserver(()=>queuePaint());
 observer.observe(grid,{childList:true});
 window.INJ_MARKET_HEATMAP_LIVE={observeSnapshot};
 restore();
 ensureCurrency();
 // On load, the existing current quotes are real observations at this moment.
 observeSnapshot(market()?.getCoins?.()||[]);
 setInterval(()=>{if(visible())paint()},10000);
 setInterval(()=>{if(!document.hidden)save()},60000);
 window.addEventListener('pagehide',save);
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)save();
  else queuePaint();
 });
 window.addEventListener('injnode:market:currencychange',()=>{ensureCurrency();queuePaint()});
 queuePaint();
})();
