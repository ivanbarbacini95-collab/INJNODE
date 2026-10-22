/* INJ NODE · Global Market v2 — frameless Hybrid Pro + true fullscreen heatmap.
   One data source: existing CoinGecko markets and optional Binance price streams. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const global=$('injGlobalMarket'),heat=$('marketHeatmap'),hybrid=$('hybridPro'),legacy=global?.querySelector('.tablewrap');
 const listBtn=$('marketListMode'),heatBtn=$('marketHeatMode');
 const hero=$('marketHeatmapGrid'),universe=$('marketHeatmapMore'),rows=$('marketProRows');
 if(!global||!heat||!hybrid||!legacy||!hero||!universe||!rows||!listBtn||!heatBtn)return;
 const KEY='inj_node_market_view_v1',RANGE_KEY='inj_node_market_heat_range_v1';
 const read=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch(_){return fallback}};
 const save=(key,value)=>{try{localStorage.setItem(key,value)}catch(_){}};
 const api=()=>window.INJ_MARKET_VIEW_API;
 const en=()=>document.documentElement.lang==='en';
 const tr=(it,eng)=>en()?eng:it;
 const numeric=value=>value==null||value===''?NaN:(Number.isFinite(Number(value))?Number(value):NaN);
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const money=(value,compact=false)=>api()?.formatMoney?.(numeric(value),compact)||'—';
 const pct=value=>api()?.formatPercent?.(numeric(value))||'—';
 const change=(coin,r)=>numeric(api()?.getChange?.(coin,r));
 const ranges=['1h','24h','7d','30d'];
 let view=read(KEY,'list')==='heatmap'?'heatmap':'list';
 let range=ranges.includes(read(RANGE_KEY,'24h'))?read(RANGE_KEY,'24h'):'24h';
 let lastList=new Map(),lastMap=new Map(),paintQueued=false,tickTimer=0;
 const dirty=new Set();
 const MAIN_FILTERS={heatmapSearch:'search',heatmapScope:'scope',heatmapDirection:'direction'};
 // Fixed-position elements inside a transformed ancestor can clip on iOS;
 // attach the heatmap to the document itself to guarantee true viewport coverage.
 document.body.append(heat);
 function syncControls(){
  for(const [mirror,original] of Object.entries(MAIN_FILTERS)){
   const target=$(mirror),source=$(original);
   if(target&&source&&target.value!==source.value)target.value=source.value;
  }
  const main=$('currency');
  if(main&&$('heatmapCurrency'))$('heatmapCurrency').textContent=main.textContent;
 }
 function filtered(){
  const coins=api()?.getCoins?.()||[];
  const limit=Number($('scope')?.value)||200;
  const q=String($('search')?.value||'').trim().toLowerCase();
  const direction=$('direction')?.value||'all';
  return coins.slice(0,limit).filter(coin=>{
   if(q&&!String(coin.name+' '+coin.symbol).toLowerCase().includes(q))return false;
   const day=change(coin,'24h');
   return direction==='all'||(direction==='up'?Number.isFinite(day)&&day>=0:Number.isFinite(day)&&day<0);
  });
 }
 function sorted(items,mode){
  const arr=[...items];
  if(mode==='change')arr.sort((a,b)=>(Number.isFinite(change(b,'24h'))?change(b,'24h'):-Infinity)-(Number.isFinite(change(a,'24h'))?change(a,'24h'):-Infinity));
  else if(mode==='volume')arr.sort((a,b)=>(numeric(b.total_volume)||0)-(numeric(a.total_volume)||0));
  else if(mode==='price')arr.sort((a,b)=>(numeric(b.current_price)||0)-(numeric(a.current_price)||0));
  else arr.sort((a,b)=>(numeric(a.market_cap_rank)||9999)-(numeric(b.market_cap_rank)||9999));
  return arr;
 }
 function marketSparkline(coin){
  const input=coin.sparkline_in_7d?.price;
  if(!Array.isArray(input)||input.length<2)return '<span class="mp-chart-empty">—</span>';
  const vals=input.map(numeric).filter(Number.isFinite);
  if(vals.length<2)return '<span class="mp-chart-empty">—</span>';
  const sample=vals.filter((_,i)=>i%Math.max(1,Math.floor(vals.length/32))===0||i===vals.length-1);
  const min=Math.min(...sample),max=Math.max(...sample),span=max-min||1;
  const pts=sample.map((v,i)=>(i/(sample.length-1)*100).toFixed(1)+','+(36-(v-min)/span*31).toFixed(1)).join(' ');
  const tone=sample.at(-1)>=sample[0]?'up':'down';
  return '<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" class="mp-spark '+tone+'"><polyline points="'+pts+'"/></svg>';
 }
 function tone(v){return !Number.isFinite(v)?'flat':v>0?'up':v<0?'down':'flat'}
 function percentSpan(coin,r){
  const v=change(coin,r);
  return '<span class="mp-percent mp-'+r+' '+tone(v)+'">'+escape(pct(v))+'</span>';
 }
 function hybridRow(coin){
  const symbol=String(coin.symbol||'').toUpperCase();
  const rank=Number.isFinite(numeric(coin.market_cap_rank))?'#'+coin.market_cap_rank:'—';
  return '<button type="button" class="mp-row'+(coin.id==='injective-protocol'?' is-inj':'')+'" data-coin="'+escape(coin.id)+'" aria-label="'+escape(coin.name+' '+symbol)+'">'+
   '<span class="mp-identity"><span class="mp-rank">'+escape(rank)+'</span><img loading="lazy" referrerpolicy="no-referrer" src="'+escape(coin.image||'')+'" alt=""><span class="mp-name"><strong>'+escape(coin.name)+'</strong><small>'+escape(symbol)+'</small></span></span>'+
   '<span class="mp-price"><strong class="mp-price-value">'+escape(money(coin.current_price))+'</strong><small class="mp-mobile-label">'+escape(money(coin.market_cap,true))+' '+tr('Cap','Cap')+'</small></span>'+
   '<span class="mp-change mp-hour">'+percentSpan(coin,'1h')+'</span>'+
   '<span class="mp-change mp-day">'+percentSpan(coin,'24h')+'</span>'+
   '<span class="mp-change mp-week">'+percentSpan(coin,'7d')+'</span>'+
   '<span class="mp-change mp-month">'+percentSpan(coin,'30d')+'</span>'+
   '<span class="mp-stat mp-cap">'+escape(money(coin.market_cap,true))+'</span>'+
   '<span class="mp-stat mp-volume">'+escape(money(coin.total_volume,true))+'</span>'+
   '<span class="mp-chart">'+marketSparkline(coin)+'</span>'+
   '</button>';
 }
 function renderHybrid(items){
  const coins=sorted(items,$('marketProSort')?.value||'rank');
  const list=new Map();
  const fragment=document.createDocumentFragment();
  if(!coins.length){
   const empty=document.createElement('div');empty.className='mp-empty';
   empty.textContent=(api()?.getCoins?.()?.length||0)?tr('Nessuna crypto corrisponde ai filtri','No coins match these filters'):tr('Caricamento delle quotazioni…','Loading market quotations…');
   fragment.append(empty);
  }else{
   const template=document.createElement('template');
   template.innerHTML=coins.map(hybridRow).join('');
   while(template.content.firstElementChild)fragment.append(template.content.firstElementChild);
  }
  rows.replaceChildren(fragment);
  rows.querySelectorAll('[data-coin]').forEach(element=>list.set(element.dataset.coin,element));
  lastList=list;
  $('mpMetaCount').textContent=tr('Crypto visualizzate: ','Displayed assets: ')+coins.length;
 }
 function heatStyle(tile,coin){
  const value=change(coin,range);
  const direction=tone(value);
  const strength=Number.isFinite(value)?Math.min(60,17+Math.log1p(Math.abs(value))*15):0;
  tile.classList.toggle('is-up',direction==='up');
  tile.classList.toggle('is-down',direction==='down');
  tile.classList.toggle('is-flat',direction==='flat');
  tile.style.setProperty('--heat-fill',strength.toFixed(1)+'%');
  const p=tile.querySelector('.hm-change'),price=tile.querySelector('.hm-price');
  const nextPct=pct(value),nextPrice=money(coin.current_price);
  if(p&&p.textContent!==nextPct)p.textContent=nextPct;
  if(price&&price.textContent!==nextPrice)price.textContent=nextPrice;
  const label=coin.name+' ('+String(coin.symbol||'').toUpperCase()+') · '+range.toUpperCase()+' '+nextPct+' · '+nextPrice;
  if(tile.getAttribute('aria-label')!==label)tile.setAttribute('aria-label',label);
  tile.title=label;
 }
 function heatTile(coin,major){
  const rank=Number.isFinite(numeric(coin.market_cap_rank))?'#'+coin.market_cap_rank:'';
  const symbol=String(coin.symbol||'').toUpperCase();
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='heatmap-tile'+(major?' hm-feature':' hm-universe')+(coin.id==='injective-protocol'?' is-inj':'');
  btn.dataset.coin=coin.id;
  const top=document.createElement('span');top.className='hm-header';
  const sym=document.createElement('strong');sym.className='hm-symbol';sym.textContent=symbol;
  const index=document.createElement('small');index.className='hm-rank';index.textContent=rank;
  top.append(sym,index);
  const body=document.createElement('span');body.className='hm-change';
  const price=document.createElement('small');price.className='hm-price';
  const name=document.createElement('small');name.className='hm-name';name.textContent=coin.name;
  btn.append(top,body,price,name);
  heatStyle(btn,coin);
  return btn;
 }
 function renderHeatmap(items){
  const sortedCoins=sorted(items,'rank');
  const featured=sortedCoins.slice(0,8);
  const remaining=sortedCoins.slice(8);
  const newMap=new Map(),leadFrag=document.createDocumentFragment(),restFrag=document.createDocumentFragment();
  for(const coin of featured){
   const element=heatTile(coin,true);leadFrag.append(element);newMap.set(coin.id,element);
  }
  for(const coin of remaining){
   const element=heatTile(coin,false);restFrag.append(element);newMap.set(coin.id,element);
  }
  hero.replaceChildren(leadFrag);
  universe.replaceChildren(restFrag);
  if(!sortedCoins.length){
   const empty=document.createElement('div');
   empty.className='heatmap-empty';
   empty.textContent=(api()?.getCoins?.()?.length||0)?tr('Nessun asset trovato','No matching assets'):tr('Caricamento dati di mercato…','Loading real market data…');
   hero.append(empty);
  }
  lastMap=newMap;
  $('heatmapCount').textContent=tr('Asset visualizzati: ','Displayed assets: ')+sortedCoins.length;
  $('mapUniverseTitle').textContent=tr('Altre crypto','Other cryptocurrencies')+' · '+remaining.length;
 }
 function renderAll(){
  syncControls();
  const items=filtered();
  renderHybrid(items);
  if(view==='heatmap')renderHeatmap(items);
 }
 function scheduleRender(){
  if(paintQueued)return;
  paintQueued=true;
  requestAnimationFrame(()=>{paintQueued=false;renderAll()});
 }
 function updateDisplay(){
  const showingMap=view==='heatmap'&&!global.hidden;
  heat.hidden=!showingMap;
  document.body.classList.toggle('market-map-open',showingMap);
  hybrid.hidden=view!=='list';
  legacy.hidden=true;
  listBtn.setAttribute('aria-pressed',String(view==='list'));
  heatBtn.setAttribute('aria-pressed',String(view==='heatmap'));
  if(showingMap){syncControls();scheduleRender()}
 }
 function setView(next){
  const was=view;view=next==='heatmap'?'heatmap':'list';
  save(KEY,view);
  updateDisplay();
  if(was!==view&&view==='heatmap')$('marketHeatmapScroll').scrollTop=0;
  if(view==='list')scheduleRender();
 }
 function setRange(next){
  if(!ranges.includes(next))return;
  range=next;save(RANGE_KEY,range);
  $('heatmapRanges').querySelectorAll('[data-heat-range]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.heatRange===range)));
  for(const [id,element] of lastMap){
   const coin=(api()?.getCoins?.()||[]).find(x=>x.id===id);
   if(coin)heatStyle(element,coin);
  }
 }
 function languageChange(){
  listBtn.title=tr('Hybrid Pro · vista lista','Hybrid Pro · list view');
  heatBtn.title=tr('Heatmap · tutto schermo','Heatmap · fullscreen');
  listBtn.setAttribute('aria-label',tr('Vista Hybrid Pro','Hybrid Pro view'));
  heatBtn.setAttribute('aria-label',tr('Vista Heatmap a tutto schermo','Fullscreen Heatmap view'));
  $('heatmapSearch').placeholder=tr('Cerca una crypto…','Search coins…');
  $('mapBackToHybrid').setAttribute('aria-label',tr('Torna alla lista Hybrid Pro','Back to Hybrid Pro list'));
  $('mapGoHome').setAttribute('aria-label',tr('Torna alla Home','Back to Home'));
  $('heatmapDescription').textContent=tr('Prezzi e performance reali','Real prices and performance');
  $('heatmapTitle').textContent=tr('Le principali crypto','Market leaders');
  $('heatmapLoss').textContent=tr('Ribasso','Down');
  $('heatmapGain').textContent=tr('Rialzo','Up');
  $('heatmapNote').textContent=tr('I colori mostrano la variazione percentuale, non sono segnali di acquisto','Colors show percentage changes, not trading signals');
  const sort=$('marketProSort');
  if(sort){
   sort.setAttribute('aria-label',tr('Ordina Hybrid Pro','Sort Hybrid Pro'));
   const opts=sort.options;
   if(opts.length>=4){opts[0].textContent='Rank';opts[1].textContent='24H %';opts[2].textContent=tr('Volume','Volume');opts[3].textContent=tr('Prezzo','Price')}
  }
  for(const [id,labels] of Object.entries({heatmapDirection:[tr('Tutte','All'),tr('In rialzo','Gainers'),tr('In ribasso','Losers')]})){
   const element=$(id);
   if(element)Array.from(element.options).forEach((opt,i)=>opt.textContent=labels[i]||opt.textContent);
  }
  scheduleRender();
 }
 listBtn.addEventListener('click',()=>setView('list'));
 heatBtn.addEventListener('click',()=>setView('heatmap'));
 $('mapBackToHybrid').addEventListener('click',()=>setView('list'));
 $('mapGoHome').addEventListener('click',()=>{$('marketBack')?.click()});
 $('heatmapCurrency').addEventListener('click',()=>{$('currency')?.click();requestAnimationFrame(syncControls)});
 $('heatmapRefresh').addEventListener('click',()=>{$('refresh')?.click()});
 $('marketProSort')?.addEventListener('change',scheduleRender);
 $('heatmapRanges').addEventListener('click',event=>{
  const button=event.target.closest('[data-heat-range]');
  if(button)setRange(button.dataset.heatRange);
 });
 for(const [mirror,original] of Object.entries(MAIN_FILTERS)){
  const target=$(mirror),source=$(original);
  if(!target||!source)continue;
  const type=mirror==='heatmapSearch'?'input':'change';
  target.addEventListener(type,()=>{
   source.value=target.value;
   source.dispatchEvent(new Event(type,{bubbles:true}));
  });
  source.addEventListener(type,()=>{
   if(target.value!==source.value)target.value=source.value;
  });
 }
 function openFromClick(event){
  const item=event.target.closest('[data-coin]');
  if(item)api()?.open?.(item.dataset.coin);
 }
 rows.addEventListener('click',openFromClick);
 hero.addEventListener('click',openFromClick);
 universe.addEventListener('click',openFromClick);
 function tick(coin){
  if(global.hidden)return;
  if(view==='list'&&!lastList.has(coin.id))return;
  if(view==='heatmap'&&!lastMap.has(coin.id))return;
  dirty.add(coin.id);
  if(tickTimer)return;
  tickTimer=setTimeout(()=>{
   tickTimer=0;
   const byId=new Map((api()?.getCoins?.()||[]).map(item=>[item.id,item]));
   for(const id of dirty){
    const current=byId.get(id);
    if(!current)continue;
    if(view==='heatmap'){
     const tile=lastMap.get(id);if(tile)heatStyle(tile,current);
    }else{
     const row=lastList.get(id);
     if(!row)continue;
     const price=row.querySelector('.mp-price-value'),next=money(current.current_price);
     if(price&&price.textContent!==next)price.textContent=next;
     for(const k of ranges){
      const el=row.querySelector('.mp-'+k);
      if(el){
       const value=change(current,k);
       const nextPct=pct(value);
       if(el.textContent!==nextPct)el.textContent=nextPct;
       el.className='mp-percent mp-'+k+' '+tone(value);
      }
     }
    }
   }
   dirty.clear();
  },1400);
 }
 global && new MutationObserver(updateDisplay).observe(global,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&view==='heatmap'&&!heat.hidden&&!$('detail')?.open){event.preventDefault();setView('list')}
 });
 window.INJ_MARKET_VIEWS={ownsList:true,render:scheduleRender,tick,languageChange,setView};
 setRange(range);syncControls();languageChange();updateDisplay();
})();