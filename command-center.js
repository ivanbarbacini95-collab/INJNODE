'use strict';

// v15.98.53 — Full package: Price Tick, full live derived data and per-timeframe percentage badges.
// v15.98.53 — Price Tick + full live derived data updates.
// v15.98.51 — Desktop Fit: dense OHLC candles + adaptive wide-screen layout.
// v15.98.50 — Command Center candlesticks + denser wide-screen layout.
// v15.98.48 — INJ Node Command Center. Dedicated wide-screen monitor surface.
const $ = id => document.getElementById(id);
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const INJ_DECIMALS = 1e18;
const LCD_ENDPOINTS = ['https://sentry.lcd.injective.network:443','https://lcd.injective.network','https://1rpc.io/inj-lcd'];
const APR_ENDPOINT = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
const privacy = localStorage.getItem('inj_monitor_privacy') === '1';
const currency = localStorage.getItem('inj_monitor_currency') === 'EUR' ? 'EUR' : 'USD';
const ranges = {
  m5:{ms:5*60_000,bucket:5_000,source:'s1',canvas:'ccCanvas5m',card:'.cc-chart-5m',ids:['cc5Top','cc5Mid','cc5Bottom','cc5Marker'],changeId:'cc5Change',minSpan:.00007,maxCandles:60},
  m10:{ms:10*60_000,bucket:10_000,source:'s1',canvas:'ccCanvas10m',card:'.cc-chart-10m',ids:['cc10Top','cc10Mid','cc10Bottom','cc10Marker'],changeId:'cc10Change',minSpan:.00010,maxCandles:60},
  h1:{ms:HOUR,bucket:60_000,source:'m1',canvas:'ccCanvas1h',card:'.cc-chart-1h',ids:['cc1hTop','cc1hMid','cc1hBottom','cc1hMarker'],changeId:'cc1hChange',minSpan:.00022,maxCandles:60},
  d1:{ms:DAY,bucket:30*60_000,source:'m30',canvas:'ccCanvas1d',card:'.cc-chart-1d',ids:['cc1dTop','cc1dMid','cc1dBottom','cc1dMarker'],changeId:'cc1dChange',minSpan:.0013,maxCandles:48},
  w1:{ms:7*DAY,bucket:4*HOUR,source:'h4',canvas:'ccCanvas1w',card:'.cc-chart-1w',ids:['cc1wTop','cc1wMid','cc1wBottom','cc1wMarker'],changeId:'cc1wChange',minSpan:.0030,maxCandles:42}
};
const state = {
  address:'',walletLabel:'Wallet',available:0,staked:0,rewards:0,total:0,apr:0,networkApr:0,commission:0,validators:[],avgPrice:0,
  price:0,target:0,visual:0,open24:0,low24:0,high24:0,change24:0,eur:1,
  series:{s1:[],m1:[],m30:[],h4:[]},scales:{},ws:null,reconnect:0,raf:0,lastFrame:0,lastDraw:0,lastSync:0,apiOk:false,marketOk:false,stopped:false,lastMarketTick:0,lastTickDir:0
};
Object.keys(ranges).forEach(k=>state.scales[k]=null);

const n=v=>Number.isFinite(Number(v))?Number(v):0;
const fromWei=v=>n(v)/INJ_DECIMALS;
const rate=v=>{const x=n(v);return x>1?x/INJ_DECIMALS:x};
const validAddress=v=>/^inj1[0-9a-z]{35,55}$/i.test(String(v||''));
const shortAddress=v=>v?`${v.slice(0,8)}…${v.slice(-6)}`:'—';
function fmtInj(v,d=4){return n(v).toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d})+' INJ'}
function priceText(v){return v>0?'$'+v.toLocaleString('en-US',{minimumFractionDigits:v<10?4:3,maximumFractionDigits:v<10?4:3}):'—'}
function money(v,d=2){const x=n(v)*(currency==='EUR'?state.eur:1);return new Intl.NumberFormat('it-IT',{style:'currency',currency,minimumFractionDigits:d,maximumFractionDigits:d}).format(x)}
function pct(v,d=2){const x=n(v);return `${x>0?'+':''}${x.toFixed(d)}%`}
function setText(id,text){const el=$(id);if(el&&el.textContent!==text)el.textContent=text}
function pulseLiveValue(id){const el=$(id);if(!el)return;el.classList.remove('cc-value-tick');void el.offsetWidth;el.classList.add('cc-value-tick')}
function setDot(id,mode){const el=$(id);if(!el)return;el.classList.toggle('ok',mode==='ok');el.classList.toggle('bad',mode==='bad')}
function applyPrivacy(){if(!privacy)return;document.querySelectorAll('.private').forEach(el=>el.classList.add('privacy-on'))}
async function fetchJson(url,timeout=8000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw new Error(String(r.status));return await r.json()}finally{clearTimeout(t)}}
async function lcd(path){let err;for(const base of LCD_ENDPOINTS){try{const data=await fetchJson(base+path,7500);state.apiOk=true;return data}catch(e){err=e}}state.apiOk=false;throw err||new Error('lcd')}
function findInj(coins=[]){const c=coins.find(x=>x?.denom==='inj');return c?fromWei(c.amount):0}
function rewardTotal(data){return (data?.total||[]).filter(x=>x?.denom==='inj').reduce((s,x)=>s+fromWei(x.amount),0)}
function delegationRows(data){return (data?.delegation_responses||[]).map(r=>({operator:r?.delegation?.validator_address||'',amount:fromWei(r?.balance?.amount)})).filter(r=>r.operator&&r.amount>0)}
function loadLocal(){
  try{const wallets=JSON.parse(localStorage.getItem('inj_monitor_wallets_v1')||'[]');state.address=(localStorage.getItem('inj_monitor_address')||'').toLowerCase();const w=Array.isArray(wallets)?wallets.find(x=>x.address===state.address):null;if(w?.label)state.walletLabel=w.label}catch(_){}
  try{const s=JSON.parse(localStorage.getItem('inj_monitor_summaries_v1')||'{}')[state.address]||{};state.available=n(s.available);state.staked=n(s.staked);state.rewards=n(s.rewards);state.total=n(s.total)||(state.available+state.staked+state.rewards);state.apr=n(s.personalApr);state.networkApr=n(s.networkApr);state.commission=n(s.weightedCommission);state.validators=Array.isArray(s.validators)?s.validators:[];state.lastSync=n(s.updated)}catch(_){}
  try{const a=JSON.parse(localStorage.getItem('inj_monitor_average_buy_price_v1')||'{}');state.avgPrice=n(a[state.address])}catch(_){}
}
async function loadFx(){if(currency!=='EUR')return;try{const d=await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR',5000);if(n(d?.rates?.EUR)>0)state.eur=n(d.rates.EUR)}catch(_){}}
async function refreshWallet(){if(!validAddress(state.address)){renderWallet();return}setText('ccWalletState','SYNC');setDot('ccDataDot','');try{
  const [bank,deleg,reward,aprRaw]=await Promise.all([lcd(`/cosmos/bank/v1beta1/balances/${state.address}`),lcd(`/cosmos/staking/v1beta1/delegations/${state.address}`),lcd(`/cosmos/distribution/v1beta1/delegators/${state.address}/rewards`),fetchJson(APR_ENDPOINT,6500).catch(()=>null)]);
  state.available=findInj(bank?.balances||[]);const rows=delegationRows(deleg);state.staked=rows.reduce((s,r)=>s+r.amount,0);state.rewards=rewardTotal(reward);state.total=state.available+state.staked+state.rewards;const official=n(aprRaw?.apr);state.networkApr=official>0?(official<1?official*100:official):state.networkApr;
  const validators=await Promise.all(rows.slice(0,8).map(async row=>{try{const d=await lcd(`/cosmos/staking/v1beta1/validators/${row.operator}`);const v=d?.validator||{};return {...row,moniker:v?.description?.moniker||shortAddress(row.operator),commission:Math.max(0,Math.min(1,rate(v?.commission?.commission_rates?.rate))),status:v?.status||'',jailed:Boolean(v?.jailed)}}catch(_){return {...row,moniker:shortAddress(row.operator),commission:0,status:'',jailed:false}}}));
  state.validators=validators;const delegated=validators.reduce((s,r)=>s+r.amount,0);state.commission=delegated>0?validators.reduce((s,r)=>s+r.amount*n(r.commission),0)/delegated:0;const annual=validators.reduce((s,r)=>s+r.amount*state.networkApr*Math.max(0,1-n(r.commission))/100,0);state.apr=state.staked>0?annual/state.staked*100:state.apr;state.lastSync=Date.now();state.apiOk=true;setText('ccWalletState','ONLINE');setDot('ccDataDot','ok');setText('ccApiState','ONLINE');setDot('ccApiDot','ok');
  try{const all=JSON.parse(localStorage.getItem('inj_monitor_summaries_v1')||'{}');all[state.address]={...(all[state.address]||{}),available:state.available,staked:state.staked,rewards:state.rewards,total:state.total,personalApr:state.apr,networkApr:state.networkApr,weightedCommission:state.commission,validators:state.validators,updated:state.lastSync};localStorage.setItem('inj_monitor_summaries_v1',JSON.stringify(all))}catch(_){}
}catch(_){setText('ccWalletState','CACHE');setDot('ccDataDot','bad');setText('ccApiState','RETRY');setDot('ccApiDot','bad')}renderWallet();renderValidators();renderSystem()}
async function fetchKlines(interval,limit){
  const d=await fetchJson(`https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=${interval}&limit=${limit}`,9000);
  return d.map(r=>({t:n(r[0]),o:n(r[1]),h:n(r[2]),l:n(r[3]),c:n(r[4])})).filter(r=>r.o>0&&r.h>0&&r.l>0&&r.c>0);
}
async function loadMarketHistory(){
  try{
    const [s1,m1,m30,h4,ticker]=await Promise.all([
      fetchKlines('1s',650),
      fetchKlines('1m',65),
      fetchKlines('30m',50),
      fetchKlines('4h',44),
      fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT',7000)
    ]);
    state.series.s1=s1;state.series.m1=m1;state.series.m30=m30;state.series.h4=h4;
    state.price=n(ticker?.lastPrice)||s1.at(-1)?.c||m1.at(-1)?.c||0;
    state.target=state.price;state.visual=state.price;
    state.open24=n(ticker?.openPrice);state.low24=n(ticker?.lowPrice);state.high24=n(ticker?.highPrice);state.change24=n(ticker?.priceChangePercent);
    state.marketOk=true;renderAll();
  }catch(_){
    // Graceful fallback: longer histories still keep the Command Center usable.
    try{
      const [m1,m30,h4,ticker]=await Promise.all([
        fetchKlines('1m',65),fetchKlines('30m',50),fetchKlines('4h',44),
        fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT',7000)
      ]);
      state.series.m1=m1;state.series.m30=m30;state.series.h4=h4;
      const fallback=[];
      for(const row of m1.slice(-11)){
        const step=10_000;
        for(let t=row.t;t<row.t+60_000;t+=step)fallback.push({t,o:row.o,h:row.h,l:row.l,c:row.c});
      }
      state.series.s1=fallback;
      state.price=n(ticker?.lastPrice)||m1.at(-1)?.c||0;state.target=state.price;state.visual=state.price;
      state.open24=n(ticker?.openPrice);state.low24=n(ticker?.lowPrice);state.high24=n(ticker?.highPrice);state.change24=n(ticker?.priceChangePercent);
      state.marketOk=true;renderAll();
    }catch(__){state.marketOk=false;renderSystem()}
  }
}
function updateLiveCandle(source,bucket,p,t=Date.now()){
  const list=state.series[source];if(!Array.isArray(list)||!(p>0))return;
  const bucketStart=Math.floor(t/bucket)*bucket;
  let last=list.at(-1);
  if(!last||last.t!==bucketStart){const seed=last?.c||p;last={t:bucketStart,o:seed,h:Math.max(seed,p),l:Math.min(seed,p),c:p};list.push(last)}
  else{last.h=Math.max(last.h,p);last.l=Math.min(last.l,p);last.c=p}
  const keep=source==='s1'?720:source==='m1'?75:source==='m30'?54:48;
  if(list.length>keep)list.splice(0,list.length-keep);
}
function addTick(p,t=Date.now()){
  if(!(p>0))return;state.price=p;state.target=p;
  updateLiveCandle('s1',1_000,p,t);updateLiveCandle('m1',60_000,p,t);updateLiveCandle('m30',30*60_000,p,t);updateLiveCandle('h4',4*HOUR,p,t);
}
function connectMarket(){if(state.stopped||document.hidden)return;clearTimeout(state.reconnect);try{const ws=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@miniTicker');state.ws=ws;ws.onopen=()=>{state.marketOk=true;setText('ccMarketState','ONLINE');setDot('ccMarketDot','ok');$('ccConnection')?.classList.remove('offline')};ws.onmessage=e=>{try{const d=JSON.parse(e.data),p=n(d.c);if(p>0){addTick(p);state.open24=n(d.o)||state.open24;state.high24=n(d.h)||state.high24;state.low24=n(d.l)||state.low24;state.change24=state.open24>0?(p/state.open24-1)*100:state.change24;renderFast();['ccLivePrice','ccNetWorth','ccTotalPnl','ccDailyPnl','ccDailyRewardUsd','ccPulseRewardUsd'].forEach(pulseLiveValue)}}catch(_){}};ws.onclose=()=>{if(state.ws===ws)state.ws=null;state.marketOk=false;setText('ccMarketState','RECONNECT');setDot('ccMarketDot','bad');state.reconnect=setTimeout(connectMarket,1800)};ws.onerror=()=>{}}catch(_){state.marketOk=false;state.reconnect=setTimeout(connectMarket,2200)}}
function chartSource(key){const cfg=ranges[key];return cfg?state.series[cfg.source]||[]:[]}
function buildCandles(rows,start,bucketMs,now,lastPrice,maxCandles){
  const alignedStart=Math.floor(start/bucketMs)*bucketMs;
  const map=new Map();
  for(const row of rows){
    if(!row||!(row.c>0)||row.t<alignedStart-bucketMs||row.t>now)continue;
    const bt=Math.floor(row.t/bucketMs)*bucketMs;
    let c=map.get(bt);
    if(!c){c={t:bt,o:row.o||row.c,h:row.h||row.c,l:row.l||row.c,c:row.c};map.set(bt,c)}
    else{c.h=Math.max(c.h,row.h||row.c);c.l=Math.min(c.l,row.l||row.c);c.c=row.c}
  }
  const currentStart=Math.floor(now/bucketMs)*bucketMs;
  const candles=[];let prev=0;
  for(let t=alignedStart;t<=currentStart;t+=bucketMs){
    let c=map.get(t);
    if(!c){const seed=prev||lastPrice;c={t,o:seed,h:seed,l:seed,c:seed}}
    prev=c.c;candles.push(c);
  }
  let last=candles.at(-1);
  if(last){last.h=Math.max(last.h,lastPrice);last.l=Math.min(last.l,lastPrice);last.c=lastPrice}
  return candles.length>maxCandles?candles.slice(-maxCandles):candles;
}
function candleY(price,min,span,bottom,ph){return bottom-Math.max(0,Math.min(1,(price-min)/span))*ph}
function chartColor(card,dir){card.classList.remove('up','down','neutral');card.classList.add(dir>0?'up':dir<0?'down':'neutral');const cs=getComputedStyle(document.documentElement);return cs.getPropertyValue(dir>0?'--up':dir<0?'--down':'--accent').trim()}
function hexAlpha(hex,a){const h=String(hex||'').trim();if(/^#[0-9a-f]{6}$/i.test(h)){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return `rgba(${r},${g},${b},${a})`}return h}
function resizeCanvas(c){const r=c.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.65),w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(c.width!==w||c.height!==h){c.width=w;c.height=h;c._dpr=dpr}return {w:r.width,h:r.height,dpr}}
function updateTimeframeChange(cfg,openPrice,currentPrice){
  const el=$(cfg.changeId); if(!el) return;
  const value=openPrice>0&&currentPrice>0?((currentPrice/openPrice)-1)*100:NaN;
  if(!Number.isFinite(value)){el.textContent='—';el.className='neutral';return;}
  el.textContent=`${value>0?'+':''}${value.toFixed(2)}%`;
  el.className=value>0?'positive':value<0?'negative':'neutral';
}
function drawChart(key,now,dt){
  const cfg=ranges[key],c=$(cfg.canvas),card=document.querySelector(cfg.card);
  if(!c||!card||!(state.visual>0))return;
  const src=chartSource(key),start=now-cfg.ms;
  const rows=src.filter(r=>r&&r.t<=now&&r.t>=start-cfg.bucket&&r.c>0);
  const candles=buildCandles(rows,start,cfg.bucket,now,state.visual,cfg.maxCandles);
  const allPrices=candles.flatMap(c=>[c.h,c.l]);
  let min=Math.min(...allPrices),max=Math.max(...allPrices);
  const floor=Math.max(state.visual*cfg.minSpan,state.visual<10?.00005:.0005);
  let span=max-min;
  if(span<floor){const mid=(max+min)/2;min=mid-floor/2;max=mid+floor/2;span=floor}
  const tmin=min-span*.12,tmax=max+span*.12;
  let sc=state.scales[key];
  if(!sc)sc=state.scales[key]={min:tmin,max:tmax};
  else{const aE=1-Math.exp(-dt/160),aR=1-Math.exp(-dt/3400);sc.min+=(tmin-sc.min)*(tmin<sc.min?aE:aR);sc.max+=(tmax-sc.max)*(tmax>sc.max?aE:aR)}
  min=sc.min;max=sc.max;span=Math.max(max-min,floor);
  const {w,h,dpr}=resizeCanvas(c),ctx=c.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const left=8,right=w-6,top=7,bottom=h-8,ph=bottom-top,pw=right-left;
  const overallDir=Math.abs((candles.at(-1)?.c||state.visual)-(candles[0]?.o||state.visual))<Math.max(state.visual*.000012,.000002)?0:Math.sign((candles.at(-1)?.c||state.visual)-(candles[0]?.o||state.visual));
  updateTimeframeChange(cfg,candles[0]?.o||state.visual,state.visual);
  const markerColor=chartColor(card,overallDir);

  ctx.lineWidth=1;
  ctx.strokeStyle='rgba(135,165,205,.06)';
  [0,.25,.5,.75,1].forEach((f,idx)=>{ if(idx===0||idx===4) return; const y=top+ph*f; ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke(); });
  ctx.strokeStyle='rgba(135,165,205,.03)';
  [1/3,2/3].forEach(f=>{const x=left+pw*f;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke()});

  const candleCount=Math.max(1,candles.length);
  const stepX=pw/candleCount;
  const bodyW=Math.max(3.5,Math.min(16,stepX*0.58));
  let lastX=left, lastY=bottom;
  for(let idx=0; idx<candles.length; idx++){
    const candle=candles[idx];
    const x=left + (idx + 0.5) * stepX;
    const yo=candleY(candle.o,min,span,bottom,ph);
    const yc=candleY(candle.c,min,span,bottom,ph);
    const yh=candleY(candle.h,min,span,bottom,ph);
    const yl=candleY(candle.l,min,span,bottom,ph);
    const up = candle.c >= candle.o;
    const down = candle.c < candle.o;
    const bodyColor = getComputedStyle(document.documentElement).getPropertyValue(up?'--up':down?'--down':'--accent').trim() || markerColor;
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = Math.max(1.15, bodyW*0.12);
    ctx.beginPath();
    ctx.moveTo(x, yh);
    ctx.lineTo(x, yl);
    ctx.stroke();

    const bodyTop=Math.min(yo,yc), bodyBottom=Math.max(yo,yc);
    const bodyH=Math.max(2.2, bodyBottom-bodyTop);
    ctx.fillStyle = hexAlpha(bodyColor, up ? 0.2 : 0.16);
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.rect(x-bodyW/2, bodyTop, bodyW, bodyH);
    ctx.fill();
    ctx.stroke();
    lastX=x; lastY=yc;
  }

  // Price Tick: compact live marker instead of a pulsing dot.
  const tickFresh=Math.max(0,1-(now-state.lastMarketTick)/650);
  const tickDir=state.lastTickDir||overallDir;
  const tickColor=getComputedStyle(document.documentElement).getPropertyValue(tickDir>0?'--up':tickDir<0?'--down':'--accent').trim()||markerColor;
  const tickStart=Math.min(right-28,lastX+Math.max(5,bodyW*.55));
  const tickEnd=Math.min(right-5,tickStart+20);
  ctx.save();
  ctx.lineCap='round';
  ctx.lineWidth=2.2 + tickFresh*.8;
  ctx.strokeStyle=tickColor;
  ctx.beginPath();
  ctx.moveTo(tickStart,lastY);
  ctx.lineTo(tickEnd,lastY);
  ctx.stroke();
  ctx.lineWidth=1;
  ctx.strokeStyle=hexAlpha(tickColor,.34 + tickFresh*.20);
  ctx.beginPath();
  ctx.moveTo(tickEnd,lastY-4);
  ctx.lineTo(tickEnd,lastY+4);
  ctx.stroke();
  if(tickEnd<right-2){
    ctx.setLineDash([3,4]);
    ctx.strokeStyle=hexAlpha(tickColor,.22 + tickFresh*.12);
    ctx.beginPath();
    ctx.moveTo(tickEnd+5,lastY);
    ctx.lineTo(right,lastY);
    ctx.stroke();
  }
  ctx.restore();

  setText(cfg.ids[0],priceText(max));
  setText(cfg.ids[1],priceText((min+max)/2));
  setText(cfg.ids[2],priceText(min));
  const marker=$(cfg.ids[3]);
  if(marker){marker.textContent=priceText(state.visual);marker.style.top=Math.max(8,Math.min(92,100-(state.visual-min)/span*100))+'%'}
}
function renderWallet(){const live=state.visual||state.price;setText('ccWalletName',state.walletLabel);setText('ccWalletAddress',shortAddress(state.address));setText('ccNetWorth',live>0?money(state.total*live):'—');setText('ccTotalInj',fmtInj(state.total,4));setText('ccAvailable',fmtInj(state.available,4));setText('ccStaked',fmtInj(state.staked,4));setText('ccRewards',fmtInj(state.rewards,4));setText('ccAvgPrice',state.avgPrice>0?money(state.avgPrice):'—');const pnl=state.avgPrice>0&&live>0?(live-state.avgPrice)*state.total:0,pnlPct=state.avgPrice>0&&live>0?(live/state.avgPrice-1)*100:0;setText('ccTotalPnl',state.avgPrice>0&&live>0?money(pnl):'—');setText('ccTotalPnlPct',state.avgPrice>0&&live>0?pct(pnlPct):'—');setText('ccApr',state.apr>0?state.apr.toFixed(3)+'%':'—');setText('ccNetworkApr',state.networkApr>0?state.networkApr.toFixed(3)+'%':'—');setText('ccCommission',state.commission>0?(state.commission*100).toFixed(2)+'%':'—');const daily=state.staked>0&&state.apr>0?state.staked*state.apr/100/365:0;setText('ccDailyReward',daily>0?fmtInj(daily,6):'—');setText('ccDailyRewardUsd',daily>0&&live>0?money(daily*live):'—');setText('ccPulseRewardValue',daily>0?fmtInj(daily,6):'—');setText('ccPulseRewardUsd',daily>0&&live>0?money(daily*live):'—');setText('ccStakeRatio',state.total>0?(state.staked/state.total*100).toFixed(1)+'%':'—');setText('ccValidatorCount',`${state.validators.length||0} validator${state.validators.length===1?'':'s'}`);setText('ccFooterApr',state.apr>0?state.apr.toFixed(3)+'%':'—');setText('ccFooterReward',daily>0?daily.toFixed(6)+' INJ':'—');applyPrivacy()}
function renderValidators(){const host=$('ccValidatorList');if(!host)return;host.replaceChildren();if(!state.validators.length){const e=document.createElement('span');e.className='cc-empty';e.textContent='Nessuna delega rilevata';host.append(e);return}state.validators.slice(0,4).forEach(v=>{const row=document.createElement('div');row.className='cc-validator-row';const name=document.createElement('strong');name.textContent=v.moniker||shortAddress(v.operator);const meta=document.createElement('span');meta.textContent=`${fmtInj(v.amount,2)} · fee ${(n(v.commission)*100).toFixed(2)}%`;const status=document.createElement('b');status.textContent=v.jailed?'JAILED':(v.status&&v.status!=='BOND_STATUS_BONDED'?'CHECK':'ACTIVE');if(v.jailed)status.style.color='var(--down)';row.append(name,meta,status);host.append(row)})}
function renderMarket(){const live=state.visual||state.price;const liveChange24=state.open24>0&&live>0?(live/state.open24-1)*100:state.change24;setText('ccLivePrice',priceText(live));setText('ccChange24',live>0?`${pct(liveChange24)} · 24H`:'— · 24H');setText('ccLow24',priceText(state.low24));setText('ccHigh24',priceText(state.high24));setText('ccFooterLow',priceText(state.low24));setText('ccFooterHigh',priceText(state.high24));setText('ccSnapshot24',live>0?pct(liveChange24):'—');const span=state.high24-state.low24,pos=span>0?Math.max(0,Math.min(100,(live-state.low24)/span*100)):50;['ccRangeFill','ccFooterFill'].forEach(id=>{const e=$(id);if(e)e.style.width=pos+'%'});['ccRangeDot','ccFooterDot'].forEach(id=>{const e=$(id);if(e)e.style.left=pos+'%'});setText('ccRangePosition',pos.toFixed(1)+'%');const m1=state.series.m1||[];const oneHourStart=m1.find(r=>r.t>=Date.now()-HOUR)?.o||m1[0]?.o||live;const h1=oneHourStart>0&&live>0?(live/oneHourStart-1)*100:0;setText('ccMomentum',pct(h1));setText('ccSnapshot1h',pct(h1));const pEl=$('ccPulsePrice');pEl?.classList.remove('up','down','neutral');pEl?.classList.add(h1>0?'up':h1<0?'down':'neutral');const dailyPnl=state.open24>0&&live>0?(live-state.open24)*state.total:0,dailyPct=state.open24>0&&live>0?(live/state.open24-1)*100:0;setText('ccDailyPnl',state.open24>0?money(dailyPnl):'—');setText('ccDailyPnlPct',state.open24>0?pct(dailyPct):'—');const dEl=$('ccPulsePnl');dEl?.classList.remove('up','down','neutral','positive','negative');dEl?.classList.add(dailyPct>0?'positive':dailyPct<0?'negative':'neutral');renderWallet()}
function renderSystem(){setText('ccMarketState',state.marketOk?'ONLINE':'RECONNECT');setDot('ccMarketDot',state.marketOk?'ok':'bad');setText('ccApiState',state.apiOk?'ONLINE':'RETRY');setDot('ccApiDot',state.apiOk?'ok':'bad');setText('ccLastSync',state.lastSync?new Date(state.lastSync).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—');const ok=state.marketOk&&state.apiOk;setText('ccSystemOverall',ok?'OK':'CHECK');setText('ccFooterSystem',`SYSTEM · ${ok?'OK':'CHECK'}`);setText('ccFooterLive',state.marketOk?'LIVE':'RECONNECT');const conn=$('ccConnection');if(conn){conn.classList.toggle('offline',!state.marketOk)}}
function renderFast(){renderMarket();renderSystem()}
function renderAll(){renderWallet();renderValidators();renderMarket();renderSystem()}
function frame(ts){state.raf=0;if(state.stopped||document.hidden)return;const dt=Math.max(8,Math.min(120,ts-(state.lastFrame||ts-50)));state.lastFrame=ts;if(state.target>0){if(!(state.visual>0))state.visual=state.target;const delta=state.target-state.visual;state.visual+=delta*(1-Math.exp(-dt/125));if(Math.abs(delta)<.0000005)state.visual=state.target}if(ts-state.lastDraw>80&&state.visual>0){state.lastDraw=ts;const now=Date.now();Object.keys(ranges).forEach(k=>drawChart(k,now,dt));renderMarket()}state.raf=requestAnimationFrame(frame)}
function start(){if(!state.raf&&!document.hidden&&!state.stopped)state.raf=requestAnimationFrame(frame)}
function stop(){state.stopped=true;if(state.raf)cancelAnimationFrame(state.raf);clearTimeout(state.reconnect);try{state.ws?.close()}catch(_){}state.ws=null}
function clock(){setText('ccClock',new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))}
$('ccBack')?.addEventListener('click',()=>{stop();if(history.length>1)history.back();else location.href='./index.html'});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;try{state.ws?.close()}catch(_){}}else if(!state.stopped){start();connectMarket()}});
window.addEventListener('resize',()=>Object.values(ranges).forEach(cfg=>{const c=$(cfg.canvas);if(c){c.width=0;c.height=0}}),{passive:true});
loadLocal();applyPrivacy();renderAll();clock();setInterval(clock,1000);setInterval(()=>{if(!document.hidden)refreshWallet()},60000);Promise.allSettled([loadFx(),loadMarketHistory()]).then(()=>{renderAll();start();connectMarket()});refreshWallet();
