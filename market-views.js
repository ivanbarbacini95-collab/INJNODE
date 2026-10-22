/* INJ Node · Global Market display modes. Reuses the existing CoinGecko/WebSocket feed. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const grid=$('marketHeatmapGrid'), heat=$('marketHeatmap');
 const table=document.querySelector('#injGlobalMarket .tablewrap');
 const listButton=$('marketListMode'),heatButton=$('marketHeatMode');
 if(!grid||!heat||!table||!listButton||!heatButton)return;
 const KEY='inj_node_market_view_v1',RANGE_KEY='inj_node_market_heat_range_v1';
 const api=()=>window.INJ_MARKET_VIEW_API;
 const read=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch(_){return fallback}};
 const save=(key,value)=>{try{localStorage.setItem(key,value)}catch(_){}};
 const en=()=>document.documentElement.lang==='en';
 const tr=(italian,english)=>en()?english:italian;
 const ranges=['1h','24h','7d','30d'];
 let view=read(KEY,'list')==='heatmap'?'heatmap':'list';
 let range=ranges.includes(read(RANGE_KEY,'24h'))?read(RANGE_KEY,'24h'):'24h';
 let layoutPending=false,changeTimer=0,displayed=new Map();
 const safe=v=>Number.isFinite(Number(v))?Number(v):NaN;
 const diff=coin=>safe(api()?.getChange?.(coin,range));
 function filteredCoins(){
  const source=api()?.getCoins?.()||[];
  const limit=Number($('scope')?.value)||200;
  const query=String($('search')?.value||'').trim().toLowerCase();
  const direction=$('direction')?.value||'all';
  return source.slice(0,limit).filter(coin=>{
   if(query&&!String(coin.name+' '+coin.symbol).toLowerCase().includes(query))return false;
   const day=safe(api()?.getChange?.(coin,'24h'));
   return direction==='all'||(direction==='up'?Number.isFinite(day)&&day>=0:Number.isFinite(day)&&day<0);
  }).sort((a,b)=>(safe(b.market_cap)||0)-(safe(a.market_cap)||0));
 }
 function worst(row,short){
  if(!row.length)return Infinity;
  const total=row.reduce((sum,c)=>sum+c.area,0);
  const max=Math.max(...row.map(c=>c.area)),min=Math.max(.00000001,Math.min(...row.map(c=>c.area)));
  return Math.max((short*short*max)/(total*total),(total*total)/(short*short*min));
 }
 // Squarified treemap: each tile area reflects verified market cap (no fabricated weights).
 function treemap(coins,width,height){
  const weights=coins.map(coin=>({coin,weight:Math.max(0,safe(coin.market_cap)||0)}));
  const total=weights.reduce((sum,c)=>sum+c.weight,0);
  const normalized=weights.map(c=>({...c,area:(total>0?c.weight/total:1/Math.max(1,weights.length))*width*height}));
  let x=0,y=0,w=width,h=height,index=0,row=[];
  const out=[];
  function layout(items){
   if(!items.length||w<=0||h<=0)return;
   const area=items.reduce((sum,c)=>sum+c.area,0);
   if(w>=h){
    const stripe=Math.max(.0001,Math.min(w,area/h));
    let cursor=y;
    items.forEach((item,i)=>{
     const size=i===items.length-1?Math.max(0,y+h-cursor):Math.max(0,item.area/stripe);
     out.push({coin:item.coin,x,y:cursor,w:stripe,h:size});cursor+=size;
    });
    x+=stripe;w=Math.max(0,w-stripe);
   }else{
    const stripe=Math.max(.0001,Math.min(h,area/w));
    let cursor=x;
    items.forEach((item,i)=>{
     const size=i===items.length-1?Math.max(0,x+w-cursor):Math.max(0,item.area/stripe);
     out.push({coin:item.coin,x:cursor,y,w:size,h:stripe});cursor+=size;
    });
    y+=stripe;h=Math.max(0,h-stripe);
   }
  }
  while(index<normalized.length){
   const next=normalized[index];
   if(!row.length||worst([...row,next],Math.max(.0001,Math.min(w,h)))<=worst(row,Math.max(.0001,Math.min(w,h)))){
    row.push(next);index++;
   }else{layout(row);row=[]}
  }
  layout(row);
  return out;
 }
 function paint(tile,coin){
  const delta=diff(coin),isFiniteChange=Number.isFinite(delta);
  const shade=isFiniteChange?Math.min(62,22+Math.abs(delta)*2.5):0;
  tile.style.setProperty('--heat-fill',shade.toFixed(1)+'%');
  tile.classList.toggle('is-up',isFiniteChange&&delta>0);
  tile.classList.toggle('is-down',isFiniteChange&&delta<0);
  const symbol=String(coin.symbol||'').toUpperCase();
  const price=api()?.formatMoney?.(coin.current_price)||'—';
  const percent=api()?.formatPercent?.(delta)||'—';
  const value=tile.querySelector('.heatmap-pct'),priceText=tile.querySelector('.heatmap-price');
  if(value&&value.textContent!==percent)value.textContent=percent;
  if(priceText&&priceText.textContent!==price)priceText.textContent=price;
  const label=coin.name+' ('+symbol+') · '+range.toUpperCase()+' '+percent+' · '+price;
  if(tile.title!==label)tile.title=label;
  tile.setAttribute('aria-label',label);
 }
 function renderLayout(){
  if(view!=='heatmap'||heat.hidden||$('injGlobalMarket')?.hidden)return;
  const width=grid.clientWidth,height=grid.clientHeight;
  if(width<60||height<60)return;
  const coins=filteredCoins(),fragment=document.createDocumentFragment();
  const next=new Map();
  if(!coins.length){
   const empty=document.createElement('div');
   empty.className='heatmap-empty';
   empty.textContent=(api()?.getCoins?.()?.length||0)?tr('Nessuna crypto corrisponde ai filtri','No assets match the filters'):tr('Caricamento dati reali di mercato…','Loading live market data…');
   fragment.append(empty);
  }else{
   for(const cell of treemap(coins,width,height)){
    const {coin,x,y,w,h}=cell;
    if(w<=0||h<=0)continue;
    const button=document.createElement('button');
    button.type='button';button.className='heatmap-tile';
    button.dataset.coin=coin.id;
    if(coin.id==='injective-protocol')button.classList.add('is-inj');
    if(w<75||h<55)button.classList.add('is-small');
    if(w<34||h<24)button.classList.add('is-tiny');
    button.style.left=x.toFixed(2)+'px';button.style.top=y.toFixed(2)+'px';
    button.style.width=w.toFixed(2)+'px';button.style.height=h.toFixed(2)+'px';
    const inner=document.createElement('span');inner.className='heatmap-tile-inner';
    const name=document.createElement('strong');name.textContent=String(coin.symbol||'').toUpperCase();
    const percent=document.createElement('span');percent.className='heatmap-pct';
    const price=document.createElement('span');price.className='heatmap-price';
    inner.append(name,percent,price);button.append(inner);
    paint(button,coin);fragment.append(button);next.set(coin.id,button);
   }
  }
  displayed=next;
  grid.replaceChildren(fragment);
  $('heatmapCount').textContent=tr('Asset visualizzati: ','Displayed assets: ')+coins.length;
 }
 function scheduleLayout(){
  if(layoutPending)return;
  layoutPending=true;
  requestAnimationFrame(()=>{layoutPending=false;renderLayout()});
 }
 function setView(next){
  view=next==='heatmap'?'heatmap':'list';save(KEY,view);
  table.hidden=view!=='list';heat.hidden=view!=='heatmap';
  listButton.setAttribute('aria-pressed',String(view==='list'));
  heatButton.setAttribute('aria-pressed',String(view==='heatmap'));
  if(view==='heatmap')scheduleLayout();
 }
 function labels(){
  listButton.setAttribute('aria-label',tr('Vista Hybrid Pro','Hybrid Pro view'));
  heatButton.setAttribute('aria-label',tr('Vista Market Heatmap','Market Heatmap view'));
  listButton.title=tr('Hybrid Pro · lista completa','Hybrid Pro · full list');
  heatButton.title=tr('Market Heatmap · mappa performance','Market Heatmap · performance map');
  $('heatmapTitle').textContent='Market Heatmap';
  $('heatmapDescription').textContent=tr('Area proporzionale alla market cap · seleziona una crypto per dettagli e grafico','Area proportional to market cap · select an asset for its chart and details');
  $('heatmapLoss').textContent=tr('Ribasso','Down');
  $('heatmapGain').textContent=tr('Rialzo','Up');
  $('heatmapNote').textContent=tr('Colore = variazione nel periodo selezionato','Color = change in selected period');
  $('heatmapRanges').setAttribute('aria-label',tr('Periodo Heatmap','Heatmap period'));
  grid.setAttribute('aria-label',tr('Mappa interattiva criptovalute','Interactive crypto heatmap'));
  const count=$('heatmapCount');
  if(count)count.textContent=tr('Asset visualizzati: ','Displayed assets: ')+displayed.size;
 }
 function chooseRange(next){
  if(!ranges.includes(next))return;
  range=next;save(RANGE_KEY,range);
  document.querySelectorAll('[data-heat-range]').forEach(button=>{
   button.setAttribute('aria-pressed',String(button.dataset.heatRange===range));
  });
  if(view==='heatmap'){
   const coins=api()?.getCoins?.()||[];
   const byId=new Map(coins.map(coin=>[coin.id,coin]));
   displayed.forEach((tile,id)=>{const coin=byId.get(id);if(coin)paint(tile,coin)});
  }
 }
 listButton.addEventListener('click',()=>setView('list'));
 heatButton.addEventListener('click',()=>setView('heatmap'));
 $('heatmapRanges').addEventListener('click',event=>{
  const button=event.target.closest('[data-heat-range]');
  if(button)chooseRange(button.dataset.heatRange);
 });
 grid.addEventListener('click',event=>{
  const tile=event.target.closest('button[data-coin]');
  if(tile)api()?.open?.(tile.dataset.coin);
 });
 const pending=new Set();
 function tick(coin){
  if(view!=='heatmap'||!displayed.has(coin.id))return;
  pending.add(coin.id);
  if(changeTimer)return;
  changeTimer=setTimeout(()=>{
   changeTimer=0;
   const byId=new Map((api()?.getCoins?.()||[]).map(item=>[item.id,item]));
   pending.forEach(id=>{const tile=displayed.get(id),current=byId.get(id);if(tile&&current)paint(tile,current)});
   pending.clear();
  },1600);
 }
 if('ResizeObserver' in window)new ResizeObserver(scheduleLayout).observe(grid);
 const global=$('injGlobalMarket');
 if(global)new MutationObserver(()=>{if(!global.hidden&&view==='heatmap')scheduleLayout()}).observe(global,{attributes:true,attributeFilter:['hidden']});
 window.INJ_MARKET_VIEWS={render:scheduleLayout,tick,languageChange:()=>{labels();scheduleLayout()}};
 labels();chooseRange(range);setView(view);
})();