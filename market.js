(()=>{'use strict';const $=id=>document.getElementById(id);const t=(key,vars)=>window.MARKET_I18N?.t(key,vars)||key;const marketLocale=()=>window.MARKET_I18N?.getLanguage()==='en'?'en-US':'it-IT';const API='https://api.coingecko.com/api/v3';const state={coins:[],currency:'usd',sort:'market_cap_rank',desc:false,range:'7d',busy:false,last:0,selected:null,previousPercentages:new Map(),scrollDirections:new Map(),sockets:[],socketTimer:null,liveCount:0,priceSnapshot:new Map(),pairCoins:new Map(),livePriceTimes:new Map()};try{state.currency=localStorage.getItem('inj_monitor_currency')?.toLowerCase()==='eur'?'eur':'usd'}catch(_){}const sym=()=>state.currency==='eur'?'€':'$';const money=(v,compact=false)=>{if(!Number.isFinite(v))return '—';if(compact&&Math.abs(v)>=1e12)return sym()+(v/1e12).toFixed(2)+'T';if(compact&&Math.abs(v)>=1e9)return sym()+(v/1e9).toFixed(2)+'B';if(compact&&Math.abs(v)>=1e6)return sym()+(v/1e6).toFixed(2)+'M';return new Intl.NumberFormat(marketLocale(),{style:'currency',currency:state.currency.toUpperCase(),maximumFractionDigits:v<0.01?8:v<1?5:2}).format(v)};const pct=v=>Number.isFinite(v)?(v>0?'+':'')+new Intl.NumberFormat(marketLocale(),{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+'%':'—';const tone=v=>!Number.isFinite(v)?'neutral':v>0?'up':v<0?'down':'neutral';const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const seriesSvg=(values,w=100,h=30)=>{let a=values.filter(Number.isFinite);if(a.length<2)return '<span class="neutral">—</span>';let lo=Math.min(...a),hi=Math.max(...a),span=hi-lo||1,points=a.map((v,i)=>((i/(a.length-1))*w).toFixed(1)+','+((h-3)-((v-lo)/span)*(h-6)).toFixed(1)).join(' ');return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" aria-label="Andamento grafico"><polyline class="'+(a.at(-1)>=a[0]?'up':'down')+'" style="stroke:var(--'+(a.at(-1)>=a[0]?'positive':'negative')+')" points="'+points+'"/></svg>'};const change=(c,k)=>c['price_change_percentage_'+k+'_in_currency'];const frames=['1h','24h','7d','30d'];function comparePercentages(coins){const next=new Map(),scrolls=new Map();for(const c of coins){for(const k of frames){const id=c.id+':'+k,val=change(c,k),before=state.previousPercentages.get(id);next.set(id,val);if(Number.isFinite(val)&&Number.isFinite(before)&&pct(val)!==pct(before)){scrolls.set(id,val>before?'rise':'fall');}}}state.previousPercentages=next;state.scrollDirections=scrolls;}function render(){const q=$('search').value.toLowerCase().trim(),limit=+$('scope').value,d=$('direction').value;let items=state.coins.slice(0,limit).filter(c=>(!q||(c.name+' '+c.symbol).toLowerCase().includes(q))&&(d==='all'||(d==='up'?change(c,'24h')>=0:change(c,'24h')<0)));items.sort((a,b)=>{const va=state.sort==='name'?a.name.toLowerCase():a[state.sort],vb=state.sort==='name'?b.name.toLowerCase():b[state.sort];let cmp=(va==null)-(vb==null);if(!cmp)cmp=typeof va==='string'?va.localeCompare(vb):((va??0)-(vb??0));return state.desc?-cmp:cmp});$('rows').innerHTML=items.length?items.map(c=>{const spark=state.range==='7d'?(c.sparkline_in_7d?.price||[]):[];return '<tr data-coin="'+escape(c.id)+'" class="'+(c.symbol==='inj'?'inj':'')+'"><td>'+c.market_cap_rank+'</td><td><button class="asset" data-id="'+escape(c.id)+'"><img src="'+escape(c.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer"><span><strong>'+escape(c.name)+'</strong><small>'+escape(c.symbol.toUpperCase())+'</small></span></button></td><td class="live-price-cell"><span class="live-price'+(state.priceRefreshDirections?.get(c.id)?' price-pulse price-'+state.priceRefreshDirections.get(c.id):'')+'"><span class="price-amount">'+money(c.current_price)+'</span><span class="price-tick-arrow" aria-hidden="true">'+(state.priceRefreshDirections?.get(c.id)==='rise'?'↗':state.priceRefreshDirections?.get(c.id)==='fall'?'↘':'')+'</span></span></td>'+frames.map(k=>{return '<td class="percent-cell '+tone(change(c,k))+'"><span data-frame="'+k+'" class="percent-value">'+pct(change(c,k))+'</span></td>'}).join('')+'<td>'+money(c.market_cap,true)+'</td><td>'+money(c.total_volume,true)+'</td><td><button class="chartbtn" data-id="'+escape(c.id)+'" title="Apri grafico '+escape(c.name)+'" style="background:none;border:0;padding:0;cursor:pointer">'+(spark.length?seriesSvg(spark):'<span style="color:var(--muted)">'+t('open')+'</span>')+'</button></td></tr>'}).join(''):'<tr><td colspan="10" class="empty">'+(state.coins.length?t('noResults'):t('noMarket'))+'</td></tr>'; $('graphLabel').textContent=state.range.toUpperCase();$('chartNote').textContent=state.range==='7d'?t('graphNote7'):t('graphNoteOther',{periodo:state.range.toUpperCase()});}function summary(){let a=state.coins,up=a.filter(c=>change(c,'24h')>0).length,down=a.filter(c=>change(c,'24h')<0).length;$('breadth').textContent=up+' ↑ / '+down+' ↓';$('breadthMeta').textContent=t('rising');$('currency').textContent=state.currency.toUpperCase()+' '+sym();$('foot').textContent=t('updated')+new Date(state.last).toLocaleTimeString(marketLocale())+t('nontick');}async function getJson(url,signal){let r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store',signal});if(!r.ok)throw new Error(r.status===429?t('limit'):'HTTP '+r.status);return r.json()}async function load(force=false){if(state.busy||(!force&&document.hidden))return;state.busy=true;$('status').textContent=state.coins.length?t('updating'):t('connectingCg');try{let controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),17000);let a;try{a=await getJson(API+'/coins/markets?vs_currency='+state.currency+'&order=market_cap_desc&per_page=200&page=1&sparkline=true&price_change_percentage=1h%2C24h%2C7d%2C30d',controller.signal)}finally{clearTimeout(timeout)}if(!Array.isArray(a)||!a.length)throw new Error(t('empty'));
  const previousPrices=new Map(state.coins.map(c=>[c.id,c.current_price]));
  state.priceRefreshDirections=new Map();
  for(const coin of a){
    const old=previousPrices.get(coin.id);
    if(Number.isFinite(old)&&Number.isFinite(coin.current_price)&&old!==coin.current_price&&money(old)!==money(coin.current_price)){
      state.priceRefreshDirections.set(coin.id,coin.current_price>old?'rise':'fall');
    }
  }
  state.coins=a;state.last=Date.now();state.priceSnapshot=new Map(a.map(c=>[c.id,{price:c.current_price,percent:Object.fromEntries(frames.map(k=>[k,change(c,k)]))}]));const cryptoVolume=a.reduce((sum,c)=>sum+(Number.isFinite(c.total_volume)&&c.total_volume>0?c.total_volume:0),0);$('globalVolume').textContent=cryptoVolume>0?money(cryptoVolume,true):'—';$('globalVolume').title=t('volumeScopeHint');render();state.scrollDirections.clear();state.priceRefreshDirections.clear();summary();startStreams();updateConnectionStatus()}catch(e){$('status').textContent='⚠ '+(e.name==='AbortError'?t('timeout'):e.message)+' · '+t('retry');render()}finally{state.busy=false}}async function global(){try{let g=(await getJson(API+'/global')).data;$('globalCap').textContent=money(g.total_market_cap?.[state.currency],true);$('dominance').textContent=(g.market_cap_percentage?.btc??0).toFixed(1)+'%'}catch(e){/* global stats optional */}}async function detail(id){let c=state.coins.find(x=>x.id===id);if(!c)return;state.selected=id;$('detailName').textContent=c.name+' ('+c.symbol.toUpperCase()+')';$('detailInfo').textContent=money(c.current_price)+' · '+pct(change(c,'24h'))+' 24H';$('detailStats').innerHTML=[['Market Cap',money(c.market_cap,true)],['Volume 24H',money(c.total_volume,true)],['1H',pct(change(c,'1h'))],['24H',pct(change(c,'24h'))],['7D',pct(change(c,'7d'))],['30D',pct(change(c,'30d'))]].map(([k,v])=>'<article><small>'+k+'</small><strong>'+v+'</strong></article>').join('');$('detail').showModal();$('detailChart').innerHTML='';$('detailStatus').textContent=t('chartLoading')+state.range+'…';let ranges={'1h':'1','1d':'1','7d':'7','30d':'30','90d':'90','1y':'365'},days=ranges[state.range];try{let data=await getJson(API+'/coins/'+encodeURIComponent(id)+'/market_chart?vs_currency='+state.currency+'&days='+days+'&precision=full');if(state.selected!==id||!$('detail').open)return;let points=(data.prices||[]).map(v=>v[1]);$('detailChart').innerHTML=seriesSvg(points,500,180);$('detailStatus').textContent=t('historical')+state.range.toUpperCase()+t('historicalTail');}catch(e){$('detailChart').textContent=t('chartUnavailable');$('detailStatus').textContent='API: '+e.message+t('apiLimits');}}
// Streaming delle coppie USDT disponibili su Binance; CoinGecko resta la fonte
// per tutte le 200 crypto, ranking, capitalizzazione e volumi. Le coppie assenti
// proseguono con aggiornamenti periodici CoinGecko e non vengono chiamate live.
function updateConnectionStatus(){
 const when=state.last?new Date(state.last).toLocaleTimeString(marketLocale()):'—';
 $('status').textContent=state.liveCount>0?t('realtime')+state.liveCount+t('streamSuffix')+when:'● CoinGecko '+when+t('connectingStream');
}
function stopStreams(){
 if(state.socketTimer){clearTimeout(state.socketTimer);state.socketTimer=null}
 for(const socket of state.sockets){socket.onclose=null;socket.onerror=null;try{socket.close()}catch(_){}}
 state.sockets=[];state.liveCount=0;state.livePriceTimes.clear();
}
// Trading Terminal: update only changed price glyphs; percent values never move.
function flashPrice(el,direction,nextText){
 if(!el)return;
 const amount=el.querySelector('.price-amount');
 if(!amount)return;
 const previous=Array.from(amount.textContent||'');
 const next=Array.from(nextText);
 const fragment=document.createDocumentFragment();
 // Compare from right to left, so thousands separators and currency symbols
 // do not cause every unchanged digit to animate when the price grows.
 for(let i=0;i<next.length;i++){
   const char=next[i],was=previous[previous.length-next.length+i];
   const unit=document.createElement('span');
   unit.className='price-digit';
   if(/\d/.test(char)&&char!==was)unit.classList.add('price-digit-changed',direction==='rise'?'digit-rise':'digit-fall');
   unit.textContent=char;
   fragment.appendChild(unit);
 }
 amount.replaceChildren(fragment);
 const arrow=el.querySelector('.price-tick-arrow');
 if(arrow)arrow.textContent=direction==='rise'?'↗':'↘';
 el.classList.remove('price-pulse','price-rise','price-fall');
 // Restart the transient terminal effect for this particular quote only.
 void el.offsetWidth;
 el.classList.add('price-pulse',direction==='rise'?'price-rise':'price-fall');
}
function streamTick(data){
 if(!data||!data.s||!data.c)return;
 const coin=state.pairCoins.get(data.s);
 if(!coin)return;
 const raw=Number(data.c);if(!Number.isFinite(raw)||raw<=0)return;
 // Conversione indicativa USDT -> valuta visualizzata; il fattore EUR/USD è
 // riconciliato al prezzo CoinGecko quando si crea la connessione.
 const base=state.priceSnapshot.get(coin.id);
 if(!base||!Number.isFinite(base.price)||base.price<=0)return;
 if(!coin.__streamRatio)coin.__streamRatio=base.price/raw;
 const price=raw*coin.__streamRatio,old=coin.current_price;
 if(!Number.isFinite(old)||Math.abs(price-old)<1e-12)return;
 const direction=price>old?'rise':'fall';
 coin.current_price=price;
 for(const k of frames){
   const starting=base.percent[k];
   if(!Number.isFinite(starting))continue;
   const reference=base.price/(1+starting/100);
   if(reference<=0)continue;
   coin['price_change_percentage_'+k+'_in_currency']=(price/reference-1)*100;
 }
 const row=Array.from($('rows').querySelectorAll('tr[data-coin]')).find(el=>el.dataset.coin===coin.id);
 if(row){
   const value=row.querySelector('.live-price');
   if(value){const oldLabel=value.querySelector('.price-amount')?.textContent||'';const next=money(price);if(next!==oldLabel)flashPrice(value,direction,next)}
   // Percentages stay anchored in place: no vertical roll, glow or movement.
   // Refresh the written numbers at most every 1.8 s to keep them readable.
   const now=Date.now();
   if(!coin.__percentPaintAt||now-coin.__percentPaintAt>=1800){
     row.querySelectorAll('[data-frame]').forEach(el=>{
       const k=el.dataset.frame,nextValue=change(coin,k),next=pct(nextValue);
       if(el.textContent===next)return;
       el.textContent=next;
       el.parentElement.classList.remove('up','down','neutral');
       el.parentElement.classList.add(tone(nextValue));
     });
     coin.__percentPaintAt=now;
   }
 }
 if(!state.livePriceTimes.has(coin.id)){
    state.livePriceTimes.set(coin.id,Date.now());state.liveCount=state.livePriceTimes.size;updateConnectionStatus();
 }
}
function startStreams(){
 stopStreams();if(document.hidden||!state.coins.length)return;
 const seen=new Set();state.pairCoins=new Map();
 for(const coin of state.coins){
   coin.__streamRatio=0;
   const symbol=String(coin.symbol||'').toUpperCase();
   if(!/^[A-Z0-9]{2,15}$/.test(symbol)||seen.has(symbol))continue;
   seen.add(symbol);
   // Alcuni ticker condividono simboli fra asset diversi: non attribuire
   // falsamente prezzi a una moneta senza corrispondenza univoca.
   if(state.coins.filter(c=>c.symbol.toUpperCase()===symbol).length!==1)continue;
   state.pairCoins.set(symbol+'USDT',coin);
 }
 const pairs=[...state.pairCoins.keys()];
 for(let i=0;i<pairs.length;i+=70){
   const streams=pairs.slice(i,i+70).map(x=>x.toLowerCase()+'@miniTicker').join('/');
   try{
    const ws=new WebSocket('wss://stream.binance.com:9443/stream?streams='+streams);
    ws.onmessage=ev=>{try{const msg=JSON.parse(ev.data);streamTick(msg.data||msg)}catch(_){}};
    ws.onerror=()=>{};
    ws.onclose=()=>{if(!document.hidden && state.sockets.includes(ws) && !state.socketTimer){state.socketTimer=setTimeout(()=>{state.socketTimer=null;startStreams()},6000)}};
    state.sockets.push(ws);
   }catch(_){/* Disponibilità streaming dipendente dalla rete dell'utente */}
 }
 updateConnectionStatus();
}
window.marketOnLanguageChange=()=>{if(state.coins.length){render();summary();updateConnectionStatus();}else{const placeholder=$('rows').querySelector('.empty');if(placeholder)placeholder.textContent=t('loading');$('status').textContent=t('connectingCg');$('foot').textContent=t('provider');$('chartNote').textContent=state.range==='7d'?t('graphNote7'):t('graphNoteOther',{periodo:state.range.toUpperCase()});}};$('rows').addEventListener('click',e=>{let b=e.target.closest('[data-id]');if(b)detail(b.dataset.id)});$('closeDetail').onclick=()=>{$('detail').close();state.selected=null};$('detail').addEventListener('close',()=>state.selected=null);$('search').oninput=render;$('scope').onchange=render;$('direction').onchange=render;document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{if(state.sort===b.dataset.sort)state.desc=!state.desc;else{state.sort=b.dataset.sort;state.desc=state.sort!=='market_cap_rank'&&state.sort!=='name'}render()});$('ranges').onclick=e=>{let b=e.target.closest('[data-range]');if(!b)return;state.range=b.dataset.range;document.querySelectorAll('[data-range]').forEach(x=>x.classList.toggle('active',x===b));render()};$('currency').onclick=()=>{state.currency=state.currency==='usd'?'eur':'usd';state.previousPercentages.clear();state.scrollDirections.clear();$('globalVolume').textContent='—';$('currency').textContent=state.currency.toUpperCase()+' '+sym();load(true)};$('refresh').onclick=()=>{load(true);global()};load(true);global();setInterval(()=>load(),90000);setInterval(()=>{if(!document.hidden)global()},300000);document.addEventListener('visibilitychange',()=>{if(document.hidden){stopStreams()}else{if(Date.now()-state.last>90000)load();else startStreams()}});})();