/* INJ Node · native Global Markets v2.
 * In-house heatmap and world map UI. Quotes via same-origin /api/global-markets.
 * No TradingView scripts/elements/iframes, no fabricated prices or percentages.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const root=$('injWorldMarket');if(!root)return;
const en=()=>document.documentElement.lang==='en';
const tr=(it,english)=>en()?english:it;
const ids=['indices','sectors','stocks','etf','forex','commodities','bonds','crypto'];
const fallbackCatalog={
 indices:[['sp500','S&P 500','^GSPC'],['nasdaq','NASDAQ','^IXIC'],['dow','Dow Jones','^DJI'],['russell','Russell 2000','^RUT'],['stoxx','Euro Stoxx 50','^STOXX50E'],['dax','DAX','^GDAXI'],['cac','CAC 40','^FCHI'],['ftse','FTSE 100','^FTSE'],['nikkei','Nikkei 225','^N225'],['hangseng','Hang Seng','^HSI'],['nifty','Nifty 50','^NSEI'],['asx','ASX 200','^AXJO'],['bovespa','Ibovespa','^BVSP']],
 sectors:[['technology','Tecnologia','XLK'],['finance','Finanza','XLF'],['energy','Energia','XLE'],['healthcare','Sanità','XLV'],['industrial','Industria','XLI'],['consumer','Consumi discrezionali','XLY'],['staples','Beni essenziali','XLP'],['utilities','Utilities','XLU'],['realestate','Immobiliare','XLRE'],['materials','Materiali','XLB'],['communications','Comunicazioni','XLC']],
 stocks:[['aapl','Apple','AAPL'],['msft','Microsoft','MSFT'],['nvda','NVIDIA','NVDA'],['jpm','JPMorgan','JPM'],['bac','Bank of America','BAC'],['xom','ExxonMobil','XOM'],['cvx','Chevron','CVX'],['lly','Eli Lilly','LLY'],['jnj','Johnson & Johnson','JNJ'],['cat','Caterpillar','CAT'],['ge','GE Aerospace','GE'],['amzn','Amazon','AMZN'],['tsla','Tesla','TSLA'],['wmt','Walmart','WMT'],['cost','Costco','COST'],['nee','NextEra Energy','NEE'],['duk','Duke Energy','DUK'],['googl','Alphabet','GOOGL'],['meta','Meta','META'],['amt','American Tower','AMT'],['lin','Linde','LIN'],['fcx','Freeport-McMoRan','FCX']],
 etf:[['spy','S&P 500 ETF','SPY'],['qqq','Nasdaq 100 ETF','QQQ'],['iwm','Small Caps ETF','IWM'],['efa','Developed Markets','EFA'],['eem','Emerging Markets','EEM'],['tlt','Long Treasury','TLT'],['gld','Gold ETF','GLD'],['vnq','Real Estate ETF','VNQ']],
 forex:[['eurusd','EUR / USD','EURUSD=X'],['gbpusd','GBP / USD','GBPUSD=X'],['usdjpy','USD / JPY','JPY=X'],['usdchf','USD / CHF','CHF=X'],['audusd','AUD / USD','AUDUSD=X'],['usdcny','USD / CNY','CNY=X'],['usdinr','USD / INR','INR=X']],
 commodities:[['gold','Oro','GC=F'],['silver','Argento','SI=F'],['wti','Petrolio WTI','CL=F'],['brent','Petrolio Brent','BZ=F'],['gas','Gas naturale','NG=F'],['copper','Rame','HG=F'],['corn','Mais','ZC=F']],
 bonds:[['us10y','USA 10Y rendimento','^TNX'],['us30y','USA 30Y rendimento','^TYX'],['bnd','Bond aggregate ETF','BND'],['ief','Treasury 7-10Y ETF','IEF'],['shy','Treasury 1-3Y ETF','SHY'],['lqd','Corporate IG ETF','LQD'],['hyg','High Yield ETF','HYG'],['tip','Inflation-linked ETF','TIP']]
};

const titles={
 indices:['Mercati mondiali','World markets'],sectors:['Settori azionari','Stock market sectors'],
 stocks:['Azioni per settore','Stocks by sector'],etf:['ETF e asset class','ETFs & asset classes'],
 forex:['Valute globali','Global currencies'],commodities:['Materie prime','Commodities'],
 bonds:['Obbligazioni e tassi','Bonds & rates'],crypto:['Criptovalute','Cryptocurrencies']
};
const hints={
 indices:['Indici rappresentativi delle principali borse mondiali','Representative indices of major global exchanges'],
 sectors:['11 settori S&P 500 · ETF settoriali rappresentativi','11 S&P 500 sectors · representative sector ETFs'],
 stocks:['Società raggruppate per attività economica','Companies grouped by economic activity'],
 etf:['Esposizioni a indici, aree geografiche e asset class','Index, geographical and asset-class exposures'],
 forex:['Coppie valutarie principali','Major currency pairs'],
 commodities:['Contratti futures rappresentativi','Representative futures contracts'],
 bonds:['Rendimenti Treasury USA e ETF obbligazionari','US Treasury yields and bond ETFs'],
 crypto:['Prezzi dal mercato crypto già utilizzato da INJ Node','Prices from INJ Node’s existing crypto market feed']
};
const sectors=[
 ['technology','Tecnologia','Technology',['aapl','msft','nvda']],
 ['finance','Finanza','Financials',['jpm','bac']],
 ['energy','Energia','Energy',['xom','cvx']],
 ['healthcare','Sanità','Healthcare',['lly','jnj']],
 ['industrial','Industria','Industrials',['cat','ge']],
 ['consumer','Consumi discrezionali','Consumer discretionary',['amzn','tsla']],
 ['staples','Beni essenziali','Consumer staples',['wmt','cost']],
 ['utilities','Servizi pubblici','Utilities',['nee','duk']],
 ['realestate','Immobiliare','Real estate',['amt']],
 ['materials','Materiali','Materials',['lin','fcx']],
 ['communications','Comunicazioni','Communication services',['googl','meta']]
];
const regions=[
 ['America',['sp500','nasdaq','dow','russell','bovespa']],
 ['Europa / Europe',['stoxx','dax','cac','ftse']],
 ['Asia / Pacifico',['nikkei','hangseng','nifty','asx']]
];
const hotspot=[['sp500',38,-97],['bovespa',-14,-51],['stoxx',51,8],['nifty',23,78],['hangseng',23,114],['nikkei',37,139],['asx',-25,134]];
const quotes=new Map(),updated=new Map(),pending=new Set(),observed=new Set();
const offlineKey='inj_world_quotes_cache_v2';
function definitions(group){
 if(group==='crypto')return [
  ['bitcoin','Bitcoin','BTC'],['ethereum','Ethereum','ETH'],['solana','Solana','SOL'],
  ['binancecoin','BNB','BNB'],['ripple','XRP','XRP'],['hyperliquid','Hyperliquid','HYPE'],
  ['injective-protocol','Injective','INJ'],['avalanche-2','Avalanche','AVAX'],
  ['chainlink','Chainlink','LINK'],['polkadot','Polkadot','DOT']
 ].map(([id,name,symbol])=>({id,name,symbol,price:null,change:null,time:null,currency:'USD'}));
 return (fallbackCatalog[group]||[]).map(([id,name,symbol])=>({id,name,symbol,price:null,change:null,time:null,currency:null}));
}
function restoreQuotes(){
 try{
  const saved=JSON.parse(localStorage.getItem(offlineKey)||'{}');
  for(const group of ids){
   const arr=saved[group]?.quotes;
   if(Array.isArray(arr)&&arr.length&&arr.some(q=>Number.isFinite(q.price)))quotes.set(group,arr);
  }
 }catch(_){}
}
function saveQuotes(){
 const data={};
 for(const [group,arr] of quotes)if(arr.some(q=>Number.isFinite(q.price)))data[group]={quotes:arr,at:Date.now()};
 try{localStorage.setItem(offlineKey,JSON.stringify(data))}catch(_){}
}
restoreQuotes();
let active=false,initialized=false,observer=null,geometryStarted=false,geoReady=false;
const MAX_AGE=3*60*1000;
const fmtPercent=n=>Number.isFinite(n)?(n>0?'+':'')+new Intl.NumberFormat(en()?'en-US':'it-IT',{maximumFractionDigits:2,minimumFractionDigits:2}).format(n)+'%':'—';
const fmtValue=(v,currency)=>{
 if(!Number.isFinite(v)||v<=0)return '—';
 const precision=v<1?4:2;
 return new Intl.NumberFormat(en()?'en-US':'it-IT',{minimumFractionDigits:precision,maximumFractionDigits:precision}).format(v)+(currency?' '+currency:'');
};
const byId=(arr)=>new Map((Array.isArray(arr)?arr:[]).map(x=>[x.id,x]));
const englishNames={
 commodities:{gold:'Gold',silver:'Silver',wti:'WTI Crude',brent:'Brent Crude',gas:'Natural gas',copper:'Copper',corn:'Corn'},
 bonds:{us10y:'US Treasury 10Y yield',us30y:'US Treasury 30Y yield'},
 forex:{},etf:{}
};
const quotedName=(group,q)=>en()?(englishNames[group]?.[q.id]||q.name):q.name;
const stamp=t=>{
 if(!Number.isFinite(t)||t<=0)return '';
 const date=new Date(t*1000);
 if(!Number.isFinite(date.getTime()))return '';
 return date.toLocaleString(en()?'en-GB':'it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'});
};
const state=x=>!Number.isFinite(x?.change)?'neutral':x.change>0?'up':x.change<0?'down':'neutral';
function el(tag,cls,text){
 const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;
}
function quoteTile(q,compact=false){
 const tile=el('article','inj-wm-tile '+state(q)+(compact?' compact':''));
 if(Number.isFinite(q.change))tile.style.setProperty('--inj-wm-strength',Math.max(8,Math.min(55,8+Math.abs(q.change)*8)).toFixed(1)+'%');
 const head=el('div','inj-wm-tile-head');
 const label=el('strong','inj-wm-name',q.name||q.symbol||'—');
 const ticker=el('span','inj-wm-symbol',q.symbol||'');
 head.append(label,ticker);
 const value=el('div','inj-wm-tile-values');
 value.append(el('span','inj-wm-price',fmtValue(q.price,q.currency)),el('strong','inj-wm-change',fmtPercent(q.change)));
 tile.append(head,value);
 if(q.time)tile.title=tr('Ultima quotazione: ','Last quote: ')+stamp(q.time);
 return tile;
}
const statsOf=arr=>{
 const available=arr.filter(x=>Number.isFinite(x.change));
 const up=available.filter(x=>x.change>0).length;
 return {total:available.length,up,down:available.filter(x=>x.change<0).length};
};
function renderSummary(group,arr){
 const status=$('injWorld'+group+'Status');
 if(!status)return;
 const n=statsOf(arr);
 if(!n.total){
  const hasPrice=arr.some(q=>Number.isFinite(q.price));
  status.textContent=hasPrice?tr('Prezzi disponibili · variazione non comunicata','Prices available · change unavailable'):tr('Quotazioni ancora non disponibili','Quotes not yet available');
  return;
 }
 const latest=Math.max(...arr.map(x=>Number(x.time)||0));
 status.textContent=n.up+' '+tr('in rialzo','up')+' · '+n.down+' '+tr('in ribasso','down')+' · '+tr('ultima quotazione ','last quote ')+(latest?stamp(latest):'—');
}
function renderIndices(items){
 const idx=byId(items);const list=$('injWorldIndexRegions');if(!list)return;
 list.replaceChildren();
 regions.forEach(([name,assetIds])=>{
  const group=el('div','inj-wm-region');group.append(el('h4','inj-wm-region-title',en()?name.replace('Europa / Europe','Europe').replace('Asia / Pacifico','Asia / Pacific'):name.replace('Europa / Europe','Europa').replace('Asia / Pacifico','Asia / Pacifico')));
  const cards=el('div','inj-wm-grid indices');
  assetIds.forEach(id=>{const q=idx.get(id);if(q)cards.append(quoteTile(q,true))});
  group.append(cards);list.append(group);
 });
 renderPins(items);
 renderSummary('indices',items);
}
function renderSectors(items){
 const data=byId(items),rootGrid=$('injWorldSectorGrid');if(!rootGrid)return;
 rootGrid.replaceChildren();
 sectors.forEach(([id,it,english])=>{
  const q=data.get(id)||{id,name:tr(it,english),symbol:''};
  const card=quoteTile({...q,name:tr(it,english),symbol:q.symbol},false);
  card.classList.add('inj-wm-sector-card');
  const tag=el('small','inj-wm-proxy',tr('ETF settoriale','Sector ETF'));
  card.append(tag);
  rootGrid.append(card);
 });
 renderSummary('sectors',items);
}
function renderStocks(items){
 const data=byId(items),out=$('injWorldStockGroups');if(!out)return;out.replaceChildren();
 sectors.forEach(([id,it,english,stocks])=>{
  const group=el('section','inj-wm-stock-sector');
  group.append(el('h4','inj-wm-stock-heading',tr(it,english)));
  const grid=el('div','inj-wm-grid stocks');
  stocks.forEach(stock=>{const q=data.get(stock);if(q)grid.append(quoteTile(q,true))});
  group.append(grid);out.append(group);
 });
 renderSummary('stocks',items);
}
function renderPlain(group,items){
 const grid=$('injWorld'+group+'Grid');if(!grid)return;
 grid.replaceChildren();items.forEach(item=>grid.append(quoteTile({...item,name:quotedName(group,item)},true)));
 if(group==='bonds'){
  const first=grid.querySelector('.inj-wm-tile');
  if(first){const note=el('small','inj-wm-proxy',tr('Rendimento mostrato come indice ×10','Yield displayed as index ×10'));first.append(note)}
 }
 renderSummary(group,items);
}
function renderGroup(group,items){
 if(group==='indices')renderIndices(items);
 else if(group==='sectors')renderSectors(items);
 else if(group==='stocks')renderStocks(items);
 else renderPlain(group,items);
}
function statusWithRetry(group,message){
 const status=$('injWorld'+group+'Status');if(!status)return;
 status.replaceChildren(document.createTextNode(message+' · '));
 const retry=document.createElement('button');retry.type='button';retry.className='inj-wm-retry';
 retry.textContent=tr('Riprova','Retry');
 retry.setAttribute('aria-label',tr('Riprova caricamento dati: ','Retry loading market data: ')+titles[group][en()?1:0]);
 retry.addEventListener('click',()=>{void loadGroup(group,true)});
 status.append(retry);
}
function errorDescription(code){
 if(code===404)return tr('Endpoint API non pubblicato (404)','Market API endpoint not deployed (404)');
 if(code===429)return tr('Fonte dati limitata (429)','Data source rate limited (429)');
 if(code===403)return tr('Accesso alla fonte negato (403)','Data source access denied (403)');
 if(code===503)return tr('Feed prezzi non disponibile (503)','Price feed unavailable (503)');
 if(code)return tr('Errore HTTP ','HTTP error ')+code;
 return tr('Connessione quotazioni non disponibile','Quote connection unavailable');
}
function renderPlaceholders(){
 for(const group of ids)renderGroup(group,quotes.get(group)||definitions(group));
}
async function loadGroup(group,force=false){
 if(pending.has(group)||(!force&&updated.has(group)&&Date.now()-updated.get(group)<MAX_AGE))return;
 const section=$('injWorldSection'+group);if(!section)return;
 const label=$('injWorld'+group+'Status');
 pending.add(group);section.classList.add('is-loading');
 if(label)label.textContent=tr('Aggiornamento quotazioni…','Updating market quotes…');
 try{
  let body;
  if(group==='crypto')body=await cryptoSnapshot();
  else{
   const r=await fetch('./api/global-markets?group='+encodeURIComponent(group),{cache:'no-store',headers:{Accept:'application/json'}});
   if(!r.ok)throw Object.assign(new Error('Server failure'),{code:r.status});
   if(!(r.headers.get('content-type')||'').includes('application/json'))throw Object.assign(new Error('Non-JSON data'),{code:404});
   body=await r.json();
  }
  if(!Array.isArray(body?.quotes))throw Object.assign(new Error('Invalid data'),{code:502});
  const old=byId(quotes.get(group)||[]);
  const arr=body.quotes.map(q=>(Number.isFinite(q.price)?q:(old.get(q.id)&&Number.isFinite(old.get(q.id).price)?old.get(q.id):q)));
  quotes.set(group,arr);
  if(body.quotes.some(q=>Number.isFinite(q.price))){updated.set(group,Date.now());saveQuotes();}
  renderGroup(group,arr);
  if(!body.quotes.some(q=>Number.isFinite(q.price)))statusWithRetry(group,
   body.providerStatus==='rate-limited'?errorDescription(429):tr('Fonte prezzi non disponibile · valori non simulati','Price feed unavailable · no estimated values'));
  else if(body.available<arr.length&&label)label.textContent+=' · '+tr('quotazioni parziali','partial quotes');
 }catch(err){
  renderGroup(group,quotes.get(group)||definitions(group));
  statusWithRetry(group,errorDescription(Number(err.code)||0)+(quotes.has(group)?tr(' · ultimo dato salvato',' · last saved quotes'):''));
 }finally{pending.delete(group);section.classList.remove('is-loading');}
}
async function cryptoSnapshot(){
 const wanted=['bitcoin','ethereum','solana','binancecoin','ripple','hyperliquid','injective-protocol','avalanche-2','chainlink','polkadot'];
 const api=window.INJ_MARKET_VIEW_API;
 let coins=api?.getCoins?.()||[];
 if(!Array.isArray(coins)||coins.length<5){
  try{
   const url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids='+wanted.join(',')+'&price_change_percentage=24h';
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6000);
   try{const response=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json'}});if(response.ok)coins=await response.json()}finally{clearTimeout(timer)}
  }catch(_){}
 }
 const data=new Map((Array.isArray(coins)?coins:[]).map(coin=>[coin.id,coin]));
 return {quotes:wanted.map(id=>{
  const x=data.get(id)||{},p=Number(x.current_price),d=Number(x.price_change_percentage_24h_in_currency??x.price_change_percentage_24h);
  return {id,name:x.name||id.replaceAll('-',' ').toUpperCase(),symbol:(x.symbol||'').toUpperCase(),price:Number.isFinite(p)&&p>0?p:null,change:Number.isFinite(d)?d:null,currency:'USD',time:x.last_updated?Math.round(new Date(x.last_updated).getTime()/1000):null};
 })};
}
const countryIds=[['sp500',/united states/i],['bovespa',/brazil/i],['dax',/germany/i],['cac',/france/i],['ftse',/united kingdom/i],['nikkei',/japan/i],['nifty',/^india$/i],['hangseng',/hong kong/i],['asx',/australia/i]];
function updateMapColors(items){
 const data=byId(items);
 $('injWorldMapSvg')?.querySelectorAll('[data-market-country]')?.forEach(node=>{
  const id=node.getAttribute('data-market-country');const change=data.get(id)?.change;
  node.classList.toggle('up',Number.isFinite(change)&&change>0);
  node.classList.toggle('down',Number.isFinite(change)&&change<0);
 });
}
function renderPins(items){
 updateMapColors(items);
 const layer=$('injWorldMapPins');const note=$('injWorldMapSpotlight');if(!layer||!note)return;
 const data=byId(items);layer.replaceChildren();
 for(const [id,lat,lon] of hotspot){
  const q=data.get(id);if(!q)continue;
  const pin=el('button','inj-wm-pin '+state(q));pin.type='button';
  pin.style.left=((lon+180)/360*100).toFixed(3)+'%';pin.style.top=((90-lat)/180*100).toFixed(3)+'%';
  pin.setAttribute('aria-label',q.name+': '+fmtPercent(q.change));
  pin.title=q.name+' · '+fmtPercent(q.change);
  pin.addEventListener('click',()=>{
   note.textContent=q.name+' · '+fmtValue(q.price,q.currency)+' · '+fmtPercent(q.change);
  });
  layer.append(pin);
 }
 const available=items.find(x=>x.id==='sp500'&&Number.isFinite(x.price))||items.find(x=>Number.isFinite(x.price));
 if(available)note.textContent=available.name+' · '+fmtValue(available.price,available.currency)+' · '+fmtPercent(available.change);
}
function fallbackMap(){
 const svg=$('injWorldMapSvg');if(!svg)return;
 svg.innerHTML='<g class="inj-wm-land"><path d="M75 110 L120 60 200 38 248 80 230 125 192 145 181 199 146 218 134 181 95 163Z"/><path d="M210 230 L278 244 309 292 291 343 265 421 226 386 204 306Z"/><path d="M392 104 L448 76 502 90 527 123 521 178 490 191 475 235 435 233 413 168Z"/><path d="M510 83 L620 49 757 57 861 103 845 160 786 191 747 167 703 214 650 213 621 174 566 195 538 150Z"/><path d="M754 307 L812 295 866 339 834 382 768 370Z"/><path d="M904 392 L920 385 930 408 911 425Z"/></g>';
}
const ns='http://www.w3.org/2000/svg';
function shapePath(feature){
 const coords=feature?.geometry?.coordinates;if(!coords)return '';
 const polygons=feature.geometry.type==='Polygon'?[coords]:feature.geometry.type==='MultiPolygon'?coords:[];
 let path='';
 for(const polygon of polygons){
  for(const ring of polygon){
   if(!Array.isArray(ring)||ring.length<3)continue;
   const stride=Math.max(1,Math.ceil(ring.length/150));
   let started=false,lastX=0;
   for(let i=0;i<ring.length;i+=stride){
    const p=ring[i],lon=Number(p?.[0]),lat=Number(p?.[1]);
    if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
    const x=(lon+180)*960/360,y=(90-lat)*460/180;
    if(!started||Math.abs(x-lastX)>400){path+='M'+x.toFixed(1)+' '+y.toFixed(1);started=true}
    else path+='L'+x.toFixed(1)+' '+y.toFixed(1);
    lastX=x;
   }
   if(started)path+='Z';
  }
 }
 return path;
}
async function loadWorldGeometry(){
 if(geometryStarted)return;geometryStarted=true;
 fallbackMap();
 try{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6500);
  let response;
  try{response=await fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson',{signal:ctrl.signal,cache:'force-cache'});}finally{clearTimeout(timer)}
  if(!response.ok)return;
  const payload=await response.json();
  if(!Array.isArray(payload?.features)||payload.features.length<80)return;
  const svg=$('injWorldMapSvg');if(!svg)return;
  const group=document.createElementNS(ns,'g');group.setAttribute('class','inj-wm-land');
  for(const feature of payload.features){
   const d=shapePath(feature);if(!d)continue;
   const path=document.createElementNS(ns,'path');path.setAttribute('d',d);
   const country=String(feature?.properties?.name||feature?.properties?.ADMIN||feature?.id||'');
   const match=countryIds.find(([,re])=>re.test(country));
   if(match)path.setAttribute('data-market-country',match[0]);
   group.append(path);
  }
  if(group.childNodes.length>80){svg.replaceChildren(group);geoReady=true;const indices=quotes.get('indices');if(indices)updateMapColors(indices);}
 }catch(_){/* Keep the built-in map outline, never block the page. */}
}
function localize(){
 $('injWorldHeading').textContent='Global Markets';
 $('injWorldIntro').textContent=tr('La situazione dei mercati mondiali, settore per settore. Scorri in verticale per esplorare.','World financial markets, sector by sector. Scroll vertically to explore.');
 $('injWorldDisclosure').textContent=tr('Le variazioni indicano l’ultima sessione disponibile, non movimenti in tempo reale. Le quotazioni possono essere ritardate. I settori sono rappresentati da ETF, non da indici ufficiali.','Changes reflect the latest available session, not real-time ticks. Quotes may be delayed. Sectors use representative ETFs rather than official sector indices.');
 const n=$('injWorldQuickNav');if(n)n.querySelectorAll('[data-world-jump]').forEach(b=>b.textContent=titles[b.dataset.worldJump][en()?1:0]);
 for(const group of ids){
  const title=$('injWorldTitle'+group),hint=$('injWorldHint'+group);
  if(title)title.textContent=titles[group][en()?1:0];
  if(hint)hint.textContent=hints[group][en()?1:0];
  const rows=quotes.get(group);if(rows)renderGroup(group,rows);
 }
 $('injWorldMapCaption').textContent=tr('Seleziona un punto per leggere l’indice di riferimento','Tap a point to view its benchmark index');
 const sectorNote=root.querySelector('[data-translation="sector-note"]');if(sectorNote)sectorNote.textContent=tr('I colori e le variazioni rispecchiano ETF rappresentativi di ciascun settore.','Colors and changes reflect representative ETFs for each sector.');
}
function mount(){
 if(initialized)return;initialized=true;
 const nav=$('injWorldQuickNav');nav?.addEventListener('click',e=>{
  const b=e.target.closest('[data-world-jump]');if(!b)return;
  $('injWorldSection'+b.dataset.worldJump)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 });
 localize();renderPlaceholders();loadWorldGeometry();
 if('IntersectionObserver' in window){
  observer=new IntersectionObserver(entries=>{
   entries.forEach(e=>{if(e.isIntersecting&&active){const id=e.target.dataset.worldGroup;observed.add(id);loadGroup(id);observer.unobserve(e.target)}});
  },{root:null,rootMargin:'400px 0px',threshold:0.01});
  ids.forEach(id=>observer.observe($('injWorldSection'+id)));
 }else{ids.forEach(id=>loadGroup(id))}
}
function activate(show){
 active=!!show;root.hidden=!active;
 if(active){mount();for(const id of observed)if(!updated.has(id))void loadGroup(id);}
}
function languageChange(){if(initialized)localize();}
window.INJ_WORLD_MARKETS={activate,languageChange};
window.addEventListener('storage',e=>{if(e.key==='inj_node_language_v1'&&active)languageChange()});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&active)for(const id of observed)if(!updated.has(id)||Date.now()-updated.get(id)>MAX_AGE)void loadGroup(id,true);
});
setInterval(()=>{if(active&&!document.hidden)for(const id of observed)if(Date.now()-(updated.get(id)||0)>MAX_AGE)void loadGroup(id,true)},180000);
})();