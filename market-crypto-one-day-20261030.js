/* INJ Node · synchronized high-definition crypto market mini charts.
 * Historical points are real CoinGecko or verified Binance Spot quotes.
 * The 7d CoinGecko sparkline is a fallback for 1D/1W, never labeled as 1M.
 * Fetch extra history only for visible rows; throttle shared public APIs.
 */
(()=>{
'use strict';
const api=()=>window.INJ_MARKET_VIEW_API;
const SPANS={ '1h':3600000,'1d':86400000,'1w':604800000,'1m':2592000000 };
const CG_FRAMES={ '1h':'1h','1d':'24h','1w':'7d','1m':'30d' };
const SETTINGS={
 '1h':{interval:'1m',limit:66,ttl:180000},
 '1d':{interval:'5m',limit:300,ttl:600000},
 '1w':{interval:'30m',limit:350,ttl:1800000},
 '1m':{interval:'4h',limit:190,ttl:3600000}
};
const KEY='inj_node_crypto_chart_frame_v1';
const prices=new Map(),fallback=new Map(),observed=new Map(),queue=[],pending=new Set();
let frame='1d',currencyKey='',active=0,observer=null,queuedPaint=false,cgAfter=0,cgBlockedUntil=0;
try{const stored=localStorage.getItem(KEY);if(SPANS[stored])frame=stored}catch(_){}
const good=n=>Number.isFinite(Number(n))&&Number(n)>0;
const fmt=()=>api()?.formatPercent;
const getFrame=()=>frame;
const currentKey=coin=>String(api()?.getCurrency?.()||'usd')+':'+coin.id+':'+frame;
function checkCurrency(){
 const cur=String(api()?.getCurrency?.()||'usd');
 if(cur===currencyKey)return;
 currencyKey=cur;prices.clear();fallback.clear();observed.clear();
 queue.length=0;pending.clear();cgAfter=0;
}
function sample(coin,now=Date.now()){
 if(!coin?.id||!good(coin.current_price))return;
 checkCurrency();
 const arr=observed.get(coin.id)||[];
 while(arr.length&&arr[0].t<now-SPANS['1m'])arr.shift();
 const last=arr.at(-1);
 if(!last||now-last.t>30000)arr.push({t:now,v:Number(coin.current_price)});
 else if(now>=last.t){last.t=now;last.v=Number(coin.current_price)}
 if(arr.length>2200)arr.splice(0,arr.length-2200);
 observed.set(coin.id,arr);
}
function sevenDay(coin,now){
 const src=coin?.sparkline_in_7d?.price;
 if(!Array.isArray(src)||src.length<2)return [];
 const updated=Number(api()?.getMarketUpdatedAt?.())||now;
 // CoinGecko's markets sparkline has no timestamps, so evenly spaced
 // points are an approximation within its published seven-day range.
 const end=Math.min(now,updated),duration=SPANS['1w'];
 return src.map((v,i)=>({t:end-duration*(src.length-1-i)/(src.length-1),v:Number(v)}))
  .filter(p=>good(p.v)&&p.t<=now);
}
function inWindow(points,now){
 const start=now-SPANS[frame],filtered=points.filter(p=>good(p.v)&&p.t>=start-60000&&p.t<=now+60000);
 filtered.sort((a,b)=>a.t-b.t);
 // Keep newest real observation for duplicate timestamps.
 const unique=[];
 for(const p of filtered){if(unique.length&&unique[unique.length-1].t===p.t)unique[unique.length-1]=p;else unique.push(p)}
 return unique;
}
function shrink(data){
 if(data.length<=220)return data;
 const result=[data[0]],step=Math.ceil((data.length-2)/108);
 for(let i=1;i<data.length-1;i+=step){
  const batch=data.slice(i,Math.min(data.length-1,i+step));
  if(!batch.length)continue;
  let lo=batch[0],hi=batch[0];
  for(const p of batch){if(p.v<lo.v)lo=p;if(p.v>hi.v)hi=p}
  if(lo.t===hi.t)result.push(lo);
  else if(lo.t<hi.t)result.push(lo,hi);
  else result.push(hi,lo);
 }
 result.push(data[data.length-1]);return result;
}
function history(coin,now){
 checkCurrency();
 const cached=prices.get(currentKey(coin));
 let values=[];
 if(cached?.values?.length>=2)values=cached.values;
 else if(frame==='1d'||frame==='1w'||frame==='1h')values=sevenDay(coin,now);
 // Never extrapolate the 7-day history to a month.
 values=inWindow(values,now);
 const live=(observed.get(coin.id)||[]).filter(p=>p.t>=now-SPANS[frame]&&p.t<=now&&good(p.v));
 if(values.length>=2){
  // Align a single trading-pair price line to the quote displayed by
  // CoinGecko; its shape is from real candles and never invented points.
  const end=values[values.length-1].v;
  const ratio=good(end)&&good(coin.current_price)?Number(coin.current_price)/end:1;
  if(ratio>.03&&ratio<30)values=values.map(p=>({t:p.t,v:p.v*ratio}));
 }
 return inWindow([...values,...live],now);
}
function chart(coin,now){
 sample(coin,now);
 const values=shrink(history(coin,now));
 if(values.length<2){
  const label=document.documentElement.lang==='en'?'History unavailable for '+frame.toUpperCase():'Storico '+frame.toUpperCase()+' non disponibile';
  return '<span class="inj-1d-empty" aria-label="'+label+'">—</span>';
 }
 const low=Math.min(...values.map(p=>p.v)),high=Math.max(...values.map(p=>p.v));
 const start=now-SPANS[frame],span=SPANS[frame],w=240,h=64;
 const px=t=>Math.max(0,Math.min(w,(t-start)/span*w));
 const py=v=>high>low?h-5-(v-low)/(high-low)*(h-10):h/2;
 const path=values.map((p,i)=>(i?'L':'M')+px(p.t).toFixed(2)+' '+py(p.v).toFixed(2)).join(' ');
 const p=Number(api()?.getChange?.(coin,CG_FRAMES[frame]));
 const up=Number.isFinite(p)?p>=0:values.at(-1).v>=values[0].v;
 const label=(document.documentElement.lang==='en'?'Available market samples':'Campioni di mercato disponibili')+' · '+frame.toUpperCase();
 return '<svg class="inj-1d-chart '+(up?'up':'down')+'" viewBox="0 0 240 64" preserveAspectRatio="none" role="img" aria-label="'+label+'"><path d="'+path+'"/></svg>';
}
function render(coin,now=Date.now()){return chart(coin,now)}
function selectedChange(coin){return Number(api()?.getChange?.(coin,CG_FRAMES[frame]))}
function percentHtml(coin){
 const p=selectedChange(coin);
 const tone=!Number.isFinite(p)?'flat':p>0?'up':p<0?'down':'flat';
 const label=fmt()?.(p)||'—';
 return '<span class="mp-percent mp-period '+tone+'">'+label+'</span>';
}
function paintPercent(coin,row){
 if(!coin||!row)return;
 const field=row.querySelector('.mp-day');
 if(!field)return;
 const value=percentHtml(coin);
 if(field.innerHTML!==value)field.innerHTML=value;
}
function paintRow(row,coin,now=Date.now()){
 if(!row||!coin)return;
 const slot=row.querySelector('.mp-chart');
 if(!slot)return;
 const markup=render(coin,now);
 if(slot.innerHTML!==markup)slot.innerHTML=markup;
 paintPercent(coin,row);
}
function pairFor(coin){
 const symbol=api()?.getPairForCoin?.(coin.id);
 return typeof symbol==='string'&&/^[A-Z0-9]{2,18}USDT$/.test(symbol)?symbol:'';
}
async function json(url,timeout=9500){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
 try{const res=await fetch(url,{signal:ctrl.signal,cache:'no-store',headers:{accept:'application/json'}});
  if(!res.ok){const e=new Error('HTTP '+res.status);e.status=res.status;throw e}
  return await res.json()
 }finally{clearTimeout(timer)}
}
async function loadHistory(coin,requestedFrame,pair){
 const span=SPANS[requestedFrame],now=Date.now();
 if(pair){
  try{
   const spec=SETTINGS[requestedFrame];
   const url='https://data-api.binance.vision/api/v3/klines?symbol='+pair+'&interval='+spec.interval+'&limit='+spec.limit;
   const raw=await json(url);
   const arr=Array.isArray(raw)?raw.map(p=>({t:Number(p[0]),v:Number(p[4])})).filter(p=>good(p.v)&&p.t>=now-span-3600000&&p.t<=now):[];
   if(arr.length>=2)return arr;
  }catch(_){/* CoinGecko fallback; not a fake Binance price history. */}
 }
 if(Date.now()<cgBlockedUntil)return [];
 // Only a bounded number of fallback historical reads per minute.
 const days=requestedFrame==='1h'||requestedFrame==='1d'?1:requestedFrame==='1w'?7:30;
 const url='https://api.coingecko.com/api/v3/coins/'+encodeURIComponent(coin.id)+'/market_chart?vs_currency='+encodeURIComponent(currencyKey)+'&days='+days;
 try{
  const raw=await json(url,10500);
  const arr=Array.isArray(raw?.prices)?raw.prices.map(p=>({t:Number(p[0]),v:Number(p[1])})).filter(p=>good(p.v)&&p.t>=now-span-3600000&&p.t<=now):[];
  return arr.length>=2?arr:[];
 }catch(e){
  if([401,403,418,429].includes(e?.status))cgBlockedUntil=Date.now()+180000;
  return [];
 }
}
function eligible(row,coin){
 return row?.isConnected&&coin?.id&&row.dataset.coin===coin.id&&
  document.documentElement.dataset.marketMode==='list';
}
function schedule(coin,row){
 if(!eligible(row,coin))return;
 checkCurrency();
 const key=currentKey(coin),cached=prices.get(key),now=Date.now();
 if(cached&&now<cached.until)return;
 if(pending.has(key)||queue.some(job=>job.key===key))return;
 const hasSeven=sevenDay(coin,now).length>=2;
 const pair=pairFor(coin);
 // The on-feed 1D and 1W history is immediately usable. Fetch a more
 // detailed pair history when one is verified and the coin is on screen.
 if(!pair&&(frame==='1d'||frame==='1w')&&hasSeven)return;
 queue.push({coin,key,frame,pair,currency:currencyKey});
 pump();
}
function pump(){
 while(active<2&&queue.length){
  const index=queue.findIndex(job=>job.pair||Date.now()>=cgAfter);
  if(index<0){
   const wait=Math.max(100,cgAfter-Date.now());
   setTimeout(pump,Math.min(wait,7000));return;
  }
  const job=queue.splice(index,1)[0];
  if(pending.has(job.key))continue;
  pending.add(job.key);active++;
  if(!job.pair)cgAfter=Date.now()+6500;
  loadHistory(job.coin,job.frame,job.pair).then(data=>{
   if(!Array.isArray(data))return;
   const ttl=data.length>=2?SETTINGS[job.frame].ttl:Math.max(180000,SETTINGS[job.frame].ttl/2);
   if(prices.size>650)prices.delete(prices.keys().next().value);
   prices.set(job.key,{values:data,until:Date.now()+ttl});
  }).catch(()=>{}).finally(()=>{
   pending.delete(job.key);active--;pump();
   if(job.currency!==currencyKey||job.frame!==frame)return;
   const coins=new Map((api()?.getCoins?.()||[]).map(c=>[c.id,c]));
   document.querySelectorAll('#marketProRows .mp-row[data-coin]').forEach(row=>{
    if(row.dataset.coin===job.coin.id)paintRow(row,coins.get(job.coin.id));
   });
  });
 }
}
function onRowsRendered(){
 const container=document.getElementById('marketProRows');
 if(!container||!SPANS[frame])return;
 if(observer){observer.disconnect();observer=null}
 const rows=[...container.querySelectorAll('.mp-row[data-coin]')];
 if(typeof IntersectionObserver==='function'){
  observer=new IntersectionObserver(entries=>{
   const coins=new Map((api()?.getCoins?.()||[]).map(c=>[c.id,c]));
   for(const e of entries){
    if(!e.isIntersecting)continue;
    const row=e.target,coin=coins.get(row.dataset.coin);
    if(coin)schedule(coin,row);
   }
  },{root:null,rootMargin:'250px 0px',threshold:0});
  rows.forEach(row=>observer.observe(row));
 }else{
  const coins=new Map((api()?.getCoins?.()||[]).map(c=>[c.id,c]));
  rows.slice(0,12).forEach(row=>schedule(coins.get(row.dataset.coin),row));
 }
}
function repaint(){
 if(document.hidden||document.documentElement.dataset.marketMode==='heatmap')return;
 const coins=new Map((api()?.getCoins?.()||[]).map(c=>[c.id,c]));
 const now=Date.now();
 for(const row of document.querySelectorAll('#marketProRows .mp-row[data-coin]')){
  const coin=coins.get(row.dataset.coin);
  if(coin)paintRow(row,coin,now);
 }
}
function updateButtons(){
 const panel=document.getElementById('injCryptoChartTimeframe');
 if(!panel)return;
 panel.querySelectorAll('[data-crypto-chart-frame]').forEach(button=>{
  const selected=button.dataset.cryptoChartFrame===frame;
  button.setAttribute('aria-pressed',String(selected));
 });
 panel.setAttribute('aria-label',(document.documentElement.lang==='en'?'Chart timeframe':'Timeframe grafici')+' · '+frame.toUpperCase());
}
function setFrame(next){
 if(!Object.hasOwn(SPANS,next)||next===frame)return;
 frame=next;
 try{localStorage.setItem(KEY,frame)}catch(_){}
 updateButtons();
 repaint();onRowsRendered();
}
function tick(coin,slot){
 sample(coin);
 if(!slot)return;
 const row=slot.closest('.mp-row');
 if(row)paintRow(row,coin);
}
window.INJ_DAY_CHART={render,tick,repaint,onRowsRendered,getFrame,setFrame,percentHtml,paintPercent};
document.getElementById('injCryptoChartTimeframe')?.addEventListener('click',event=>{
 const button=event.target.closest('[data-crypto-chart-frame]');
 if(button)setFrame(button.dataset.cryptoChartFrame);
});
updateButtons();
setInterval(()=>{if(!document.hidden)repaint()},45000);
window.addEventListener('pageshow',()=>{repaint();onRowsRendered()});
window.addEventListener('injnode:binance-pairs-ready',onRowsRendered);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){repaint();onRowsRendered()}});
})();
