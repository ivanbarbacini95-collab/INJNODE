/* Global Crypto: rolling, observed 24h sparkline; no fabricated prices.
 * CoinGecko 7-day sparkline has no timestamps per sample, so its final
 * 24-hour segment uses approximate sampling positions. New live samples
 * carry real observation times. The chart does not stretch 7 days into 1D. */
(()=>{
'use strict';
const DAY=86400000,observed=new Map(),historical=new Map();
let lastCurrency='';
const api=()=>window.INJ_MARKET_VIEW_API;
const good=n=>Number.isFinite(n)&&n>0;
function currency(){
 const next=api()?.getCurrency?.()||'usd';
 if(next!==lastCurrency){observed.clear();historical.clear();lastCurrency=next}
}
function sample(coin,now=Date.now()){
 if(!coin?.id||!good(coin.current_price))return;
 currency();
 const arr=observed.get(coin.id)||[];
 while(arr.length&&arr[0].t<now-DAY)arr.shift();
 const last=arr.at(-1);
 if(!last||now-last.t>30000)arr.push({t:now,v:coin.current_price});
 else if(now>=last.t){last.t=now;last.v=coin.current_price}
 if(arr.length>2000)arr.splice(0,arr.length-2000);
 observed.set(coin.id,arr);
}
function series(coin,now=Date.now()){
 currency();
 const source=coin.sparkline_in_7d?.price;
 const fetched=Number(api()?.getMarketUpdatedAt?.())||0;
 const cached=Boolean(api()?.isCached?.());
 let item=historical.get(coin.id);
 if(!item||item.source!==source||item.fetched!==fetched||item.cached!==cached){
  const history=[];
  // Only fresh real provider samples; stale cached curves must not look live.
  if(!cached&&fetched>now-3600000&&Array.isArray(source)&&source.length>=48){
   const duration=7*DAY,N=source.length;
   for(let i=0;i<N;i++){
    const v=Number(source[i]),t=fetched-duration*(N-1-i)/(N-1);
    if(good(v)&&t>=now-DAY-1800000&&t<=now)history.push({t,v});
   }
  }
  item={source,fetched,cached,history};historical.set(coin.id,item);
 }
 const since=now-DAY;
 return [...item.history,...(observed.get(coin.id)||[])]
  .filter(p=>p.t>=since&&p.t<=now&&good(p.v)).sort((a,b)=>a.t-b.t);
}
function render(coin,now=Date.now()){
 const arr=series(coin,now);
 if(arr.length<2)return '<span class="inj-1d-empty" aria-label="Storico 1D non disponibile">—</span>';
 const low=Math.min(...arr.map(p=>p.v)),high=Math.max(...arr.map(p=>p.v));
 const x=t=>Math.min(160,Math.max(0,(t-(now-DAY))/DAY*160));
 const y=v=>high>low?44-(v-low)/(high-low)*40:24;
 const path=arr.map((p,i)=>(i?'L':'M')+x(p.t).toFixed(2)+' '+y(p.v).toFixed(2)).join(' ');
 const up=arr.at(-1).v>=arr[0].v;
 const label=document.documentElement.lang==='en'?'Actual available price samples over the last 24 hours':'Campioni di prezzo disponibili nelle ultime 24 ore';
 return '<svg class="inj-1d-chart '+(up?'up':'down')+'" viewBox="0 0 160 48" preserveAspectRatio="none" role="img" aria-label="'+label+'"><path d="'+path+'"/></svg>';
}
function tick(coin,slot){
 if(document.documentElement.dataset.injMarketEntry!=='crypto')return;
 sample(coin);
 if(slot)slot.innerHTML=render(coin);
}
function repaint(){
 if(document.hidden||document.documentElement.dataset.injMarketEntry!=='crypto'||
 document.documentElement.dataset.marketSection==='heatmap')return;
 const coins=new Map((api()?.getCoins?.()||[]).map(c=>[c.id,c])),now=Date.now();
 for(const row of document.querySelectorAll('#marketProRows .mp-row[data-coin]')){
  const c=coins.get(row.dataset.coin),el=row.querySelector('.mp-chart');
  if(c&&el)el.innerHTML=render(c,now);
 }
}
window.INJ_DAY_CHART={render,tick,repaint};
setInterval(repaint,60000);
window.addEventListener('pageshow',repaint);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)repaint()});
})();