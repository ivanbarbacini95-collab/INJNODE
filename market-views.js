/* INJ Node — Global Crypto / Heatmap: two independent sections, one live data feed. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const global=$('injGlobalMarket'),heat=$('marketHeatmap'),list=$('hybridPro'),rows=$('marketProRows');
 const grid=$('marketHeatmapGrid'),legacy=global?.querySelector('.tablewrap');
 if(!global||!heat||!list||!rows||!grid||!legacy)return;
 const key='inj_node_market_heat_range_v1',en=()=>document.documentElement.lang==='en',tr=(it,eng)=>en()?eng:it;
 const rangeChoices=['1h','24h','7d','30d'];
 const read=()=>{try{return localStorage.getItem(key)}catch(_){return null}};
 const save=value=>{try{localStorage.setItem(key,value)}catch(_){}};
 const api=()=>window.INJ_MARKET_VIEW_API;
 const num=x=>x===undefined||x===null||x===''?NaN:Number(x);
 const finite=x=>Number.isFinite(num(x));
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(value,compact=false)=>api()?.formatMoney?.(num(value),compact)||'—';
 const percent=value=>api()?.formatPercent?.(num(value))||'—';
 const change=(coin,frame)=>num(api()?.getChange?.(coin,frame));
 const tone=v=>!Number.isFinite(v)?'flat':v>0?'up':v<0?'down':'flat';
 let mode='list',range=rangeChoices.includes(read())?read():'24h';
 let listTiles=new Map(),mapTiles=new Map(),pending=new Set(),renderQueued=false,timer=null;
 const all=()=>api()?.getCoins?.()||[];
 // Applies exclusively to the Heatmap. Global Crypto preserves the full Top 200.
 // Match identifiers/names as well as tickers; do not filter native BTC, ETH, SOL or INJ.
 const stableSymbols=new Set(['USDT','USDC','DAI','USDS','USDE','USDD','USD1','PYUSD','FDUSD','TUSD','FRAX','LUSD','GUSD','PAX','USDP','RLUSD','USDY','USD0','CRVUSD','GHO','EURI','EURC','EUROC','AEUR','SUSD','USDB','USDT0','BUSD','USTC','MIM','CUSD','USDF','BFUSD','USDX']);
 const wrappedSymbols=new Set(['WBTC','WETH','WBETH','WSTETH','STETH','WEETH','EETH','CBETH','CBBTC','BTCB','BBTC','TBTC','FBTC','RETH','SFRXETH','WBNB','WSOL','WMATIC','WPOL','WAVAX','WFTM','WTRX','WSTUSR','WUSDM','WRSETH','RSETH','EZETH']);
 const stableIds=new Set(['tether','usd-coin','dai','usds','ethena-usde','first-digital-usd','paypal-usd','world-liberty-financial-usd','frax','frax-usd','pax-dollar','paxos-standard','true-usd','gemini-dollar','ripple-usd','global-dollar','usual-usd','sky-dollar','usdd','liquity-usd','gho','curve-usd','euro-coin','euro-coinvertible','binance-usd','magic-internet-money','stasis-eurs','usd1']);
 function heatmapEligible(coin){
  const symbol=String(coin.symbol||'').trim().toUpperCase();
  const id=String(coin.id||'').trim().toLowerCase();
  const name=String(coin.name||'').trim().toLowerCase();
  if(stableSymbols.has(symbol)||wrappedSymbols.has(symbol)||stableIds.has(id))return false;
  if(/^(wrapped|bridged|binance-peg|wormhole|coinbase-wrapped|synthetic|liquid-staked|liquid-staking|wrapped-staked|staked|restaked|restaking)[-\s]/i.test(id)||/^(wrapped|bridged|binance-peg|wormhole|coinbase wrapped|synthetic|liquid staked|staked|restaked)\b/.test(name))return false;
  if(/\b(stablecoin|stable coin|bridged usdt|bridged usdc|wrapped bitcoin|wrapped ethereum|wrapped ether|wrapped btc|wrapped eth)\b/.test(name))return false;
  return true;
 }
 function filtered(){
  const count=Number($('scope')?.value)||200;
  const query=String($('search')?.value||'').trim().toLowerCase();
  const direction=$('direction')?.value||'all';
  const eligible=mode==='heatmap'?all().filter(heatmapEligible):all();
  return eligible.slice(0,count).filter(coin=>{
   if(query&&!String(coin.name+' '+coin.symbol).toLowerCase().includes(query))return false;
   const day=change(coin,'24h');
   return direction==='all'||(direction==='up'&&Number.isFinite(day)&&day>=0)||(direction==='down'&&Number.isFinite(day)&&day<0);
  });
 }
 function ranked(items){return [...items].sort((a,b)=>(finite(a.market_cap_rank)?num(a.market_cap_rank):99999)-(finite(b.market_cap_rank)?num(b.market_cap_rank):99999))}
 function sorted(items){
  const sort=$('marketProSort')?.value||'rank';
  if(sort==='rank')return ranked(items);
  const values={change:c=>change(c,'24h'),volume:c=>num(c.total_volume),price:c=>num(c.current_price)};
  const get=values[sort]||values.change;
  return [...items].sort((a,b)=>{
   const va=get(a),vb=get(b);
   return (finite(vb)?vb:-Infinity)-(finite(va)?va:-Infinity);
  });
 }
 function spark(coin){
  const source=coin.sparkline_in_7d?.price;
  if(!Array.isArray(source)||source.length<2)return '—';
  const data=source.map(num).filter(Number.isFinite);
  if(data.length<2)return '—';
  const stride=Math.max(1,Math.ceil(data.length/35));
  const sample=data.filter((_,i)=>i%stride===0||i===data.length-1);
  const low=Math.min(...sample),high=Math.max(...sample),span=high-low||1;
  const points=sample.map((v,i)=>((100*i)/(sample.length-1)).toFixed(1)+','+(36-(v-low)/span*31).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" class="mp-spark '+tone(sample.at(-1)-sample[0])+'"><polyline points="'+points+'"/></svg>';
 }
 function pctHtml(coin,k){
  const v=change(coin,k);return '<span class="mp-percent mp-'+k+' '+tone(v)+'">'+escape(percent(v))+'</span>';
 }
 function rowHtml(coin){
  const rank=finite(coin.market_cap_rank)?'#'+num(coin.market_cap_rank):'—';
  const symbol=String(coin.symbol||'').toUpperCase();
  return '<button type="button" class="mp-row" data-coin="'+escape(coin.id)+'" data-previous-price="'+escape(coin.current_price)+'" aria-label="'+escape(coin.name+' '+symbol)+'">'+
  '<span class="mp-identity"><span class="mp-rank">'+rank+'</span><img loading="lazy" referrerpolicy="no-referrer" src="'+escape(coin.image||'')+'" alt=""><span class="mp-name"><strong>'+escape(coin.name)+'</strong><small>'+escape(symbol)+'</small></span></span>'+
  '<span class="mp-price"><strong class="mp-price-value">'+escape(money(coin.current_price))+'</strong><small class="mp-mobile-label">'+escape(money(coin.market_cap,true))+' Cap</small></span>'+
  '<span class="mp-change mp-hour">'+pctHtml(coin,'1h')+'</span>'+
  '<span class="mp-change mp-day">'+pctHtml(coin,'24h')+'</span>'+
  '<span class="mp-change mp-week">'+pctHtml(coin,'7d')+'</span>'+
  '<span class="mp-change mp-month">'+pctHtml(coin,'30d')+'</span>'+
  '<span class="mp-stat mp-cap">'+escape(money(coin.market_cap,true))+'</span>'+
  '<span class="mp-stat mp-volume">'+escape(money(coin.total_volume,true))+'</span>'+
  '<span class="mp-chart">'+spark(coin)+'</span></button>';
 }
 function renderList(items){
  const coins=sorted(items),template=document.createElement('template'),next=new Map();
  template.innerHTML=coins.length?coins.map(rowHtml).join(''):'<div class="mp-empty">'+
   (all().length?tr('Nessun risultato','No results'):tr('Caricamento criptovalute…','Loading cryptocurrencies…'))+'</div>';
  rows.replaceChildren(template.content);
  rows.querySelectorAll('[data-coin]').forEach(el=>next.set(el.dataset.coin,el));
  listTiles=next;
  $('mpMetaCount').textContent=tr('Crypto visualizzate: ','Displayed assets: ')+coins.length;
 }
 function tile(coin){
  const v=change(coin,range),node=document.createElement('button');
  node.type='button';node.className='heatmap-tile';node.dataset.coin=coin.id;node.dataset.previousPrice=String(coin.current_price);
  if(coin.id==='injective-protocol')node.classList.add('is-inj');
  const sym=document.createElement('strong');sym.className='hm-symbol';sym.textContent=String(coin.symbol||'').toUpperCase();
  const value=document.createElement('span');value.className='hm-change';
  const price=document.createElement('small');price.className='hm-price';
  node.append(sym,value,price);
  recolor(node,coin,v);
  return node;
 }
 function recolor(node,coin,newValue){
  const delta=newValue===undefined?change(coin,range):newValue;
  node.classList.toggle('is-up',delta>0);
  node.classList.toggle('is-down',delta<0);
  node.classList.toggle('is-flat',!Number.isFinite(delta)||delta===0);
  const strength=Number.isFinite(delta)?Math.min(58,22+Math.log1p(Math.abs(delta))*13):0;
  node.style.setProperty('--heat-fill',strength.toFixed(0)+'%');
  node.style.setProperty('--heat-rim',(Math.min(78,Math.max(30,strength+13))).toFixed(0)+'%');
  const label=percent(delta),price=money(coin.current_price);
  const p=node.querySelector('.hm-change'),priceNode=node.querySelector('.hm-price');
  if(p&&p.textContent!==label)p.textContent=label;
  if(priceNode&&priceNode.textContent!==price)priceNode.textContent=price;
  node.dataset.displayPrice=price;
  const text=coin.name+' ('+String(coin.symbol||'').toUpperCase()+') · '+range.toUpperCase()+' '+label+' · '+price;
  node.setAttribute('aria-label',text);
  node.title=text;
 }
 function renderMap(items){
  const coins=ranked(items),fragment=document.createDocumentFragment(),next=new Map();
  if(coins.length){
   for(const coin of coins){const el=tile(coin);fragment.append(el);next.set(coin.id,el)}
  }else{
   const empty=document.createElement('div');empty.className='heatmap-empty';
   empty.textContent=all().length?tr('Nessuna crypto corrisponde ai filtri','No matching cryptocurrencies'):tr('Caricamento dati di mercato…','Loading market data…');
   fragment.append(empty);
  }
  grid.replaceChildren(fragment);
  mapTiles=next;
  $('heatmapCount').textContent=tr('Crypto visualizzate: ','Displayed assets: ')+coins.length;
 }
 function render(){
  if(global.hidden)return;
  const coins=filtered();
  if(mode==='heatmap')renderMap(coins);
  else renderList(coins);
 }
 function requestRender(){
  if(renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{renderQueued=false;render()});
 }
 function setView(next){
  mode=next==='heatmap'?'heatmap':'list';
  document.documentElement.dataset.marketMode=mode;
  list.hidden=mode!=='list';
  heat.hidden=mode!=='heatmap';
  legacy.hidden=true;
  $('marketProSort').hidden=mode==='heatmap';
  $('marketHeading').textContent=mode==='heatmap'?'Market Heatmap':tr('Global Crypto','Global Crypto');
  requestRender();
 }
 function setRange(next){
  if(!rangeChoices.includes(next))return;
  range=next;save(range);
  heat.querySelectorAll('[data-heat-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.heatRange===range)));
  const byId=new Map(all().map(c=>[c.id,c]));
  for(const [id,element] of mapTiles){
   const coin=byId.get(id);
   if(coin)recolor(element,coin);
  }
 }
 // Flash only actual visible price changes. A short finite pulse, not a permanent glow.
 function priceFlash(element,direction,tile=false){
  if(!element||!direction||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const rise=direction==='up'?'market-flash-up':'market-flash-down';
  element.classList.remove('market-flash-up','market-flash-down');
  // Re-arm a completed animation without replacing any live text or DOM structure.
  void element.offsetWidth;
  element.classList.add(rise);
 }
 function tick(coin){
  if(global.hidden)return;
  const active=mode==='heatmap'?mapTiles:listTiles;
  if(!active.has(coin.id))return;
  pending.add(coin.id);
  if(timer)return;
  timer=setTimeout(()=>{
   timer=null;
   const byId=new Map(all().map(c=>[c.id,c]));
   for(const id of pending){
    const current=byId.get(id),element=active.get(id);
    if(!element||!current)continue;
    if(mode==='heatmap'){
     const old=element.dataset.displayPrice,next=money(current.current_price);
     recolor(element,current);
     if(old&&old!==next)priceFlash(element,current.current_price>Number(element.dataset.previousPrice||0)?'up':'down',true);
     element.dataset.previousPrice=String(current.current_price);
     continue;
    }
    const price=element.querySelector('.mp-price-value'),next=money(current.current_price);
    if(price&&price.textContent!==next){
     const prior=Number(element.dataset.previousPrice||0);
     price.textContent=next;
     if(prior>0)priceFlash(price,current.current_price>prior?'up':'down');
    }
    element.dataset.previousPrice=String(current.current_price);
    for(const k of ['1h','24h','7d','30d']){
     const span=element.querySelector('.mp-'+k);
     if(!span)continue;
     const value=change(current,k);
     span.textContent=percent(value);
     span.className='mp-percent mp-'+k+' '+tone(value);
    }
   }
   pending.clear();
  },1500);
 }
 function languageChange(){
  $('marketProSort').setAttribute('aria-label',tr('Ordina Global Crypto','Sort Global Crypto'));
  $('heatmapCount').textContent=tr('Crypto visualizzate: ','Displayed assets: ')+mapTiles.size;
  $('heatmapNote').textContent=tr('Verde: rialzo · Rosso: ribasso','Green: up · Red: down');
  $('marketHeading').textContent=mode==='heatmap'?'Market Heatmap':'Global Crypto';
  requestRender();
 }
 $('heatmapRanges').addEventListener('click',e=>{
  const b=e.target.closest('[data-heat-range]');if(b)setRange(b.dataset.heatRange);
 });
 $('marketProSort').addEventListener('change',requestRender);
 rows.addEventListener('click',e=>{const b=e.target.closest('[data-coin]');if(b)api()?.open?.(b.dataset.coin)});
 grid.addEventListener('click',e=>{const b=e.target.closest('[data-coin]');if(b)api()?.open?.(b.dataset.coin)});
 window.INJ_MARKET_VIEWS={render:requestRender,tick,setView,languageChange};
 setRange(range);
 setView('list');
})();