/* INJ Node Crypto Sentiment 16.00.84
   Source-grounded: Alternative.me Fear & Greed, CoinGecko global and top-200 breadth.
   The three series have independent freshness; no synthetic sentiment score.
*/
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const API='https://api.coingecko.com/api/v3';
  const FEAR_API='https://api.alternative.me/fng/?limit=8&format=json';
  const OWN_CACHE='inj_node_sentiment_v1';
  const GLOBAL_CACHE='inj_node_crypto_global_v1';
  const BREADTH_CACHE='inj_node_crypto_breadth_v1';
  const RATE={fear:1800000,global:300000,breadth:180000};
  const data={fear:null,global:null,breadth:null,stamps:{fear:0,global:0,breadth:0},fetched:{fear:0,global:0,breadth:0},loading:new Set(),booted:false};
  const locale=()=>getLang()==='en'?'en-US':'it-IT';
  function getLang(){try{return localStorage.getItem('inj_node_language_v1')==='en'?'en':'it';}catch(_){return 'it';}}
  const copy=(it,en)=>getLang()==='en'?en:it;
  const labels={
    subtitle:['Psicologia e forza del mercato globale','Global market psychology and strength'],
    headline:['Il polso del mercato crypto','Crypto market pulse'],
    subhead:['Sentiment, direzione, partecipazione e dominance. Nessun valore simulato.','Sentiment, direction, market breadth and dominance. No simulated values.'],
    daily:['AGGIORNAMENTO GIORNALIERO','DAILY INDEX'],
    currentEmotion:['SENTIMENT ATTUALE','CURRENT SENTIMENT'],
    fearExplain:['Indice di psicologia del mercato crypto, prevalentemente Bitcoin.','Crypto market psychology index, predominantly Bitcoin-focused.'],
    fngContext:['Il valore è fornito da Alternative.me: non è una previsione di prezzo.','Provided by Alternative.me: this index is not a price prediction.'],
    marketPulse:['Forza del mercato','Market strength'],
    marketTrend:['CAPITALIZZAZIONE · 24H','MARKET CAP · 24H'],
    awaiting:['In attesa dei dati','Awaiting data'],
    marketBreadth:['PARTECIPAZIONE · TOP 200','BREADTH · TOP 200'],
    breadthNote:['Quota delle prime 200 crypto in rialzo nelle ultime 24 ore.','Share of the top 200 cryptocurrencies rising over 24 hours.'],
    totalCap:['MARKET CAP TOTALE','TOTAL MARKET CAP'],
    totalCapHint:['Capitalizzazione del mercato crypto','Global crypto market capitalization'],
    totalVolume:['VOLUME GLOBALE 24H','GLOBAL 24H VOLUME'],
    volumeHint:['Volume riportato dalla fonte','Volume reported by the source'],
    btcDom:['DOMINANCE BTC','BTC DOMINANCE'],
    ethDom:['DOMINANCE ETH','ETH DOMINANCE'],
    historicalTitle:['Fear & Greed · ultimi 7 rilevamenti','Fear & Greed · last 7 readings'],
    historyNote:['I rilevamenti sono giornalieri. Il sentiment non misura direttamente la performance dei prezzi.','Readings are daily. Sentiment does not directly measure price performance.'],
    sourceFooter:['Fonti: Alternative.me (sentiment) · CoinGecko (mercato)','Sources: Alternative.me (sentiment) · CoinGecko (market)']
  };
  const numeral=(value,digits=2)=>new Intl.NumberFormat(locale(),{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
  const valid=value=>typeof value==='number'&&Number.isFinite(value);
  const number=value=>{
    if(value===null||value===undefined||value==='')return NaN;
    const next=Number(value);
    return Number.isFinite(next)?next:NaN;
  };
  const signed=value=>valid(value)?(value>0?'+':'')+numeral(value,2)+'%':'—';
  const currency=()=>{try{return localStorage.getItem('inj_monitor_currency')==='EUR'?'eur':'usd';}catch(_){return 'usd';}};
  function money(value){
    if(!valid(value)||value<0)return '—';
    const unit=currency()==='eur'?'€':'$';
    if(value>=1e12)return unit+numeral(value/1e12,2)+'T';
    if(value>=1e9)return unit+numeral(value/1e9,2)+'B';
    if(value>=1e6)return unit+numeral(value/1e6,2)+'M';
    return unit+numeral(value,2);
  }
  function set(id,text){const node=$(id);if(node&&node.textContent!==String(text))node.textContent=String(text);}
  function classification(row){
    const name=String(row?.value_classification||'').toLowerCase().trim();
    const names={
      'extreme fear':['Paura estrema','Extreme Fear'],fear:['Paura','Fear'],
      neutral:['Neutro','Neutral'],greed:['Avidità','Greed'],
      'extreme greed':['Avidità estrema','Extreme Greed']
    };
    return names[name] ? names[name][getLang()==='en'?1:0] : copy('Non classificato','Unclassified');
  }
  function severity(score){
    if(score<45)return 'fear';
    if(score>=55)return 'greedy';
    return 'neutral';
  }
  function readStored(key){
    try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}
  }
  function acceptFear(raw){
    const array=Array.isArray(raw?.data)?raw.data:raw;
    if(!Array.isArray(array))return null;
    const parsed=array.map(row=>({
      value:number(row?.value),
      timestamp:number(row?.timestamp),
      value_classification:String(row?.value_classification||'')
    })).filter(row=>Number.isInteger(row.value)&&row.value>=0&&row.value<=100&&
      Number.isFinite(row.timestamp)&&row.timestamp>1400000000&&row.timestamp<((Date.now()/1000)+86400))
      .sort((a,b)=>b.timestamp-a.timestamp);
    return parsed.length?parsed.slice(0,8):null;
  }
  function acceptGlobal(raw){
    const d=raw?.data||raw;
    if(!d||typeof d!=='object')return null;
    const usd=number(d.total_market_cap?.usd),btc=number(d.market_cap_percentage?.btc);
    if(!(usd>0)||!(btc>=0&&btc<=100))return null;
    return d;
  }
  function acceptBreadth(raw){
    if(!raw||typeof raw!=='object')return null;
    const count=number(raw.count),up=number(raw.up),down=number(raw.down);
    if(!Number.isInteger(count)||count<1||count>200||!Number.isInteger(up)||!Number.isInteger(down)||
      up<0||down<0||up+down>count)return null;
    return {count,up,down,flat:count-up-down,source:'CoinGecko'};
  }
  function restore(){
    const snapshot=readStored(OWN_CACHE);
    const timestamp=Date.now();
    if(snapshot&&typeof snapshot==='object'){
      for(const source of ['fear','global','breadth']){
        const stamp=number(snapshot.stamps?.[source]);
        const parsed=source==='fear'?acceptFear(snapshot[source]):
          source==='global'?acceptGlobal(snapshot[source]):acceptBreadth(snapshot[source]);
        const maxAge=source==='fear'?10*86400000:source==='global'?86400000:6*3600000;
        if(parsed&&stamp>0&&timestamp-stamp<maxAge){
          data[source]=parsed;data.stamps[source]=stamp;
        }
      }
    }
    const sharedGlobal=readStored(GLOBAL_CACHE);
    const globalStamp=number(sharedGlobal?.updatedAt),globalParsed=acceptGlobal(sharedGlobal?.data);
    if(globalParsed&&globalStamp>data.stamps.global&&timestamp-globalStamp<86400000){
      data.global=globalParsed;data.stamps.global=globalStamp;
    }
    const sharedBreadth=readStored(BREADTH_CACHE);
    const breadthStamp=number(sharedBreadth?.updatedAt),breadthParsed=acceptBreadth(sharedBreadth);
    if(breadthParsed&&breadthStamp>data.stamps.breadth&&timestamp-breadthStamp<6*3600000){
      data.breadth=breadthParsed;data.stamps.breadth=breadthStamp;
    }
  }
  function persist(){
    try{localStorage.setItem(OWN_CACHE,JSON.stringify({
      fear:data.fear,global:data.global,breadth:data.breadth,stamps:data.stamps
    }));}catch(_){}
  }
  async function getJson(url,timeoutMs=12000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{signal:controller.signal,cache:'no-store',headers:{accept:'application/json'}});
      if(!response.ok)throw Error('HTTP '+response.status);
      return await response.json();
    }finally{clearTimeout(timer);}
  }
  async function fetchFear(){
    const body=await getJson(FEAR_API);
    const parsed=acceptFear(body);
    if(!parsed)throw Error('Fear and Greed response invalid');
    return parsed;
  }
  async function fetchGlobal(){
    const body=await getJson(API+'/global');
    const parsed=acceptGlobal(body);
    if(!parsed)throw Error('CoinGecko global response invalid');
    return parsed;
  }
  async function fetchBreadth(){
    // Reuse the Top 200 data from INJ Market when recent, to reduce API load.
    const recent=readStored(BREADTH_CACHE);
    if(recent&&Date.now()-number(recent.updatedAt)<120000){
      const parsed=acceptBreadth(recent);
      if(parsed)return parsed;
    }
    const body=await getJson(API+'/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false&price_change_percentage=24h',16500);
    if(!Array.isArray(body)||body.length===0)throw Error('CoinGecko top 200 response invalid');
    let up=0,down=0,flat=0;
    for(const coin of body){
      const p=number(coin?.price_change_percentage_24h_in_currency??coin?.price_change_percentage_24h);
      if(!valid(p))continue;
      if(p>0)up++;else if(p<0)down++;else flat++;
    }
    const count=up+down+flat;
    if(count<1)throw Error('No valid price changes');
    return {count,up,down,flat,source:'CoinGecko'};
  }
  function sourceUpdated(key,when){
    data[key]=when;
    data.stamps[key]=Date.now();
    data.fetched[key]=Date.now();
    persist();
    render();
  }
  async function refreshOne(key,force=false){
    if(data.loading.has(key)||document.hidden||navigator.onLine===false)return;
    if(!force&&data.fetched[key]&&Date.now()-data.fetched[key]<RATE[key])return;
    // If a cached Fear & Greed reading is recent, respect its daily cadence.
    if(key==='fear'&&data.fear&&data.stamps.fear&&Date.now()-data.stamps.fear<15*60000&&!force)return;
    data.loading.add(key);
    try{
      const result=await (key==='fear'?fetchFear():key==='global'?fetchGlobal():fetchBreadth());
      if(!result)return;
      sourceUpdated(key,result);
      if(key==='global'){
        try{localStorage.setItem(GLOBAL_CACHE,JSON.stringify({updatedAt:data.stamps.global,data:result}));}catch(_){}
      }
      if(key==='breadth'){
        try{localStorage.setItem(BREADTH_CACHE,JSON.stringify({...result,updatedAt:data.stamps.breadth}));}catch(_){}
      }
    }catch(_){
      // Keep the last trusted reading, explicitly distinguish it from freshly fetched data.
      render();
    }finally{data.loading.delete(key);}
  }
  function renderFear(){
    const fear=data.fear,latest=fear?.[0];
    const value=latest?.value;
    set('sentFearValue',valid(value)?value:'—');
    set('sentFearClass',latest?classification(latest):'—');
    const element=$('sentFearClass');
    element.className=latest?severity(value):'neutral';
    if(valid(value))$('sentNeedle').style.transform='rotate('+(-135+2.7*value)+'deg)';
    const timestamp=valid(latest?.timestamp)?latest.timestamp*1000:0;
    set('sentFearWhen',timestamp?copy('Rilevato il ','Recorded ')+new Date(timestamp).toLocaleString(locale(),{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—');
    $('sentDial')?.setAttribute('aria-label',latest?'Fear and Greed Index '+value+' / 100 · '+classification(latest):'Fear and Greed Index unavailable');
    const barHost=$('sentHistoryBars');
    const observed=(fear||[]).slice(0,7).reverse();
    if(barHost){
      barHost.replaceChildren();
      if(!observed.length){
        const waiting=document.createElement('div');waiting.className='sent-waiting';
        waiting.textContent=copy('In attesa dei dati','Awaiting data');barHost.append(waiting);
      }else{
        for(const day of observed){
          const cell=document.createElement('div');cell.className='sent-history-item';
          const label=document.createElement('strong');label.textContent=String(day.value);
          const bar=document.createElement('i');bar.className='sent-history-pillar '+severity(day.value);
          bar.style.setProperty('--pillar-height',(4+day.value*1.08)+'px');
          bar.title=classification(day)+' · '+day.value+'/100';
          const date=document.createElement('small');
          date.textContent=new Date(day.timestamp*1000).toLocaleDateString(locale(),{day:'2-digit',month:'short'});
          cell.append(label,bar,date);barHost.append(cell);
        }
      }
    }
    const change=observed.length>1?observed.at(-1).value-observed[0].value:NaN;
    set('sentHistoryDelta',valid(change)?(change>0?'+':'')+change+' '+copy('punti','points'):'—');
    $('sentHistoryDelta').className=valid(change)?change>0?'up':change<0?'down':'':'';
  }
  function renderMarket(){
    const g=data.global;
    const cap=number(g?.total_market_cap?.[currency()]),volume=number(g?.total_volume?.[currency()]);
    const delta=number(g?.market_cap_change_percentage_24h_usd);
    const btc=number(g?.market_cap_percentage?.btc),eth=number(g?.market_cap_percentage?.eth);
    set('sentTotalCap',cap>0?money(cap):'—');
    set('sentVolume',volume>0?money(volume):'—');
    set('sentCapChange',valid(delta)?signed(delta):'—');
    const capNode=$('sentCapChange');
    capNode.className=valid(delta)?delta>0?'up':delta<0?'down':'':'';
    set('sentCapTrend',valid(delta)?delta>0?copy('Espansione nelle 24h','Growing over 24h'):delta<0?copy('Contrazione nelle 24h','Contracting over 24h'):copy('Invariato nelle 24h','Flat over 24h'):copy('In attesa dei dati','Awaiting data'));
    set('sentBtcDominance',valid(btc)&&btc>=0?numeral(btc,2)+'%':'—');
    set('sentEthDominance',valid(eth)&&eth>=0?numeral(eth,2)+'%':'—');
    $('sentBtcMeter').style.width=valid(btc)?Math.max(0,Math.min(100,btc))+'%':'0%';
    $('sentEthMeter').style.width=valid(eth)?Math.max(0,Math.min(100,eth))+'%':'0%';
    const b=data.breadth;
    if(b){
      const ratio=b.count>0?b.up/b.count:0;
      set('sentBreadth',numeral(ratio*100,1)+'%');
      set('sentBreadthCount',b.up+'/'+b.count+' '+copy('in rialzo','up'));
      set('sentBreadthPos',b.up+' '+copy('positive','up'));
      set('sentBreadthNeg',b.down+' '+copy('negative','down'));
      $('sentBreadthUp').style.width=ratio*100+'%';
      $('sentBreadthDown').style.width=b.down/b.count*100+'%';
    }else{
      for(const id of ['sentBreadth','sentBreadthCount','sentBreadthPos','sentBreadthNeg'])set(id,'—');
      $('sentBreadthUp').style.width='0%';$('sentBreadthDown').style.width='0%';
    }
    const newest=Math.max(0,data.stamps.global,data.stamps.breadth);
    set('sentMarketWhen',newest?new Date(newest).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'}):'—');
  }
  function renderStatus(){
    const age={fear:40*60000,global:9*60000,breadth:8*60000};
    const fresh=Object.keys(age).filter(k=>data.fetched[k]&&Date.now()-data.fetched[k]<age[k]).length;
    const cached=['fear','global','breadth'].filter(k=>!!data[k]).length;
    const node=$('sentConnection');
    node.classList.toggle('live',fresh===3);
    node.classList.toggle('cache',cached>0&&fresh<3);
    set('sentConnectionText',fresh===3?'LIVE 3/3':fresh?fresh+'/3 LIVE':cached?copy('DATI SALVATI','CACHED DATA'):'SYNC');
    const times=Object.entries(data.stamps).filter(([key,stamp])=>stamp>0).map(([key,stamp])=>stamp);
    set('sentUpdated',times.length?copy('Ultimo aggiornamento ','Last updated ')+new Date(Math.max(...times)).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'}):'—');
  }
  function render(){renderFear();renderMarket();renderStatus();}
  function applyLanguage(){
    document.documentElement.lang=getLang();
    document.querySelectorAll('[data-t]').forEach(node=>{
      const pair=labels[node.dataset.t];if(pair)node.textContent=pair[getLang()==='en'?1:0];
    });
    $('sentBack')?.setAttribute('aria-label',copy('Torna alla Home','Back to Home'));
    $('sentBack').title=copy('Torna alla Home','Back to Home');
    document.title=copy('INJ Node · Sentiment Crypto','INJ Node · Crypto Sentiment');
    render();
  }
  function tick(){
    if(document.hidden)return;
    for(const key of ['fear','global','breadth'])void refreshOne(key);
    renderStatus();
  }
  function boot(){
    if(data.booted)return;data.booted=true;
    restore();applyLanguage();
    tick();
    window.addEventListener('storage',event=>{
      if(event.key==='inj_node_language_v1')applyLanguage();
      else if(event.key==='inj_monitor_currency')render();
      else if(event.key==='inj_monitor_theme')location.reload();
      else if([GLOBAL_CACHE,BREADTH_CACHE].includes(event.key)){
        const shared=readStored(event.key);
        if(event.key===GLOBAL_CACHE&&acceptGlobal(shared?.data)&&number(shared?.updatedAt)>data.stamps.global){
          data.global=acceptGlobal(shared.data);data.stamps.global=number(shared.updatedAt);render();
        }else if(event.key===BREADTH_CACHE&&acceptBreadth(shared)&&number(shared?.updatedAt)>data.stamps.breadth){
          data.breadth=acceptBreadth(shared);data.stamps.breadth=number(shared.updatedAt);render();
        }
      }
    });
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
    window.addEventListener('pageshow',()=>tick());
    window.addEventListener('online',()=>tick());
    setInterval(tick,60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
