// v15.99.16 — Command Center desktop: full-width charts above, readable operating data below.
// v15.99.2 — Single-screen control room layout; chart/data engine preserved.
'use strict';

// v15.98.66 — Command Center: solid bodies, ultra-responsive trade ticks, edge-to-edge smooth flow and grow-in candles.
// v15.98.65 — Command Center: solid candle bodies + continuous small-timeframe flow.
// v15.98.61 — Command Center: true edge Price Tick; no connector line across charts.
// v15.98.61 — Full package: Price Tick, full live derived data and per-timeframe percentage badges.
// v15.98.61 — Price Tick + full live derived data updates.
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
  m1:{ms:60_000,bucket:1_000,source:'s1',canvas:'ccCanvas1m',card:'.cc-chart-1m',ids:['cc1mTop','cc1mMid','cc1mBottom','cc1mMarker'],changeId:'cc1mChange',minSpan:.000055,maxCandles:60},
  m5:{ms:5*60_000,bucket:5_000,source:'s1',canvas:'ccCanvas5m',card:'.cc-chart-5m',ids:['cc5Top','cc5Mid','cc5Bottom','cc5Marker'],changeId:'cc5Change',minSpan:.00007,maxCandles:60},
  m10:{ms:10*60_000,bucket:10_000,source:'s1',canvas:'ccCanvas10m',card:'.cc-chart-10m',ids:['cc10Top','cc10Mid','cc10Bottom','cc10Marker'],changeId:'cc10Change',minSpan:.00010,maxCandles:60},
  h1:{ms:HOUR,bucket:60_000,source:'m1',canvas:'ccCanvas1h',card:'.cc-chart-1h',ids:['cc1hTop','cc1hMid','cc1hBottom','cc1hMarker'],changeId:'cc1hChange',minSpan:.00022,maxCandles:60},
  d1:{ms:DAY,bucket:30*60_000,source:'m30',canvas:'ccCanvas1d',card:'.cc-chart-1d',ids:['cc1dTop','cc1dMid','cc1dBottom','cc1dMarker'],changeId:'cc1dChange',minSpan:.0013,maxCandles:48},
  w1:{ms:7*DAY,bucket:4*HOUR,source:'h4',canvas:'ccCanvas1w',card:'.cc-chart-1w',ids:['cc1wTop','cc1wMid','cc1wBottom','cc1wMarker'],changeId:'cc1wChange',minSpan:.0030,maxCandles:42}
};
const state = {
  address:'',walletLabel:'Wallet',available:0,staked:0,rewards:0,total:0,apr:0,networkApr:0,commission:0,validators:[],avgPrice:0,
  price:0,target:0,visual:0,open24:0,low24:0,high24:0,change24:0,eur:1,
  series:{s1:[],m1:[],m30:[],h4:[]},scales:{},ws:null,reconnect:0,wsGeneration:0,raf:0,lastFrame:0,lastDraw:0,lastSync:0,apiOk:false,marketOk:false,stopped:false,lastMarketTick:0,lastTickDir:0,chartEnterAt:0,walletLoading:false,validatorMeta:{},validatorSyncAt:0,aprSyncAt:0
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
function ccNumberRollGroups(text){const value=String(text??''),groups=[],regex=/\d[\d.,]*/g;let m;while((m=regex.exec(value)))groups.push({text:m[0],start:m.index,end:m.index+m[0].length});return groups;}
function ccAppendStableGroup(parent,group){for(const char of Array.from(String(group||''))){if(/\d/.test(char)){const d=document.createElement('span');d.className='number-roll-static-digit';d.textContent=char;parent.append(d);}else parent.append(document.createTextNode(char));}}
function ccRenderStable(element,text){const value=String(text??''),groups=ccNumberRollGroups(value);if(!groups.length){element.textContent=value;return;}const shell=document.createElement('span');shell.className='number-roll-text';shell.setAttribute('aria-label',value);let cursor=0;for(const group of groups){if(group.start>cursor)shell.append(document.createTextNode(value.slice(cursor,group.start)));ccAppendStableGroup(shell,group.text);cursor=group.end;}if(cursor<value.length)shell.append(document.createTextNode(value.slice(cursor)));element.replaceChildren(shell);}
function ccAppendRollingGroup(parent,oldGroup,newGroup,direction){const oldDigits=Array.from(String(oldGroup||'')).filter(c=>/\d/.test(c)),chars=Array.from(String(newGroup||'')),count=chars.reduce((n,c)=>n+(/\d/.test(c)?1:0),0),offset=oldDigits.length-count;let i=0;for(const char of chars){if(!/\d/.test(char)){parent.append(document.createTextNode(char));continue;}const oldIndex=i+offset,oldDigit=oldIndex>=0&&oldIndex<oldDigits.length?oldDigits[oldIndex]:'';if(oldDigit===char){const d=document.createElement('span');d.className='number-roll-static-digit';d.textContent=char;parent.append(d);}else{const slot=document.createElement('span');slot.className=`number-roll-digit number-roll-${direction}`;const old=document.createElement('span');old.className='number-roll-digit-layer number-roll-old';old.textContent=oldDigit||'\u00a0';const next=document.createElement('span');next.className=`number-roll-digit-layer number-roll-new number-change-digit number-change-${direction}`;next.textContent=char;slot.append(old,next);parent.append(slot);}i++;}}
function setLiveNumber(id,text,numericValue){const element=$(id);if(!element)return;const targetText=String(text),targetNumeric=Number(numericValue),reduce=matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;if(element._rollVisualText===undefined){element._rollVisualText=targetText;element._rollVisualNumeric=targetNumeric;element.classList.add('number-roll-host');ccRenderStable(element,targetText);return;}element._rollPending={text:targetText,numeric:targetNumeric};if(element._rollTimer)return;const run=()=>{if(element._rollTimer)return;const pending=element._rollPending;element._rollPending=null;if(!pending)return;const oldText=String(element._rollVisualText??pending.text),oldNumeric=Number(element._rollVisualNumeric),newText=String(pending.text),newNumeric=Number(pending.numeric),changed=oldText!==newText&&Number.isFinite(oldNumeric)&&Number.isFinite(newNumeric)&&Math.abs(newNumeric-oldNumeric)>Math.max(1e-12,Math.abs(oldNumeric)*1e-10);if(!changed||reduce){ccRenderStable(element,newText);element._rollVisualText=newText;element._rollVisualNumeric=newNumeric;if(element._rollPending)requestAnimationFrame(run);return;}const direction=newNumeric>oldNumeric?'up':'down',shell=document.createElement('span');shell.className='number-roll-text';shell.setAttribute('aria-label',newText);const oldGroups=ccNumberRollGroups(oldText),newGroups=ccNumberRollGroups(newText);let cursor=0;newGroups.forEach((g,i)=>{if(g.start>cursor)shell.append(document.createTextNode(newText.slice(cursor,g.start)));ccAppendRollingGroup(shell,oldGroups[i]?.text||'',g.text,direction);cursor=g.end;});if(cursor<newText.length)shell.append(document.createTextNode(newText.slice(cursor)));element.classList.add('number-roll-host');element.replaceChildren(newGroups.length?shell:document.createTextNode(newText));element._rollTarget={text:newText,numeric:newNumeric};element._rollTimer=setTimeout(()=>{const done=element._rollTarget||{text:newText,numeric:newNumeric};element._rollTimer=null;element._rollTarget=null;element._rollVisualText=done.text;element._rollVisualNumeric=done.numeric;ccRenderStable(element,done.text);if(element._rollPending)requestAnimationFrame(run);},430);};run();}
function pulseLiveValue(id){return; /* Numeric ticks are intentionally quiet in observation mode. */const el=$(id);if(!el)return;el.classList.remove('cc-value-tick');void el.offsetWidth;el.classList.add('cc-value-tick')}
function setDot(id,mode){const el=$(id);if(!el)return;el.classList.toggle('ok',mode==='ok');el.classList.toggle('bad',mode==='bad')}
function applyPrivacy(){if(!privacy)return;document.querySelectorAll('.private').forEach(el=>el.classList.add('privacy-on'))}
async function fetchJson(url,timeout=8000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw new Error(String(r.status));return await r.json()}finally{clearTimeout(t)}}
async function lcd(path){let err;for(const base of LCD_ENDPOINTS){try{const data=await fetchJson(base+path,7500);state.apiOk=true;return data}catch(e){err=e}}state.apiOk=false;throw err||new Error('lcd')}
function findInj(coins=[]){const c=coins.find(x=>x?.denom==='inj');return c?fromWei(c.amount):0}
function rewardTotal(data){return (data?.total||[]).filter(x=>x?.denom==='inj').reduce((s,x)=>s+fromWei(x.amount),0)}
function delegationRows(data){return (data?.delegation_responses||[]).map(r=>({operator:r?.delegation?.validator_address||'',amount:fromWei(r?.balance?.amount)})).filter(r=>r.operator&&r.amount>0)}
function loadLocal(){
  try{
    const wallets=JSON.parse(localStorage.getItem('inj_monitor_wallets_v1')||'[]');
    const requested=(new URLSearchParams(location.search).get('wallet')||'').toLowerCase();
    state.address=(validAddress(requested)?requested:(localStorage.getItem('inj_monitor_address')||'').toLowerCase());
    const w=Array.isArray(wallets)?wallets.find(x=>x.address===state.address):null;
    if(w?.label)state.walletLabel=w.label;
  }catch(_){}
  try{const s=JSON.parse(localStorage.getItem('inj_monitor_summaries_v1')||'{}')[state.address]||{};state.available=n(s.available);state.staked=n(s.staked);state.rewards=n(s.rewards);state.total=n(s.total)||(state.available+state.staked+state.rewards);state.apr=n(s.personalApr);state.networkApr=n(s.networkApr);state.commission=n(s.weightedCommission);state.validators=Array.isArray(s.validators)?s.validators:[];state.lastSync=n(s.updated)}catch(_){}
  try{const a=JSON.parse(localStorage.getItem('inj_monitor_average_buy_price_v1')||'{}');state.avgPrice=n(a[state.address])}catch(_){}
}
async function loadFx(){if(currency!=='EUR')return;try{const d=await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR',5000);if(n(d?.rates?.EUR)>0)state.eur=n(d.rates.EUR)}catch(_){}}
async function refreshWallet(){
  if(!validAddress(state.address)){renderWallet();return}
  if(state.walletLoading)return;
  state.walletLoading=true;setText('ccWalletState','SYNC');setDot('ccDataDot','');
  try{
    const now=Date.now();
    const aprPromise=(!state.aprSyncAt||now-state.aprSyncAt>60000)?fetchJson(APR_ENDPOINT,6500).catch(()=>null):Promise.resolve(null);
    const [bank,deleg,reward,aprRaw]=await Promise.all([
      lcd(`/cosmos/bank/v1beta1/balances/${state.address}`),
      lcd(`/cosmos/staking/v1beta1/delegations/${state.address}`),
      lcd(`/cosmos/distribution/v1beta1/delegators/${state.address}/rewards`),
      aprPromise
    ]);
    state.available=findInj(bank?.balances||[]);const rows=delegationRows(deleg);state.staked=rows.reduce((sum,row)=>sum+row.amount,0);state.rewards=rewardTotal(reward);state.total=state.available+state.staked+state.rewards;
    const official=n(aprRaw?.apr);if(official>0){state.networkApr=official<1?official*100:official;state.aprSyncAt=now;}
    const validators=await Promise.all(rows.map(async row=>{
      const cached=state.validatorMeta[row.operator];
      if(cached&&now-n(cached.updated)<120000)return {...row,...cached};
      try{
        const d=await lcd(`/cosmos/staking/v1beta1/validators/${row.operator}`),v=d?.validator||{};
        const meta={moniker:v?.description?.moniker||shortAddress(row.operator),commission:Math.max(0,Math.min(1,rate(v?.commission?.commission_rates?.rate))),status:v?.status||'',jailed:Boolean(v?.jailed),updated:Date.now()};
        state.validatorMeta[row.operator]=meta;return {...row,...meta};
      }catch(_){return cached?{...row,...cached}:{...row,moniker:shortAddress(row.operator),commission:0,status:'',jailed:false}}
    }));
    state.validators=validators;state.validatorSyncAt=Date.now();
    const delegated=validators.reduce((sum,row)=>sum+row.amount,0);state.commission=delegated>0?validators.reduce((sum,row)=>sum+row.amount*n(row.commission),0)/delegated:0;const annual=validators.reduce((sum,row)=>sum+(row.status==='BOND_STATUS_BONDED'&&!row.jailed?row.amount*state.networkApr*Math.max(0,1-n(row.commission))/100:0),0);state.apr=state.staked>0?annual/state.staked*100:state.apr;
    state.lastSync=Date.now();state.apiOk=true;setText('ccWalletState','ONLINE');setDot('ccDataDot','ok');setText('ccApiState','ONLINE');setDot('ccApiDot','ok');
    try{const all=JSON.parse(localStorage.getItem('inj_monitor_summaries_v1')||'{}');all[state.address]={...(all[state.address]||{}),available:state.available,staked:state.staked,rewards:state.rewards,total:state.total,personalApr:state.apr,networkApr:state.networkApr,weightedCommission:state.commission,validators:state.validators,updated:state.lastSync};localStorage.setItem('inj_monitor_summaries_v1',JSON.stringify(all))}catch(_){}
  }catch(_){setText('ccWalletState','CACHE');setDot('ccDataDot','bad');setText('ccApiState','RETRY');setDot('ccApiDot','bad')}
  finally{state.walletLoading=false;renderWallet();renderValidators();renderSystem()}
}
async function fetchKlines(interval,limit){
  const bases=['https://api.binance.com','https://data-api.binance.vision','https://api1.binance.com'];let err;
  for(const base of bases){try{const d=await fetchJson(`${base}/api/v3/klines?symbol=INJUSDT&interval=${interval}&limit=${limit}`,9000);const rows=d.map(r=>({t:n(r[0]),o:n(r[1]),h:n(r[2]),l:n(r[3]),c:n(r[4])})).filter(r=>r.o>0&&r.h>0&&r.l>0&&r.c>0);if(rows.length)return rows}catch(e){err=e}}
  throw err||new Error('market history');
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
    state.historyAt=Date.now();state.marketOk=false;state.chartEnterAt=performance.now();renderAll();
  }catch(_){
    // Graceful fallback: longer histories still keep the Command Center usable.
    try{
      const [m1,m30,h4,ticker]=await Promise.all([
        fetchKlines('1m',65),fetchKlines('30m',50),fetchKlines('4h',44),
        fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT',7000)
      ]);
      state.series.m1=m1;state.series.m30=m30;state.series.h4=h4;
      // Do not repeat a 1-minute OHLC across tiny buckets: it creates artificial giant candles.
      // Short charts start flat and are immediately populated by real aggTrade ticks.
      state.series.s1=[];
      state.price=n(ticker?.lastPrice)||m1.at(-1)?.c||0;state.target=state.price;state.visual=state.price;
      state.open24=n(ticker?.openPrice);state.low24=n(ticker?.lowPrice);state.high24=n(ticker?.highPrice);state.change24=n(ticker?.priceChangePercent);
      state.historyAt=Date.now();state.marketOk=false;state.chartEnterAt=performance.now();renderAll();
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
  if(!(p>0))return;
  const previous=state.target>0?state.target:(state.price>0?state.price:p);
  state.lastTickDir=p>previous?1:p<previous?-1:state.lastTickDir;
  recordMarketTick(p,previous);state.lastMarketTick=Date.now();
  state.price=p;state.target=p;
  updateLiveCandle('s1',1_000,p,t);updateLiveCandle('m1',60_000,p,t);updateLiveCandle('m30',30*60_000,p,t);updateLiveCandle('h4',4*HOUR,p,t);
}
function scheduleMarketReconnect(delay=1000){clearTimeout(state.reconnect);if(state.stopped||navigator.onLine===false)return;state.reconnect=setTimeout(()=>{state.reconnect=0;connectMarket(false)},delay)}
function connectMarket(force=false){
  if(state.stopped||document.hidden||navigator.onLine===false)return;
  const current=state.ws;if(!force&&current&&(current.readyState===WebSocket.OPEN||current.readyState===WebSocket.CONNECTING))return;
  clearTimeout(state.reconnect);state.reconnect=0;
  if(current){current.onopen=current.onmessage=current.onclose=current.onerror=null;try{current.close()}catch(_){}}
  const generation=++state.wsGeneration;
  try{
    const ws=new WebSocket('wss://stream.binance.com:9443/stream?streams=injusdt@aggTrade/injusdt@miniTicker');state.ws=ws;
    ws.onopen=()=>{if(state.ws!==ws||generation!==state.wsGeneration)return;setText('ccMarketState','ONLINE');setDot('ccMarketDot','ok');renderSystem()};
    ws.onmessage=e=>{if(state.ws!==ws||generation!==state.wsGeneration)return;try{const packet=JSON.parse(e.data),d=packet?.data||packet;if(packet?.stream?.includes('@aggTrade')||d?.e==='aggTrade'){const p=n(d.p);if(p>0){addTick(p,n(d.T)||Date.now());renderFast();}}else{const p=n(d.c);if(p>0){addTick(p);state.open24=n(d.o)||state.open24;state.high24=n(d.h)||state.high24;state.low24=n(d.l)||state.low24;state.change24=state.open24>0?(p/state.open24-1)*100:state.change24;renderFast()}}}catch(_){}};
    ws.onclose=()=>{if(state.ws!==ws||generation!==state.wsGeneration)return;state.ws=null;state.marketOk=false;setText('ccMarketState','RECONNECT');setDot('ccMarketDot','bad');scheduleMarketReconnect(1000)};
    ws.onerror=()=>{if(state.ws===ws)try{ws.close()}catch(_){}};
  }catch(_){state.marketOk=false;if(generation===state.wsGeneration)scheduleMarketReconnect(1300)}
}
function maintainCommandRealtime(){
  if(state.stopped||document.hidden||navigator.onLine===false)return;
  const ws=state.ws,open=ws&&ws.readyState===WebSocket.OPEN,connecting=ws&&ws.readyState===WebSocket.CONNECTING,age=state.lastMarketTick?Date.now()-state.lastMarketTick:Infinity;
  if(!open&&!connecting)connectMarket(false);else if(open&&age>8000)connectMarket(true);
}
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
    if(!c)continue;
    prev=c.c;candles.push(c);
  }
  let last=candles.at(-1);
  if(last&&last.t===currentStart){last.h=Math.max(last.h,lastPrice);last.l=Math.min(last.l,lastPrice);last.c=lastPrice}
  return candles.length>maxCandles+3?candles.slice(-(maxCandles+3)):candles;
}
function candleY(price,min,span,bottom,ph){return bottom-Math.max(0,Math.min(1,(price-min)/span))*ph}
function chartColor(card,dir){card.classList.remove('up','down','neutral');card.classList.add(dir>0?'up':dir<0?'down':'neutral');const cs=getComputedStyle(document.documentElement);return cs.getPropertyValue(dir>0?'--up':dir<0?'--down':'--accent').trim()}
function hexAlpha(hex,a){const h=String(hex||'').trim();if(/^#[0-9a-f]{6}$/i.test(h)){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return `rgba(${r},${g},${b},${a})`}return h}
function resizeCanvas(c){const r=c.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.65),w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(c.width!==w||c.height!==h){c.width=w;c.height=h;c._dpr=dpr}return {w:r.width,h:r.height,dpr}}
function updateTimeframeChange(cfg,openPrice,currentPrice){
  const el=$(cfg.changeId); if(!el) return;
  const value=openPrice>0&&currentPrice>0?((currentPrice/openPrice)-1)*100:NaN;
  if(!Number.isFinite(value)){setText(cfg.changeId,'—');el.className='neutral';return;}
  setLiveNumber(cfg.changeId,`${value>0?'+':''}${value.toFixed(2)}%`,value);
  el.className=value>0?'positive':value<0?'negative':'neutral';
}
function drawChart(key,now,dt){
  const cfg=ranges[key],c=$(cfg.canvas),card=document.querySelector(cfg.card);
  if(!c||!card||card.hidden||!(state.visual>0))return;
  now=marketFresh()?now:(state.lastMarketTick||state.historyAt||now);
  const src=chartSource(key),start=now-cfg.ms;
  const rows=src.filter(r=>r&&r.t<=now&&r.t>=start-cfg.bucket&&r.c>0);
  if(!rows.length){const {w,h}=resizeCanvas(c);c.getContext('2d').clearRect(0,0,c.width,c.height);updateTimeframeChange(cfg,0,0);card.querySelector('.cc-time-axis span').textContent='In attesa di storico reale';return;}
  const candles=buildCandles(rows,start,cfg.bucket,now,state.visual,cfg.maxCandles);
  const allPrices=candles.flatMap(c=>[c.h,c.l]);
  let rawMin=Math.min(...allPrices),rawMax=Math.max(...allPrices);
  const floor=Math.max(state.visual*cfg.minSpan,state.visual<10?.00005:.0005);
  let rawSpan=rawMax-rawMin;
  if(rawSpan<floor){const mid=(rawMax+rawMin)/2;rawMin=mid-floor/2;rawMax=mid+floor/2;rawSpan=floor}

  // v15.99.24 — stable live viewport. The scale no longer recentres around
  // every tick: candles can visibly travel up/down. It expands quickly when
  // new extremes arrive, contracts slowly, and only pans when price approaches
  // the outer comfort band.
  const targetMin=rawMin-rawSpan*.16,targetMax=rawMax+rawSpan*.16;
  let sc=state.scales[key];
  if(!sc) sc=state.scales[key]={min:targetMin,max:targetMax};
  else{
    const expand=1-Math.exp(-dt/120),relax=1-Math.exp(-dt/6200);
    sc.min+=(targetMin-sc.min)*(targetMin<sc.min?expand:relax);
    sc.max+=(targetMax-sc.max)*(targetMax>sc.max?expand:relax);
    const view=Math.max(sc.max-sc.min,floor);
    const safeLow=sc.min+view*.18,safeHigh=sc.max-view*.18;
    let shift=0;
    if(state.visual<safeLow) shift=state.visual-safeLow;
    else if(state.visual>safeHigh) shift=state.visual-safeHigh;
    if(shift){const pan=1-Math.exp(-dt/210);sc.min+=shift*pan;sc.max+=shift*pan;}
  }
  let min=sc.min,max=sc.max,span=Math.max(max-min,floor);
  const {w,h,dpr}=resizeCanvas(c),ctx=c.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  // Reserve a dedicated price gutter on the right so labels/marker never sit
  // on top of the live candle or wick.
  const priceGutter=key===tactical.main?Math.min(110,Math.max(88,w*.085)):Math.min(90,Math.max(70,w*.13));
  const left=10,right=Math.max(left+40,w-priceGutter),top=9,bottom=h-9,ph=bottom-top,pw=right-left;
  const overallDir=Math.abs((candles.at(-1)?.c||state.visual)-(candles[0]?.o||state.visual))<Math.max(state.visual*.000012,.000002)?0:Math.sign((candles.at(-1)?.c||state.visual)-(candles[0]?.o||state.visual));
  updateTimeframeChange(cfg,candles[0]?.o||state.visual,state.visual);
  const markerColor=chartColor(card,overallDir);
  const colors=getComputedStyle(document.documentElement);
  updateChartMeta(card,cfg,rows,now); 

  ctx.lineWidth=1;
  ctx.strokeStyle='rgba(135,165,205,.06)';
  [0,.25,.5,.75,1].forEach((f,idx)=>{ if(idx===0||idx===4) return; const y=top+ph*f; ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke(); });
  ctx.strokeStyle='rgba(135,165,205,.03)';
  [1/3,2/3].forEach(f=>{const x=left+pw*f;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke()});

  const candleCount=Math.max(1,candles.length);
  const stepX=pw/Math.max(1,cfg.maxCandles);
  const smoothFlow=key==='m1'||key==='m5'||key==='m10';
  const minBody=smoothFlow?2.2:2.6;
  const bodyW=Math.max(minBody,Math.min(28,stepX*(smoothFlow?.74:.70)));
  const enterElapsed=Math.max(0,performance.now()-(state.chartEnterAt||0));
  let lastX=left,lastY=bottom;
  for(let idx=0; idx<candles.length; idx++){
    const candle=candles[idx];
    const x=smoothFlow?right-stepX*(.5+(now-candle.t)/cfg.bucket):right-stepX*(candleCount-idx-.5);
    if(x+bodyW/2<left||x-bodyW/2>right)continue;
    const yo=candleY(candle.o,min,span,bottom,ph);
    const rawYc=candleY(candle.c,min,span,bottom,ph),rawYh=candleY(candle.h,min,span,bottom,ph),rawYl=candleY(candle.l,min,span,bottom,ph);
    const stagger=Math.min(110,(idx/Math.max(1,candleCount-1))*110),q=Math.max(0,Math.min(1,(enterElapsed-stagger)/390)),grow=1-Math.pow(1-q,3);
    const yc=yo+(rawYc-yo)*grow,yh=yo+(rawYh-yo)*grow,yl=yo+(rawYl-yo)*grow;
    const up=candle.c>=candle.o,down=candle.c<candle.o;
    const bodyColor=colors.getPropertyValue(up?'--up':down?'--down':'--accent').trim()||markerColor;
    ctx.strokeStyle=hexAlpha(bodyColor,.96);ctx.lineWidth=Math.max(1,Math.min(1.7,bodyW*.10));ctx.beginPath();ctx.moveTo(x,yh);ctx.lineTo(x,yl);ctx.stroke();
    const bodyTop=Math.min(yo,yc),bodyBottom=Math.max(yo,yc),bodyH=Math.max(2.35,bodyBottom-bodyTop);
    ctx.fillStyle=bodyColor;ctx.fillRect(x-bodyW/2,bodyTop,bodyW,bodyH);ctx.strokeStyle=hexAlpha(bodyColor,.99);ctx.lineWidth=.6;ctx.strokeRect(x-bodyW/2,bodyTop,bodyW,bodyH);
    lastX=x;lastY=yc;
  }

  // v15.98.64 — Price Pulse Halo + micro Edge Tick, shared with Live Charts.
  // It follows the real close price and inherits the latest market tick direction.
  const lastCandle=candles.at(-1);
  const lastYo=candleY(lastCandle.o,min,span,bottom,ph),lastRawCloseY=candleY(lastCandle.c,min,span,bottom,ph);
  const lastStagger=110,lastQ=Math.max(0,Math.min(1,(enterElapsed-lastStagger)/390)),lastGrow=1-Math.pow(1-lastQ,3),lastCloseY=lastYo+(lastRawCloseY-lastYo)*lastGrow;
  const lastBullish=lastCandle.c>=lastCandle.o;
  const tickFresh=Math.max(0,Math.min(1,1-(now-state.lastMarketTick)/560));
  const signalDir=state.lastTickDir||(lastBullish?1:-1);
  const signalColor=getComputedStyle(document.documentElement).getPropertyValue(signalDir>=0?'--up':'--down').trim() || markerColor;
  const anchorY=Math.max(top+1,Math.min(bottom-1,lastCloseY));
  const tickStart=lastX+bodyW/2+1.1;
  const tickLen=Math.max(4.5,Math.min(8.5,bodyW*.82));
  const tickEnd=Math.min(right-1,tickStart+tickLen);
  ctx.save();
  if(tickFresh>0){
    const phase=1-tickFresh,haloRadius=Math.max(3.2,bodyW*.62)+phase*7.5;
    ctx.strokeStyle=hexAlpha(signalColor,.10+tickFresh*.28);
    ctx.lineWidth=.8+tickFresh*.8;
    ctx.shadowColor=hexAlpha(signalColor,.26+tickFresh*.26);
    ctx.shadowBlur=3+tickFresh*7;
    ctx.beginPath();ctx.arc(lastX,anchorY,haloRadius,0,Math.PI*2);ctx.stroke();
  }
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle=hexAlpha(signalColor,.76+tickFresh*.24);
  ctx.lineWidth=1.35+tickFresh*.55;
  if(tickFresh>0){ctx.shadowColor=hexAlpha(signalColor,.20+tickFresh*.30);ctx.shadowBlur=2+tickFresh*4;}
  ctx.beginPath();ctx.moveTo(tickStart,anchorY);ctx.lineTo(tickEnd,anchorY);ctx.lineTo(tickEnd,anchorY+(signalDir>=0?-2.1:2.1));ctx.stroke();
  ctx.restore();

  // Small circular live endpoint. Canvas keeps it perfectly round on every display.
  const endpointPulse=(Math.sin(performance.now()/210)+1)/2;
  ctx.save();
  ctx.fillStyle=hexAlpha(signalColor,.72+endpointPulse*.28);
  ctx.shadowColor=hexAlpha(signalColor,.38+endpointPulse*.28);
  ctx.shadowBlur=3+endpointPulse*5;
  ctx.beginPath();ctx.arc(lastX,anchorY,2.25+endpointPulse*.45,0,Math.PI*2);ctx.fill();
  ctx.restore();

  if(key===tactical.main)drawLevels(ctx,min,span,left,right,bottom,ph);
  setText(cfg.ids[0],priceText(max));
  setText(cfg.ids[1],priceText((min+max)/2));
  setText(cfg.ids[2],priceText(min));
  const marker=$(cfg.ids[3]);
  if(marker){marker.textContent=priceText(state.visual);const pos=Math.max(8,Math.min(92,100-(state.visual-min)/span*100));marker.style.top=pos+'%';cfg.ids.slice(0,3).forEach((id,i)=>{$(id).style.visibility=Math.abs(pos/100*h-i/2*h)<24?'hidden':'';});}
}
function renderWallet(){
  const live=state.visual||state.price;
  setText('ccWalletName',state.walletLabel);setText('ccWalletAddress',shortAddress(state.address));
  setLiveNumber('ccNetWorth',live>0?money(state.total*live):'—',live>0?state.total*live:NaN);
  setLiveNumber('ccTotalInj',fmtInj(state.total,4),state.total);
  setLiveNumber('ccAvailable',fmtInj(state.available,4),state.available);
  setLiveNumber('ccStaked',fmtInj(state.staked,4),state.staked);
  setLiveNumber('ccRewards',fmtInj(state.rewards,4),state.rewards);
  setLiveNumber('ccAvgPrice',state.avgPrice>0?money(state.avgPrice):'—',state.avgPrice>0?state.avgPrice:NaN);
  const pnl=state.avgPrice>0&&live>0?(live-state.avgPrice)*state.total:0,pnlPct=state.avgPrice>0&&live>0?(live/state.avgPrice-1)*100:0;
  setLiveNumber('ccTotalPnl',state.avgPrice>0&&live>0?money(pnl):'—',state.avgPrice>0&&live>0?pnl:NaN);
  setLiveNumber('ccTotalPnlPct',state.avgPrice>0&&live>0?pct(pnlPct):'—',state.avgPrice>0&&live>0?pnlPct:NaN);
  setLiveNumber('ccApr',state.apr>0?state.apr.toFixed(3)+'%':'—',state.apr>0?state.apr:NaN);
  setLiveNumber('ccNetworkApr',state.networkApr>0?state.networkApr.toFixed(3)+'%':'—',state.networkApr>0?state.networkApr:NaN);
  setLiveNumber('ccCommission',state.commission>0?(state.commission*100).toFixed(2)+'%':'—',state.commission>0?state.commission*100:NaN);
  const daily=state.staked>0&&state.apr>0?state.staked*state.apr/100/365:0;
  setLiveNumber('ccDailyReward',daily>0?fmtInj(daily,4):'—',daily>0?daily:NaN);
  setLiveNumber('ccDailyRewardUsd',daily>0&&live>0?money(daily*live):'—',daily>0&&live>0?daily*live:NaN);
  setLiveNumber('ccPulseRewardValue',daily>0?fmtInj(daily,4):'—',daily>0?daily:NaN);
  setLiveNumber('ccPulseRewardUsd',daily>0&&live>0?money(daily*live):'—',daily>0&&live>0?daily*live:NaN);
  const stakeRatio=state.total>0?state.staked/state.total*100:NaN;
  setLiveNumber('ccStakeRatio',Number.isFinite(stakeRatio)?stakeRatio.toFixed(1)+'%':'—',stakeRatio);
  setText('ccValidatorCount',`${state.validators.length||0} validator${state.validators.length===1?'':'s'}`);
  setLiveNumber('ccFooterApr',state.apr>0?state.apr.toFixed(3)+'%':'—',state.apr>0?state.apr:NaN);
  setLiveNumber('ccFooterReward',daily>0?daily.toFixed(6)+' INJ':'—',daily>0?daily:NaN);
  applyPrivacy();
}
function renderValidators(){const host=$('ccValidatorList');if(!host)return;host.replaceChildren();if(!state.validators.length){const e=document.createElement('span');e.className='cc-empty';e.textContent='Nessuna delega rilevata';host.append(e);return}state.validators.forEach(v=>{const row=document.createElement('div');row.className='cc-validator-row';const name=document.createElement('strong');name.textContent=v.moniker||shortAddress(v.operator);const meta=document.createElement('span');meta.textContent=`${fmtInj(v.amount,2)} · fee ${(n(v.commission)*100).toFixed(2)}%`;const status=document.createElement('b');status.textContent=v.jailed?'JAILED':(v.status==='BOND_STATUS_BONDED'?'ACTIVE':'CHECK');if(v.jailed||v.status!=='BOND_STATUS_BONDED')status.style.color='var(--down)';row.append(name,meta,status);host.append(row)})}
function renderMarket(){
  const live=state.visual||state.price;
  const liveChange24=state.open24>0&&live>0?(live/state.open24-1)*100:state.change24;
  setLiveNumber('ccLivePrice',priceText(live),live);
  setLiveNumber('ccChange24',live>0?`${pct(liveChange24)} · 24H`:'— · 24H',live>0?liveChange24:NaN);
  setLiveNumber('ccLow24',priceText(state.low24),state.low24);
  setLiveNumber('ccHigh24',priceText(state.high24),state.high24);
  setLiveNumber('ccFooterLow',priceText(state.low24),state.low24);
  setLiveNumber('ccFooterHigh',priceText(state.high24),state.high24);
  setLiveNumber('ccSnapshot24',live>0?pct(liveChange24):'—',live>0?liveChange24:NaN);
  const span=state.high24-state.low24,pos=span>0?Math.max(0,Math.min(100,(live-state.low24)/span*100)):50;
  ['ccRangeFill','ccFooterFill'].forEach(id=>{const e=$(id);if(e)e.style.width=pos+'%'});['ccRangeDot','ccFooterDot'].forEach(id=>{const e=$(id);if(e)e.style.left=pos+'%'});
  setLiveNumber('ccRangePosition',pos.toFixed(1)+'%',pos);
  const m1=state.series.m1||[];const oneHourStart=m1.find(r=>r.t>=Date.now()-HOUR)?.o||m1[0]?.o||live;const h1=oneHourStart>0&&live>0?(live/oneHourStart-1)*100:0;
  setLiveNumber('ccMomentum',pct(h1),h1);setLiveNumber('ccSnapshot1h',pct(h1),h1);
  const pEl=$('ccPulsePrice');pEl?.classList.remove('up','down','neutral');pEl?.classList.add(h1>0?'up':h1<0?'down':'neutral');
  const dailyPnl=state.open24>0&&live>0?(live-state.open24)*state.total:0,dailyPct=state.open24>0&&live>0?(live/state.open24-1)*100:0;
  setLiveNumber('ccDailyPnl',state.open24>0?money(dailyPnl):'—',state.open24>0?dailyPnl:NaN);
  setLiveNumber('ccDailyPnlPct',state.open24>0?pct(dailyPct):'—',state.open24>0?dailyPct:NaN);
  const dEl=$('ccPulsePnl');dEl?.classList.remove('up','down','neutral','positive','negative');dEl?.classList.add(dailyPct>0?'positive':dailyPct<0?'negative':'neutral');
  renderWallet();
}
function renderSystem(){
 const fresh=marketFresh(),age=state.lastMarketTick?Math.max(0,Math.floor((Date.now()-state.lastMarketTick)/1000)):0;
 const mode=fresh?'LIVE':state.lastMarketTick?'IN RITARDO':'ATTESA';
 const conn=$('ccConnection');if(conn){conn.classList.toggle('offline',!fresh);conn.innerHTML=`<i></i>${mode}`;}
 setText('ccLastQuote',state.lastMarketTick?`Ultimo prezzo ${new Date(state.lastMarketTick).toLocaleTimeString('it-IT')} · ${age}s`:'Ultimo prezzo —');
 setText('ccFooterLive',`MERCATO · ${mode}`);
 setText('ccWalletState',state.lastSync?`WALLET · ${state.apiOk&&Date.now()-state.lastSync<120000?'ONLINE':'CACHE'}`:'WALLET · ATTESA');
 setText('ccLastSync',state.lastSync?new Date(state.lastSync).toLocaleTimeString('it-IT'):'—');
 setText('ccFooterSystem',`API · ${state.apiOk?'ONLINE':'IN ATTESA'}`);
 document.querySelectorAll('.cc-chart-feed').forEach(el=>{if(el.textContent!==mode)el.textContent=mode});
 if(tactical.wasFresh&&!fresh)pushEvent('Flusso mercato interrotto: ultimo prezzo conservato.','connection');
 tactical.wasFresh=fresh;
}
function renderFast(){const now=performance.now();if(now-tactical.lastDataPaint<150)return;tactical.lastDataPaint=now;renderMarket();renderSystem();renderTactical()}
function renderAll(){renderWallet();renderValidators();renderMarket();renderSystem()}
function frame(ts){state.raf=0;if(state.stopped||document.hidden)return;
 const dt=Math.max(8,Math.min(100,ts-(state.lastFrame||ts-33)));state.lastFrame=ts;
 if(state.target>0){if(!(state.visual>0))state.visual=state.target;const delta=state.target-state.visual;state.visual+=delta*(1-Math.exp(-dt/38));if(Math.abs(delta)<.00000035)state.visual=state.target;}
 if(ts-state.lastDraw>=32&&state.visual>0){const drawDt=Math.min(120,ts-(state.lastDraw||ts-33));state.lastDraw=ts;[tactical.main,...tactical.small].forEach(k=>drawChart(k,Date.now(),drawDt));}
 if(ts-tactical.lastDataPaint>=250){tactical.lastDataPaint=ts;renderMarket();renderTactical();}
 state.raf=requestAnimationFrame(frame);
}
function start(){if(!state.raf&&!document.hidden&&!state.stopped)state.raf=requestAnimationFrame(frame)}
function stop(){state.stopped=true;if(state.raf)cancelAnimationFrame(state.raf);clearTimeout(state.reconnect);try{state.ws?.close()}catch(_){}state.ws=null}
function clock(){setText('ccClock',new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));renderSystem();}
const tactical={main:'h1',small:['m1','d1','w1'],levels:[],events:[],lastEvent:{},wasFresh:false,lastDataPaint:0,observing:false,idleTimer:0};
function marketFresh(){return state.marketOk&&state.lastMarketTick>0&&Date.now()-state.lastMarketTick<20000;}
function pushEvent(message,key='event',cooldown=10000){const now=Date.now();if(now-(tactical.lastEvent[key]||0)<cooldown)return;tactical.lastEvent[key]=now;tactical.events.unshift({t:now,message});tactical.events=tactical.events.slice(0,40);setText('ccEventCount',String(tactical.events.length));setText('ccLatestEvent',new Date(now).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+' · '+message);const latest=$('ccLatestEvent');latest.classList.remove('new-event');void latest.offsetWidth;latest.classList.add('new-event');const list=$('ccEventList');list.replaceChildren();for(const event of tactical.events){const li=document.createElement('li');li.textContent=new Date(event.t).toLocaleTimeString('it-IT')+' · '+event.message;list.append(li);}}
function recordMarketTick(price,previous){
 const now=Date.now(),was=marketFresh();state.marketOk=true;
 if(!was)pushEvent(state.lastMarketTick?'Flusso mercato ripristinato.':'Flusso mercato connesso.','connection',1000);
 if(state.high24>0&&price>state.high24){pushEvent('Nuovo massimo 24h: '+priceText(price),'high',60000);state.high24=price;}
 if(state.low24>0&&price<state.low24){pushEvent('Nuovo minimo 24h: '+priceText(price),'low',60000);state.low24=price;}
 if(state.lastMarketTick&&previous>0)for(const [i,level] of tactical.levels.entries())if((previous<level&&price>=level)||(previous>level&&price<=level))pushEvent(`Livello ${i+1} attraversato ${price>=level?'al rialzo':'al ribasso'}: ${priceText(level)}`,'level'+i,30000);
}
function selectMain(key){if(!ranges[key])return;const old=tactical.main;const i=tactical.small.indexOf(key);if(i>=0)tactical.small[i]=old;tactical.main=key;$('ccMainRange').value=key;const shown=[key,...tactical.small];document.querySelectorAll('.cc-chart').forEach(card=>{const k=card.dataset.key;card.hidden=!shown.includes(k);card.classList.toggle('cc-primary',k===key);card.style.gridRow=k===key?'':String(tactical.small.indexOf(k)+1);if(matchMedia('(max-width:600px)').matches&&k!==key)card.style.gridRow=String(tactical.small.indexOf(k)+2);card.querySelector('button').setAttribute('aria-pressed',String(k===key));});state.scales[key]=null;state.lastDraw=0;}
function updateChartMeta(card,cfg,rows,now){const full=rows[0].t<=now-cfg.ms+cfg.bucket*1.5;const axis=card.querySelector('.cc-time-axis');const fmt=t=>new Date(t).toLocaleString('it-IT',cfg.ms>=DAY?{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}:{hour:'2-digit',minute:'2-digit',...(cfg.ms<=600000?{second:'2-digit'}:{})});const times=axis.querySelectorAll('time');const a=fmt(Math.max(rows[0].t,now-cfg.ms)),b=fmt(now);if(times[0].textContent!==a)times[0].textContent=a;if(times[1].textContent!==b)times[1].textContent=b;const label=full?'':'Storico parziale';if(axis.querySelector('span').textContent!==label)axis.querySelector('span').textContent=label;}
function drawLevels(ctx,min,span,left,right,bottom,ph){const marks=[...(!privacy&&state.avgPrice>0?[{p:state.avgPrice,label:'PREZZO MEDIO'}]:[]),...tactical.levels.map((p,i)=>({p,label:'LIVELLO '+(i+1)}))];ctx.save();ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();ctx.fillStyle=ctx.strokeStyle;ctx.font='11px system-ui';ctx.setLineDash([5,5]);for(const mark of marks){if(mark.p<min||mark.p>min+span)continue;const y=candleY(mark.p,min,span,bottom,ph);ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.globalAlpha=.95;ctx.fillText(mark.label+' '+priceText(mark.p),left+5,Math.max(14,y-5));}ctx.restore();}
function renderTactical(){const p=state.price;if(!(p>0))return;let positives=0,total=0;for(const cfg of Object.values(ranges)){const rows=state.series[cfg.source]||[];const start=Date.now()-cfg.ms;const first=rows.find(r=>r.t>=start-cfg.bucket);if(!first||first.t>start+cfg.bucket*1.5)continue;total++;if(p>first.o)positives++;}setText('ccConsensus',total?`${positives} / ${total}`:'—');setText('ccLowDistance',state.low24>0?`${((p/state.low24-1)*100).toFixed(2)}% sopra`:'—');setText('ccHighDistance',state.high24>0?`${Math.max(0,(state.high24/p-1)*100).toFixed(2)}% al massimo`:'—');setText('ccLevelSummary',tactical.levels.length?tactical.levels.map((v,i)=>`L${i+1} ${priceText(v)} · ${pct((v/p-1)*100)}`).join(' / '):'Livelli personali · non impostati');for(const id of ['ccTotalPnl','ccTotalPnlPct','ccDailyPnl','ccDailyPnlPct','ccChange24']){const el=$(id);if(!el)continue;const base=id.startsWith('ccTotal')?state.avgPrice:state.open24;el.classList.toggle('positive',base>0&&p>base);el.classList.toggle('negative',base>0&&p<base);}}
function initTactical(){try{const saved=JSON.parse(localStorage.getItem('inj_node_cc_levels_'+state.address)||'[]');tactical.levels=Array.isArray(saved)?saved.map(Number).filter(x=>Number.isFinite(x)&&x>0).slice(0,2):[];}catch(_){}selectMain('h1');$('ccMainRange').addEventListener('change',e=>selectMain(e.target.value));document.querySelectorAll('[data-promote]').forEach(b=>b.addEventListener('click',()=>selectMain(b.dataset.promote)));$('ccLevelsButton').addEventListener('click',()=>{['ccLevel1','ccLevel2'].forEach((id,i)=>$(id).value=tactical.levels[i]||'');$('ccLevelsDialog').showModal();});$('ccEventsButton').addEventListener('click',()=>$('ccEventsDialog').showModal());document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));$('ccLevelsForm').addEventListener('submit',e=>{e.preventDefault();tactical.levels=['ccLevel1','ccLevel2'].map(id=>Number($(id).value)).filter(x=>Number.isFinite(x)&&x>0);try{localStorage.setItem('inj_node_cc_levels_'+state.address,JSON.stringify(tactical.levels));}catch(_){}$('ccLevelsDialog').close();renderTactical();});const wake=()=>{document.body.classList.remove('cc-idle');clearTimeout(tactical.idleTimer);if(tactical.observing)tactical.idleTimer=setTimeout(()=>{if(!document.querySelector('dialog[open]')&&!document.querySelector('.cc-chart-tools :focus'))document.body.classList.add('cc-idle');},6000);};$('ccObserve').addEventListener('click',()=>{tactical.observing=!tactical.observing;document.body.classList.toggle('cc-observing',tactical.observing);$('ccObserve').setAttribute('aria-pressed',String(tactical.observing));$('ccObserve').textContent=tactical.observing?'Osservazione attiva':'Osservazione';$('ccObserve').blur();wake();});['pointermove','pointerdown','keydown','focusin'].forEach(type=>document.addEventListener(type,wake,{passive:true}));window.addEventListener('resize',()=>selectMain(tactical.main),{passive:true});}

$('ccBack')?.addEventListener('click',()=>{stop();if(history.length>1)history.back();else location.href='./index.html'});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;}else if(!state.stopped){start();connectMarket(false);void refreshWallet()}});
window.addEventListener('online',()=>{if(!state.stopped){connectMarket(true);void refreshWallet()}});
window.addEventListener('focus',()=>{if(!document.hidden&&!state.stopped){connectMarket(false);void refreshWallet()}},{passive:true});
window.addEventListener('pageshow',()=>{if(!document.hidden&&!state.stopped){start();connectMarket(false);void refreshWallet()}});
window.addEventListener('resize',()=>Object.values(ranges).forEach(cfg=>{const c=$(cfg.canvas);if(c){c.width=0;c.height=0}}),{passive:true});
loadLocal();initTactical();applyPrivacy();renderAll();clock();setInterval(clock,1000);setInterval(()=>{if(!document.hidden)refreshWallet()},6000);setInterval(maintainCommandRealtime,2500);Promise.allSettled([loadFx(),loadMarketHistory()]).then(()=>{renderAll();start();connectMarket()});refreshWallet();
