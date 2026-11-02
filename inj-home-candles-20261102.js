/* INJ Node · real OHLC candlestick charts for Pro Home and Light.
   A single 5m Binance feed supplies:
   - current UTC day aggregated into 15m OHLC for Pro;
   - sliding last 6h as native 5m OHLC for Light.
   The displayed current candle is updated by the existing INJ live price.
   Never synthesize historical candles from interpolated closing prices. */
(()=>{
 'use strict';
 if(document.documentElement.dataset.injPage!=='index')return;
 const root=document.documentElement;
 const get=id=>document.getElementById(id);
 const SVG='http://www.w3.org/2000/svg';
 const FIVE=300000,SIX_HOURS=21600000,DAY=86400000;
 const source={rows:[],updatedAt:0,lastAttempt:0,loading:false};
 let lastPrice=NaN,lastGlow=0,lightSvg=null,proSvg=null,lastQuoteRead=NaN;
 let candleHalo=null,candleDot=null,markerSvg=null;
 let pending=false;
 const asNumber=x=>Number(x);
 const format=(x,d=4)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}).format(x);
 const isVisible=()=>document.visibilityState!=='hidden' && get('entryGate')?.classList.contains('visible');
 const realPrice=()=>{
   const el=get('entryMarketPrice');
   const n=Number(el?.dataset.entryNumericValue);
   return el?.dataset.entryNumericValue!==undefined&&Number.isFinite(n)&&n>0?n:NaN;
 };
 const node=(tag,attrs={})=>{
   const el=document.createElementNS(SVG,tag);
   for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
   return el;
 };
 const put=(id,value)=>{
   const el=get(id);if(el&&el.textContent!==String(value))el.textContent=String(value);
 };
 function ensureChart(stage,id){
   if(!stage)return null;
   let el=get(id);
   if(!el){
     el=node('svg',{id,viewBox:'0 0 320 150',preserveAspectRatio:'none','aria-hidden':'true',focusable:'false'});
     stage.appendChild(el);
   }
   return el;
 }
 async function refreshCandles(force=false){
   const now=Date.now();
   if(source.loading || !isVisible())return;
   if(!force&&now-source.lastAttempt<60000)return;
   source.lastAttempt=now;
   source.loading=true;
   try{
     const earliest=now-DAY-2*FIVE;
     const url='https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=5m&startTime='+earliest+'&endTime='+now+'&limit=400';
     const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10500)});
     if(!response.ok)throw new Error('OHLC '+response.status);
     const data=await response.json();
     if(!Array.isArray(data))throw new Error('OHLC response not an array');
     const rows=data.map(c=>{
       const [t,o,h,l,z]=c;
       return{t:Number(t),o:Number(o),h:Number(h),l:Number(l),c:Number(z)};
     }).filter(c=>Number.isFinite(c.t)&&c.t>0&&c.o>0&&c.c>0&&c.h>=Math.max(c.o,c.c)&&c.l>0&&c.l<=Math.min(c.o,c.c))
       .sort((a,b)=>a.t-b.t);
     if(rows.length>=2){source.rows=rows;source.updatedAt=Date.now();}
   }catch(error){
     if(!source.rows.length)console.warn('INJ Node candles unavailable:',error);
   }finally{
     source.loading=false;
     schedule();
   }
 }
 function aggregate(rows,interval){
   const groups=[];
   for(const bar of rows){
     const stamp=Math.floor(bar.t/interval)*interval;
     const last=groups[groups.length-1];
     if(last&&last.t===stamp){
       last.h=Math.max(last.h,bar.h);
       last.l=Math.min(last.l,bar.l);
       last.c=bar.c;
     }else groups.push({t:stamp,o:bar.o,h:bar.h,l:bar.l,c:bar.c});
   }
   return groups;
 }
 function getCandles(now,light){
   if(!source.rows.length)return[];
   const start=light?now-SIX_HOURS:Math.floor(now/DAY)*DAY;
   let bars=source.rows.filter(c=>c.t+FIVE>=start&&c.t<=now)
     .map(c=>({...c}));
   if(!bars.length)return[];
   // Apply the current live INJ price ONLY to the still-open five-minute
   // bar, never to an already finalized historical candle.
   const quote=realPrice();
   const currentStart=Math.floor(now/FIVE)*FIVE;
   const last=bars[bars.length-1];
   if(last.t===currentStart&&Number.isFinite(quote)){
     last.c=quote;last.h=Math.max(last.h,quote);last.l=Math.min(last.l,quote);
   }
   if(!light){
     bars=bars.filter(c=>c.t>=start);
     bars=aggregate(bars,15*60000);
   }
   return bars;
 }
 function geometry(bars,now,light){
   const x0=light?5:5;
   const x1=light?284:311;
   const from=light?now-SIX_HOURS:Math.floor(now/DAY)*DAY;
   const to=light?now:from+DAY;
   const highs=bars.map(c=>c.h),lows=bars.map(c=>c.l);
   const rawMax=Math.max(...highs),rawMin=Math.min(...lows);
   const rawSpan=rawMax-rawMin;
   const padding=Math.max(rawSpan*.18,((rawMax+rawMin)/2)*.0025);
   const min=Math.max(1e-9,rawMin-padding);
   const max=rawMax+padding;
   const top=10,bottom=140;
   const y=price=>bottom-((price-min)/(max-min))*(bottom-top);
   const center=bar=>{
     const mid=bar.t+(light?FIVE/2:15*60000/2);
     return x0+(Math.min(mid,now)-from)/(to-from)*(x1-x0);
   };
   return{min,max,top,bottom,x0,x1,from,to,y,center};
 }
 function svgContent(svg,bars,geo,light){
   if(!svg)return;
   const frag=document.createDocumentFragment();
   const interval=light?FIVE:900000;
   const bw=Math.max(.95,Math.min(light?3.0:4.5,(geo.x1-geo.x0)/(bars.length>0?(light?72:96):96)*.68));
   for(const c of bars){
     const x=Math.min(geo.x1,Math.max(geo.x0,geo.center(c)));
     const top=geo.y(c.h),bottom=geo.y(c.l);
     const bodyTop=Math.min(geo.y(c.o),geo.y(c.c));
     const bodyBottom=Math.max(geo.y(c.o),geo.y(c.c));
     const cls=c.c>=c.o?'inj-candle-up':'inj-candle-down';
     frag.appendChild(node('line',{x1:x,y1:top,x2:x,y2:bottom,class:cls+' inj-candle-wick'}));
     frag.appendChild(node('rect',{x:x-bw/2,y:bodyTop,width:bw,height:Math.max(.85,bodyBottom-bodyTop),rx:Math.min(.75,bw*.2),class:cls+' inj-candle-body'}));
   }
   svg.replaceChildren(frag);
   svg.setAttribute('data-inj-bars',String(bars.length));
 }
 function paintPriceAxis(geo,price,last){
   const plot=get('injLightChartPlot');
   if(!plot)return;
   const labels=[
     {id:'injLightPriceHigh',y:geo.top},
     {id:'injLightPriceMid',y:(geo.top+geo.bottom)/2},
     {id:'injLightPriceLow',y:geo.bottom}
   ];
   for(const item of labels){
     const el=get(item.id);if(!el)continue;
     el.hidden=false;
     el.style.top=(item.y/150*100)+'%';
     put(item.id,format(geo.min+(geo.max-geo.min)*(geo.bottom-item.y)/(geo.bottom-geo.top),3));
   }
   const now=get('injLightPriceNow');
   if(now){
     const y=Math.max(10,Math.min(140,geo.y(price)));
     now.hidden=false;
     now.style.top=(y/150*100)+'%';
     put('injLightPriceNow',format(price,4));
     labels.forEach(t=>{
       const el=get(t.id);if(el)el.hidden=Math.abs(y-t.y)<15;
     });
   }
   const graphic=lightSvg;
   if(graphic)graphic.setAttribute('aria-label','INJ/USDT 6H · '+format(price,4));
 }
 function clearChart(light){
   const stage=get(light?'injLightChartPlot':'entrySparkStage');
   if(stage)delete stage.dataset.injCandlesReady;
   if(light){
     ['injLightPriceHigh','injLightPriceMid','injLightPriceLow','injLightPriceNow'].forEach(id=>{const el=get(id);if(el)el.hidden=true;});
     put('injLightPerf6h','— · 6H');
     put('injLightLive','SYNC');
   }
 }
 function render(){
   if(!isVisible()||!source.rows.length)return;
   const now=Date.now();
   const proStage=get('entrySparkStage'),lightStage=get('injLightChartPlot');
   const pro=getCandles(now,false),lite=getCandles(now,true);
   if(proStage&&pro.length){
     proSvg=ensureChart(proStage,'injProCandleSvg');
     const geo=geometry(pro,now,false);
     svgContent(proSvg,pro,geo,false);
     proStage.dataset.injCandlesReady='true';
     proStage.setAttribute('aria-label','INJ USDT · candele da 15 minuti, giornata UTC');
   }else clearChart(false);
   if(!lightStage||lite.length<2){clearChart(true);return;}
   lightSvg=ensureChart(lightStage,'injLightCandleSvg');
   const geo=geometry(lite,now,true);
   svgContent(lightSvg,lite,geo,true);
   // Keep the live-dot SVG outside the repeatedly redrawn candle scene.
   // Animations finish naturally even if the quote updates several times.
   markerSvg=ensureChart(lightStage,'injLightCandleMarkerSvg');
   if(!candleHalo || candleHalo.ownerSVGElement!==markerSvg){
     candleHalo=node('circle',{r:8.5,class:'inj-candle-last-halo'});
     candleDot=node('circle',{r:2.8,class:'inj-candle-last-dot'});
     markerSvg.replaceChildren(candleHalo,candleDot);
     candleHalo.addEventListener('animationend',()=>candleHalo.classList.remove('is-pulsing'));
   }
   const latest=lite[lite.length-1];
   const latestX=Math.min(geo.x1,Math.max(geo.x0,geo.center(latest)));
   const latestY=geo.y(latest.c);
   for(const el of [candleHalo,candleDot]){
     el.setAttribute('cx',latestX.toFixed(3));
     el.setAttribute('cy',latestY.toFixed(3));
   }
   const first=lite[0];
   const perf=first.o>0?(latest.c/first.o-1)*100:0;
   const direction=perf>1e-10?'positive':perf< -1e-10?'negative':'neutral';
   lightStage.dataset.performance=direction;
   lightStage.dataset.injCandlesReady='true';
   const change=get('injLightPerf6h');
   if(change){
     const label=(perf>0?'+':'')+perf.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+'% · 6H';
     put('injLightPerf6h',label);
     change.classList.toggle('positive',direction==='positive');
     change.classList.toggle('negative',direction==='negative');
   }
   paintPriceAxis(geo,latest.c,latest);
   put('injLightLive','LIVE');
   if(Number.isFinite(lastPrice)&&lastPrice!==latest.c&&candleHalo&&document.documentElement.dataset.injViewMode==='light'){
     const time=performance.now();
     if(time-lastGlow>1050&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
       candleHalo.classList.add('is-pulsing');
       lastGlow=time;
     }
   }
   lastPrice=latest.c;
 }
 function schedule(){
   if(pending)return;
   pending=true;
   requestAnimationFrame(()=>{pending=false;render();});
 }
 function boot(){
   const price=get('entryMarketPrice');
   if(price)new MutationObserver(schedule).observe(price,{
     subtree:true,childList:true,characterData:true,attributes:true,
     attributeFilter:['data-entry-numeric-value','data-entry-rendered-value','class']
   });
   const gate=get('entryGate');
   if(gate)new MutationObserver(()=>{
     if(isVisible())void refreshCandles();
     schedule();
   }).observe(gate,{attributes:true,attributeFilter:['class','aria-hidden']});
   document.addEventListener('visibilitychange',()=>{
     if(document.visibilityState==='visible'){void refreshCandles(true);schedule();}
   });
   window.addEventListener('pageshow',()=>{void refreshCandles(true);schedule()});
   window.addEventListener('online',()=>{void refreshCandles(true)});
   window.addEventListener('injnode:viewmodechange',schedule);
   window.setInterval(()=>{void refreshCandles();schedule()},10000);
   void refreshCandles(true);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();
