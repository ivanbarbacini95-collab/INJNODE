/* INJ Node · Market Pro v16.01.08
   Per-asset chart controls. Binance 1m close series for available USDT pairs;
   CoinGecko fallback only at the historical sample frequency actually supplied.
   Streaming tick updates move the rightmost point; historical bars refresh
   on a bounded interval without fabricating candles. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const modal=$('detail'),chart=$('detailChart'),buttons=$('detailRanges');
 if(!modal||!chart||!buttons)return;
 const ranges={ '1h':1,'1d':1,'7d':7,'30d':30,'90d':90,'1y':365 };
 let active=null,token=0,refresher=0,lastPaint=0;
 const english=()=>document.documentElement.lang==='en';
 const tr=(it,en)=>english()?en:it;
 const finite=v=>Number.isFinite(v);
 const val=v=>finite(v)&&v>0?v:NaN;
 const number=v=>finite(v)?new Intl.NumberFormat(english()?'en-US':'it-IT',{maximumFractionDigits:2}).format(v):'—';
 const formatTime=(stamp,range)=>{
  const opts=range==='1h'||range==='1d'?{hour:'2-digit',minute:'2-digit'}:
   range==='7d'?{weekday:'short',day:'2-digit',hour:'2-digit'}:
   {day:'2-digit',month:'short',year:range==='1y'?'2-digit':undefined};
  return new Intl.DateTimeFormat(english()?'en-US':'it-IT',opts).format(new Date(stamp));
 };
 function updateTabs(){
  buttons.querySelectorAll('[data-detail-range]').forEach(b=>{
   const current=b.dataset.detailRange===active?.range;
   b.classList.toggle('active',current);b.setAttribute('aria-pressed',String(current));
  });
 }
 function renderPrimary(){
  if(!active||!modal.open)return;
  const {coin,helpers}=active;
  $('detailName').textContent=coin.name+' ('+coin.symbol.toUpperCase()+')';
  $('detailPrice').textContent=helpers.money(coin.current_price);
  const percent=helpers.change(coin,'24h');
  const ch=$('detailChange');ch.className='detail-change '+helpers.tone(percent);
  ch.textContent=helpers.pct(percent)+' · 24H';
  $('detailInfo').textContent=tr('Dati asset CoinGecko · Prezzo aggiornato quando disponibile','CoinGecko asset data · Price updates where supported');
  const icon=$('detailIcon');if(!icon.firstElementChild||icon.dataset.id!==coin.id){
   icon.dataset.id=coin.id;icon.replaceChildren();
   const img=document.createElement('img');img.src=coin.image||'';img.alt='';
   img.loading='lazy';img.referrerPolicy='no-referrer';icon.append(img);
  }
  const stats=[
   [tr('Capitalizzazione','Market cap'),helpers.money(coin.market_cap,true)],
   [tr('Volume 24H','24H volume'),helpers.money(coin.total_volume,true)],
   ['1H',helpers.pct(helpers.change(coin,'1h')),helpers.tone(helpers.change(coin,'1h'))],
   ['24H',helpers.pct(helpers.change(coin,'24h')),helpers.tone(helpers.change(coin,'24h'))],
   ['7D',helpers.pct(helpers.change(coin,'7d')),helpers.tone(helpers.change(coin,'7d'))],
   ['30D',helpers.pct(helpers.change(coin,'30d')),helpers.tone(helpers.change(coin,'30d'))],
   [tr('Rank','Rank'),finite(coin.market_cap_rank)?'#'+number(coin.market_cap_rank):'—'],
   [tr('Offerta circolante','Circulating supply'),number(coin.circulating_supply)+' '+coin.symbol.toUpperCase()],
   [tr('Offerta massima','Max supply'),finite(coin.max_supply)?number(coin.max_supply)+' '+coin.symbol.toUpperCase():'—'],
   ['FDV',helpers.money(coin.fully_diluted_valuation,true)],
   ['ATH',helpers.money(coin.ath)],
   ['ATL',helpers.money(coin.atl)]
  ];
  const host=$('detailStats'),frag=document.createDocumentFragment();
  for(const [label,display,tone] of stats){
   const a=document.createElement('article'),small=document.createElement('small'),strong=document.createElement('strong');
   small.textContent=label;strong.textContent=display;
   if(tone)strong.className=tone;
   a.append(small,strong);frag.append(a);
  }
  host.replaceChildren(frag);
 }
 function clearTimer(){if(refresher){clearInterval(refresher);refresher=0}}
 function setStatus(str){const el=$('detailStatus');if(el)el.textContent=str}
 function draw(points,range){
  const data=points.filter(x=>finite(x.t)&&finite(x.v)&&x.v>0).sort((a,b)=>a.t-b.t);
  if(data.length<2){chart.textContent=tr('Punti insufficienti per il periodo','Not enough data points for this period');return}
  // Bound DOM complexity for charts spanning months or years.
  const stride=Math.max(1,Math.ceil(data.length/180));
  const sample=data.filter((_,i)=>i%stride===0||i===data.length-1);
  const W=660,H=218,left=12,right=647,top=19,bottom=195;
  const lo=Math.min(...sample.map(v=>v.v)),hi=Math.max(...sample.map(v=>v.v));
  const pad=(hi-lo||Math.abs(lo)*.001||1)*.10;
  const min=lo-pad,max=hi+pad,from=sample[0].t,to=sample.at(-1).t;
  const x=t=>left+(t-from)/(to-from||1)*(right-left);
  const y=v=>bottom-(v-min)/(max-min||1)*(bottom-top);
  const line=sample.map((pt,i)=>(i?'L':'M')+x(pt.t).toFixed(2)+' '+y(pt.v).toFixed(2)).join(' ');
  const last=sample.at(-1);
  const rising=last.v>=sample[0].v;
  const ink=rising?'var(--positive,#31d99c)':'var(--negative,#fa6b84)';
  const fill=rising?'rgba(49,217,156,.13)':'rgba(250,107,132,.13)';
  const area=line+' L'+x(last.t).toFixed(2)+' '+bottom+' L'+left+' '+bottom+' Z';
  const grid=[.2,.5,.8].map(f=>'<line x1="'+left+'" x2="'+right+'" y1="'+(top+(bottom-top)*f).toFixed(1)+'" y2="'+(top+(bottom-top)*f).toFixed(1)+'" stroke="var(--line)" opacity=".65"/>').join('');
  chart.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'+grid+
   '<path d="'+area+'" fill="'+fill+'"/>'+
   '<path d="'+line+'" stroke="'+ink+'" fill="none" stroke-width="2.7" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>'+
   '<circle cx="'+x(last.t).toFixed(2)+'" cy="'+y(last.v).toFixed(2)+'" r="4.5" fill="'+ink+'" stroke="var(--bg)" stroke-width="2"/>'+
   '</svg>';
  $('detailChartStart').textContent=formatTime(from,range);
  $('detailChartEnd').textContent=formatTime(to,range);
 }
 async function binance1h(signal){
  if(!active?.helpers.canStream||active.helpers.currency!=='usd'&&active.helpers.currency!=='eur')throw Error('Unsupported market pair');
  const sym=String(active.coin.symbol||'').toUpperCase();
  if(!/^[A-Z0-9]{2,15}$/.test(sym))throw Error('Unsupported symbol');
  const url='https://data-api.binance.vision/api/v3/klines?symbol='+encodeURIComponent(sym+'USDT')+'&interval=1m&limit=65';
  const res=await fetch(url,{cache:'no-store',signal});
  if(!res.ok)throw Error('Binance HTTP '+res.status);
  const raw=await res.json();
  if(!Array.isArray(raw)||raw.length<3)throw Error('No 1m candles');
  const values=raw.map(k=>({t:Number(k[0]),v:Number(k[4])})).filter(v=>finite(v.t)&&finite(v.v)&&v.v>0);
  if(values.length<3)throw Error('Invalid market candles');
  const recent=values.filter(v=>v.t>=Date.now()-3600000);
  if(recent.length<3)throw Error('No recent 1m candles');
  // Binance candles quote USDT. Market list may be in EUR; scale to the
  // current CoinGecko/stream spot for a consistent display currency.
  const close=recent.at(-1).v;
  const market=Number(active.coin.current_price);
  const ratio=market>0&&close>0?market/close:1;
  return recent.map(pt=>({t:pt.t,v:pt.v*ratio}));
 }
 async function getSeries(range,signal){
  if(range==='1h'){
   try{
    const data=await binance1h(signal);
    return {data,provider:tr('Binance · candele reali 1m · flusso prezzo quando disponibile','Binance · real 1m candles · price stream where available')};
   }catch(_){/* Explicit fallback below; never fabricate candles. */}
  }
  const days=ranges[range];
  const {helpers,coin}=active;
  const url=helpers.API+'/coins/'+encodeURIComponent(coin.id)+'/market_chart?vs_currency='+helpers.currency+'&days='+days+'&precision=full';
  const response=await helpers.getJson(url,signal);
  const all=(response?.prices||[]).map(v=>({t:Number(v[0]),v:Number(v[1])})).filter(x=>finite(x.t)&&finite(x.v)&&x.v>0);
  const data=range==='1h'?all.filter(v=>v.t>=Date.now()-3600000):all;
  return {data,provider:range==='1h'?
   tr('CoinGecko · campioni nell’ultima ora, non candele 1m','CoinGecko · samples from last hour, not 1m candles'):
   tr('CoinGecko · frequenza storica determinata dalla fonte','CoinGecko · historical sampling frequency set by provider')};
 }
 async function loadChart(force=false){
  if(!active||!modal.open||document.hidden)return;
  const {range}=active,ref=active,id=++token;
  if(ref.loading&&!force)return;
  ref.loading=true;
  if(!ref.series.length)chart.textContent=tr('Caricamento grafico…','Loading chart…');
  setStatus(tr('Sincronizzazione dati reali…','Syncing real data…'));
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),13500);
  try{
   const {data,provider}=await getSeries(range,ctrl.signal);
   if(!active||active!==ref||token!==id||!modal.open)return;
   if(data.length<2)throw Error('Insufficient chart history');
   ref.series=data;ref.provider=provider;ref.lastFetch=Date.now();
   draw(data,range);setStatus(provider+' · '+new Date().toLocaleTimeString(english()?'en-US':'it-IT'));
  }catch(e){
   if(!active||active!==ref||token!==id)return;
   if(ref.series.length<2)chart.textContent=tr('Grafico non disponibile per questo periodo','Chart not available for this timeframe');
   setStatus(tr('Dati non disponibili · riprova cambiando timeframe','Data unavailable · try another timeframe'));
  }finally{clearTimeout(timer);if(active===ref)ref.loading=false}
 }
 function beginRefresh(){
  clearTimer();
  refresher=setInterval(()=>{
   if(!active||!modal.open||document.hidden)return;
   const cooldown=active.range==='1h'?60000:120000;
   if(Date.now()-active.lastFetch>=cooldown)void loadChart();
  },12000);
 }
 function open(coin,helpers){
  if(!coin||!helpers)return;
  token++;
  active={coin,helpers,range:'1h',series:[],provider:'',lastFetch:0,loading:false};
  updateTabs();
  if(!modal.open)modal.showModal();
  renderPrimary();chart.textContent='';$('detailChartStart').textContent='—';$('detailChartEnd').textContent='—';
  $('detailChartHeading').textContent=tr('GRAFICO · TIMEFRAME','CHART · TIMEFRAME');
  setStatus(tr('Preparazione grafico 1H…','Preparing 1H chart…'));
  void loadChart(true);beginRefresh();
 }
 function updateCoin(coin,helpers){
  if(!active||!coin||coin.id!==active.coin.id)return;
  const currencyChanged=helpers?.currency!==active.helpers.currency;
  active.coin=coin;if(helpers)active.helpers=helpers;
  renderPrimary();
  if(currencyChanged){active.series=[];active.lastFetch=0;void loadChart(true)}
 }
 function priceTick(coin,timestamp){
  if(!active||active.coin.id!==coin.id||!modal.open)return;
  active.coin=coin;
  if(timestamp-lastPaint>950){lastPaint=timestamp;const detail=$('detailPrice');if(detail)detail.textContent=active.helpers.money(coin.current_price);}
  if(active.range!=='1h'||!active.series.length||!active.helpers.canStream)return;
  const now=Date.now(),series=active.series;
  const last=series.at(-1);
  if(last&&now-last.t<55000)last.v=coin.current_price;
  else series.push({t:now,v:coin.current_price});
  while(series.length>2&&series[0].t<now-3600000)series.shift();
  if(now-lastPaint>1300){lastPaint=now;draw(series,'1h');}
 }
 function close(){token++;clearTimer();active=null}
 function languageChange(){
  if(!active||!modal.open)return;
  renderPrimary();
  $('detailChartHeading').textContent=tr('GRAFICO · TIMEFRAME','CHART · TIMEFRAME');
  if(active.series.length>1)draw(active.series,active.range);
 }
 buttons.addEventListener('click',e=>{
  const b=e.target.closest('[data-detail-range]');
  if(!b||!active||!ranges[b.dataset.detailRange])return;
  const next=b.dataset.detailRange;
  if(active.range===next)return;
  active.range=next;active.series=[];active.lastFetch=0;active.loading=false;
  updateTabs();$('detailChartStart').textContent='—';$('detailChartEnd').textContent='—';
  void loadChart(true);
 });
 // Scroll spotlight: one row near viewport middle breathes by ~1%; never
 // modifies page scrolling or per-card heights.
 let spotlight=null,queued=false;
 function updateSpotlight(){
  queued=false;
  if(modal.open||!matchMedia('(pointer:coarse)').matches)return;
  const el=document.elementFromPoint(Math.min(window.innerWidth*.5,window.innerWidth-20),window.innerHeight*.56);
  const row=el?.closest?.('#rows tr[data-coin]')||null;
  if(row===spotlight)return;
  spotlight?.classList.remove('in-spotlight');
  spotlight=row;
  spotlight?.classList.add('in-spotlight');
 }
 function onScroll(){if(!queued){queued=true;requestAnimationFrame(updateSpotlight)}}
 document.addEventListener('scroll',onScroll,{passive:true});
 window.addEventListener('resize',onScroll,{passive:true});
 window.addEventListener('pageshow',onScroll,{passive:true});
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&active&&modal.open&&Date.now()-active.lastFetch>60000)void loadChart();
 });
 window.MARKET_PRO={open,close,updateCoin,priceTick,languageChange};
})();
