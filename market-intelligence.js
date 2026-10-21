/* INJ Node · INJ Intelligence v1
   Isolated intelligence panel: actual provider data only, no fabricated history. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
if(!$('injIntelRoot'))return;
const API='https://api.coingecko.com/api/v3';
const LCD=['https://sentry.lcd.injective.network:443','https://lcd.injective.network','https://1rpc.io/inj-lcd'];
const ID='injective-protocol', DAY=86400000, WINDOW={1:DAY,7:7*DAY,30:30*DAY,365:365*DAY};
const HISTORY={dominance:'injnode_inj_dominance_history_v1',staking:'inj_node_intel_staking_v1',burn:'inj_node_intel_burn_v1'};
const MEM='inj_node_intel_market_snapshot_v1';
const RATE=180000, CHAIN_RATE=300000;
const read=k=>{try{return localStorage.getItem(k)}catch(_){return null}};
const save=(k,v)=>{try{localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v))}catch(_){}};
const en=()=>document.documentElement.lang==='en';
const tr=(it,english)=>en()?english:it;
const valid=v=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):NaN;
const pos=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):NaN;
const fmt=(v,max=2)=>Number.isFinite(v)?new Intl.NumberFormat(en()?'en-US':'it-IT',{maximumFractionDigits:max}).format(v):'—';
const usd=v=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:v<1?5:2}).format(v):'—';
const compact=v=>!Number.isFinite(v)?'—':v>=1e12?'$'+(v/1e12).toFixed(2)+'T':v>=1e9?'$'+(v/1e9).toFixed(2)+'B':v>=1e6?'$'+(v/1e6).toFixed(2)+'M':usd(v);
const percent=(v,d=2)=>Number.isFinite(v)?fmt(v,d)+'%':'—';
const signed=(v,unit='%')=>Number.isFinite(v)?(v>0?'+':'')+fmt(v,2)+unit:'—';
const text=(id,value)=>{const el=$(id);if(el&&el.textContent!==value)el.textContent=value};
const time=t=>new Date(t).toLocaleString(en()?'en-US':'it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const now=()=>Date.now();
let view=read('inj_node_intel_view_v1')==='global'?'global':'intel';
let metric=['price','dominance','relative','staking','burn'].includes(read('inj_node_intel_metric_v1'))?read('inj_node_intel_metric_v1'):'price';
let days=[1,7,30,365].includes(Number(read('inj_node_intel_days_v1')))?Number(read('inj_node_intel_days_v1')):7;
let market=null,marketAt=0,chain={bonded:NaN,ratio:NaN,validators:NaN,burn:NaN,tvl:NaN},chainAt=0;
let chart=[],chartLabel='',chartProvider='',chartAt=0,chartLoading=false,selectedIndex=null,serial=0;
let liveLast=0, fetching=false, fetchingChain=false, errors={};
const dataHistory={};
for(const [kind,key] of Object.entries(HISTORY)){
 let a;try{a=JSON.parse(read(key)||'[]')}catch(_){}
 dataHistory[kind]=Array.isArray(a)?a.filter(p=>Number.isFinite(p?.t)&&p.t>now()-365*DAY).slice(-2500):[];
}
try{
 const old=JSON.parse(read(MEM)||'null');
 if(old?.data&&now()-old.at<3600000){market=old.data;marketAt=old.at;}
}catch(_){}
function append(kind,item){
 const a=dataHistory[kind];
 const last=a.at(-1);
 if(last&&item.t-last.t<RATE-10000)return;
 a.push(item);
 dataHistory[kind]=a.filter(v=>v.t>now()-365*DAY).slice(-2000);
 save(HISTORY[kind],dataHistory[kind]);
}
function normalizedBurn(j){
 // Older and newer indexer versions use different response fields. Do not
 // guess scale for ambiguous numbers: convert only documented atomic nINJ.
 const raw=j?.total_burnt??j?.totalBurnt??j?.total_inj_burnt;
 if(typeof raw!=='string'||!/^\d+$/.test(raw))return NaN;
 const value=Number(raw)/1e18;
 return Number.isFinite(value)&&value>1&&value<1e9?value:NaN;
}
async function fetchJson(url,ms=11000){
 const ctrl=new AbortController(),stop=setTimeout(()=>ctrl.abort(),ms);
 try{
  const response=await fetch(url,{cache:'no-store',headers:{accept:'application/json'},signal:ctrl.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(stop)}
}
async function getLCD(path){
 let error;
 for(const base of LCD){
  try{return await fetchJson(base+path,4500)}catch(e){error=e}
 }
 throw error||Error('LCD offline');
}
function currentINJ(){
 return market?.coins?.[ID]||null;
}
function currentBTC(){return market?.coins?.bitcoin||null}
function currentETH(){return market?.coins?.ethereum||null}
function updateBar(){
 const coin=currentINJ(),btc=currentBTC(),global=pos(market?.global?.total_market_cap?.usd);
 const dom=pos(coin?.market_cap)&&global?coin.market_cap/global*100:NaN;
 text('injIntelPrice',usd(pos(coin?.current_price)));
 text('injIntelDaily',signed(Number(coin?.price_change_percentage_24h), '%'));
 text('injIntelMarketCap',compact(pos(coin?.market_cap)));
 text('injIntelVolume',compact(pos(coin?.total_volume)));
 text('injIntelDominance',percent(dom,4));
 text('injIntelStaked',Number.isFinite(chain.bonded)?fmt(chain.bonded,0)+' INJ':'—');
 text('injIntelStakingRatio',Number.isFinite(chain.ratio)?percent(chain.ratio,2):'—');
 text('injIntelBurn',Number.isFinite(chain.burn)?fmt(chain.burn,2)+' INJ':'—');
 text('injIntelBurnDetail',Number.isFinite(chain.burn)?fmt(chain.burn,2)+' INJ':'—');
 text('injIntelRel7',signed(Number(coin?.price_change_percentage_7d_in_currency)-Number(btc?.price_change_percentage_7d_in_currency),' pp'));
 text('injIntelRel30',signed(Number(coin?.price_change_percentage_30d_in_currency)-Number(btc?.price_change_percentage_30d_in_currency),' pp'));
 text('injIntelVal',Number.isFinite(chain.validators)?fmt(chain.validators,0):'—');
 text('injIntelTVL',compact(chain.tvl));
 $('injIntelDaily')?.classList.toggle('is-down',Number(coin?.price_change_percentage_24h)<0);
 const last=Math.max(marketAt,chainAt);
 text('injIntelUpdate',last?tr('Dati aggiornati · ','Data updated · ')+time(last):tr('In attesa dei dati','Waiting for data'));
 text('injIntelSource',tr('Mercato CoinGecko · Rete Injective · DeFiLlama','CoinGecko market · Injective network · DefiLlama'));
 text('injIntelBurnStatus',Number.isFinite(chain.burn)?tr('Aste di burn · totale cumulativo','Burn auctions · cumulative total'):tr('Fonte burn non disponibile','Burn source unavailable'));
 // Record observations ONLY when two real measurements exist simultaneously.
 if(Number.isFinite(dom)&&dom>0&&dom<100){
  append('dominance',{t:now(),d:dom,i:Number(coin.market_cap),g:global});
 }
}
async function loadMarket(force=false){
 if(fetching||(marketAt&&!force&&now()-marketAt<RATE))return;
 fetching=true;errors.market='';
 try{
  const [coins,g]=await Promise.all([
   fetchJson(API+'/coins/markets?vs_currency=usd&ids=injective-protocol%2Cbitcoin%2Cethereum&order=market_cap_desc&per_page=3&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C30d'),
   fetchJson(API+'/global')
  ]);
  if(!Array.isArray(coins)||!coins.some(c=>c.id===ID)||!pos(g?.data?.total_market_cap?.usd))throw Error('Incomplete CoinGecko data');
  const byId=Object.fromEntries(coins.filter(c=>['injective-protocol','bitcoin','ethereum'].includes(c.id)).map(c=>[c.id,c]));
  market={coins:byId,global:g.data};marketAt=now();liveLast=now();
  save(MEM,{at:marketAt,data:market});
 }catch(e){errors.market=String(e?.message||e)}finally{fetching=false;updateBar();if(metric==='dominance')renderChart()}
}
async function loadChain(force=false){
 if(fetchingChain||(chainAt&&!force&&now()-chainAt<CHAIN_RATE))return;
 fetchingChain=true;errors.chain='';
 const settled=await Promise.allSettled([
  Promise.all([getLCD('/cosmos/staking/v1beta1/pool'),getLCD('/cosmos/bank/v1beta1/supply/inj')]),
  getLCD('/cosmos/staking/v1beta1/validators?pagination.limit=1&status=BOND_STATUS_BONDED'),
  fetchJson('https://api.llama.fi/v2/chains',10000),
  (async()=>{
   // Indexer auction statistics; if unsupported, the UI shows unavailable.
   let response;
   for(const suffix of ['/api/exchange/auction/v1/auctions/stats','/api/exchange/auction/v1/inj_burnt']){
    try{response=await fetchJson('https://api.injective.exchange'+suffix,6000);
     if(Number.isFinite(normalizedBurn(response)))return response;
    }catch(_){}
   }
   throw Error('Burn statistics unavailable');
  })()
 ]);
 if(settled[0].status==='fulfilled'){
  const [pool,supply]=settled[0].value;
  const bonded=Number(pool?.pool?.bonded_tokens)/1e18;
  const total=Number(supply?.amount?.amount)/1e18;
  if(Number.isFinite(bonded)&&bonded>=0&&Number.isFinite(total)&&total>=bonded&&total>0){
   chain.bonded=bonded;chain.ratio=bonded/total*100;append('staking',{t:now(),v:chain.ratio});
  }
 }
 if(settled[1].status==='fulfilled'){
  const v=Number(settled[1].value?.pagination?.total);
  if(Number.isFinite(v)&&v>0&&v<1000)chain.validators=v;
 }
 if(settled[2].status==='fulfilled'){
  const a=settled[2].value;
  if(Array.isArray(a)){const match=a.find(x=>String(x.name||'').toLowerCase()==='injective');const value=Number(match?.tvl);if(Number.isFinite(value)&&value>=0)chain.tvl=value}
 }
 if(settled[3].status==='fulfilled'){
  const burn=normalizedBurn(settled[3].value);
  if(Number.isFinite(burn)){chain.burn=burn;append('burn',{t:now(),v:burn})}
 }
 chainAt=now();fetchingChain=false;updateBar();
 if(metric==='staking'||metric==='burn')renderChart();
}
function viewSwitch(value){
 view=value==='global'?'global':'intel';save('inj_node_intel_view_v1',view);
 $('injIntelligenceMain').hidden=view!=='intel';
 $('injGlobalMarket').hidden=view!=='global';
 for(const button of document.querySelectorAll('[data-inj-intel-view]'))button.setAttribute('aria-pressed',String(button.dataset.injIntelView===view));
 $('injIntelRoot').classList.toggle('is-global',view==='global');
 text('injIntelHeaderSuffix',view==='global'?'TOP 200':'INJ');
 // No reload and no scroll lock: native page scrolling continues on iOS.
}
function heading(){
 const titles={
 price:[tr('PREZZO INJ','INJ PRICE'),tr('Prezzo storico · USD','Historical price · USD')],
 dominance:[tr('INJ DOMINANCE','INJ DOMINANCE'),tr('Quota di mercato crypto · %','Share of global crypto market · %')],
 relative:[tr('FORZA RELATIVA','RELATIVE STRENGTH'),tr('INJ, BTC ed ETH · rendimento da inizio periodo (%)','INJ, BTC and ETH · period return (%)')],
 staking:[tr('STAKING RATIO','STAKING RATIO'),tr('Percentuale di INJ delegati · rete Injective','Share of INJ bonded · Injective network')],
 burn:[tr('INJ BURN','INJ BURN'),tr('Totale token bruciati nelle aste · INJ','Total tokens burned in auctions · INJ')]
 };
 text('injIntelChartTitle',titles[metric][0]);text('injIntelChartSubtitle',titles[metric][1]);
 text('injIntelChartSource',chartProvider||tr('Rilevazioni verificabili, nessun dato simulato','Verified readings only, no simulated data'));
 for(const b of document.querySelectorAll('[data-inj-intel-metric]'))b.setAttribute('aria-pressed',String(b.dataset.injIntelMetric===metric));
 for(const b of document.querySelectorAll('[data-inj-intel-days]'))b.setAttribute('aria-pressed',String(Number(b.dataset.injIntelDays)===days));
}
function fromHistory(kind){
 const start=now()-WINDOW[days],arr=dataHistory[kind]||[];
 return arr.filter(p=>p.t>=start&&Number.isFinite(kind==='dominance'?p.d:p.v)).map(p=>({t:p.t,v:kind==='dominance'?p.d:p.v,label:'INJ'}));
}
function metricPoints(){
 if(metric==='dominance')return fromHistory('dominance');
 if(metric==='staking')return fromHistory('staking');
 if(metric==='burn')return fromHistory('burn');
 return chart;
}
let plotted=[];
function renderChart(){
 heading();
 const svg=$('injIntelChart'),note=$('injIntelChartEmpty'),inspect=$('injIntelInspect');
 if(!svg||!note||!inspect)return;
 const data=metricPoints().filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.v)).sort((a,b)=>a.t-b.t);
 plotted=data;svg.replaceChildren();
 if(data.length<2){
  svg.hidden=true;note.hidden=false;note.textContent=chartLoading?tr('Caricamento grafico reale…','Loading actual market data…'):
   data.length===1?tr('Prima rilevazione acquisita. La curva crescerà con i nuovi dati.','First reading recorded. The line will grow as more data arrives.'):
   (metric==='staking'||metric==='burn'||metric==='dominance'?tr('In attesa di rilevazioni reali. Non vengono inventati dati storici.','Waiting for actual observations. No historical data is fabricated.'):tr('Storico non disponibile per questo periodo.','History unavailable for this timeframe.'));
  inspect.textContent=data.length?time(data[0].t)+' · '+fmt(data[0].v,5):'—';
  return;
 }
 svg.hidden=false;note.hidden=true;
 const seriesNames=[...new Set(data.map(p=>p.label||'INJ'))];
 const boundsX=[Math.min(...data.map(x=>x.t)),Math.max(...data.map(x=>x.t))];
 const values=data.map(p=>p.v),min=Math.min(...values),max=Math.max(...values);
 const pad=Math.max((max-min)*.14,Math.abs(max)*.006,.0000001),lo=min-pad,hi=max+pad;
 const W=840,H=315,L=69,R=18,T=17,B=37;
 const cx=t=>L+(t-boundsX[0])/(boundsX[1]-boundsX[0]||1)*(W-L-R);
 const cy=v=>T+(1-(v-lo)/(hi-lo))*(H-T-B);
 const ns='http://www.w3.org/2000/svg';
 function node(kind,a={},parent=svg){const el=document.createElementNS(ns,kind);for(const [k,v]of Object.entries(a))el.setAttribute(k,String(v));parent.appendChild(el);return el}
 for(let i=0;i<4;i++){
  const y=T+i/3*(H-T-B),v=hi-i/3*(hi-lo);
  node('line',{x1:L,y1:y,x2:W-R,y2:y,class:'inj-mi-grid'});
  node('text',{x:L-9,y:y+4,'text-anchor':'end',class:'inj-mi-tick'}).textContent=
   metric==='price'?('$'+fmt(v,2)):metric==='burn'?fmt(v,0):fmt(v,3)+(metric==='relative'||metric==='staking'||metric==='dominance'?'%':'');
 }
 node('text',{x:L,y:H-8,class:'inj-mi-tick'}).textContent=time(boundsX[0]);
 node('text',{x:W-R,y:H-8,'text-anchor':'end',class:'inj-mi-tick'}).textContent=time(boundsX[1]);
 const colors={INJ:'var(--accent)',BTC:'#f4a24a',ETH:'#909aeb'};
 for(const name of seriesNames){
  const points=data.filter(p=>(p.label||'INJ')===name),d=points.map((p,i)=>(i?'L':'M')+cx(p.t).toFixed(2)+' '+cy(p.v).toFixed(2)).join(' ');
  if(points.length>1)node('path',{d,stroke:colors[name]||'var(--accent)',fill:'none','stroke-width':name==='INJ'?2.8:1.75,opacity:name==='INJ'?1:.8,'stroke-linecap':'round','stroke-linejoin':'round'});
 }
 let group=null;
 function selection(e){
  const bounds=svg.getBoundingClientRect();const px=(e.clientX-bounds.left)/(bounds.width||1)*W;
  let nearest=data[0],distance=Infinity;
  for(const p of data){const delta=Math.abs(px-cx(p.t));if(delta<distance){nearest=p;distance=delta}}
  show(nearest);
 }
 function show(p){
  if(!p)return;
  if(group)group.remove();
  group=node('g');
  node('line',{x1:cx(p.t),x2:cx(p.t),y1:T,y2:H-B,class:'inj-mi-crosshair'},group);
  node('circle',{cx:cx(p.t),cy:cy(p.v),r:5,fill:colors[p.label]||'var(--accent)',stroke:'var(--bg)','stroke-width':2},group);
  const value=metric==='price'?usd(p.v):metric==='burn'?fmt(p.v,2)+' INJ':percent(p.v,4);
  inspect.textContent=time(p.t)+' · '+(p.label||'INJ')+' '+value;
 }
 const lastINJ=data.filter(p=>p.label==='INJ').at(-1)||data.at(-1);show(lastINJ);
 svg.onpointerdown=selection;svg.onpointermove=selection;
 svg.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const index=data.findIndex(p=>p.t===window.__injMiKeyboardT);const next=Math.max(0,Math.min(data.length-1,(index<0?data.length-1:index)+(e.key==='ArrowLeft'?-1:1)));window.__injMiKeyboardT=data[next].t;show(data[next])};
 svg.setAttribute('aria-label',tr('Grafico INJ interattivo: tocca o trascina per leggere un punto reale','Interactive INJ chart: touch or drag to inspect a real observation'));
}
function cleanChart(payload,id){
 const rows=Array.isArray(payload?.prices)?payload.prices:[];
 return rows.filter(row=>Array.isArray(row)&&Number.isFinite(row[0])&&Number.isFinite(row[1])&&row[1]>0)
  .map(([t,v])=>({t,v,label:id})).sort((a,b)=>a.t-b.t);
}
function nearest(arr,t,maxDiff){
 let low=0,high=arr.length-1;
 while(low<high){const middle=(low+high)>>1;if(arr[middle].t<t)low=middle+1;else high=middle}
 const a=arr[low],b=arr[Math.max(0,low-1)];
 const p=!b||Math.abs(a.t-t)<Math.abs(b.t-t)?a:b;
 return p&&Math.abs(p.t-t)<=maxDiff?p:null;
}
async function loadChart(force=false){
 if(!['price','relative'].includes(metric)){chart=[];chartProvider=tr('Rilevazioni salvate su questo dispositivo','Observations saved on this device');chartLoading=false;renderChart();return}
 if(chartLoading)return;
 const generation=++serial,localMetric=metric,localDays=days;
 chartLoading=true;renderChart();
 const marketId=[ID,...(localMetric==='relative'?['bitcoin','ethereum']:[])];
 try{
  const responses=await Promise.all(marketId.map(id=>fetchJson(API+'/coins/'+id+'/market_chart?vs_currency=usd&days='+localDays)));
  if(generation!==serial)return;
  const inj=cleanChart(responses[0],'INJ');
  if(inj.length<2)throw Error('Empty INJ price history');
  if(localMetric==='price')chart=inj;
  else{
   const btc=cleanChart(responses[1],'BTC'),eth=cleanChart(responses[2],'ETH');
   if(btc.length<2||eth.length<2)throw Error('Missing comparator data');
   const maxDiff=localDays===1?20*60000:localDays<=30?3*3600000:3*DAY;
   const aligned=inj.map(p=>{const b=nearest(btc,p.t,maxDiff),e=nearest(eth,p.t,maxDiff);return b&&e?{p,b,e}:null}).filter(Boolean);
   if(aligned.length<2)throw Error('Insufficient aligned history');
   const first=aligned[0];
   chart=aligned.flatMap(x=>[
    {t:x.p.t,v:(x.p.v/first.p.v-1)*100,label:'INJ'},
    {t:x.p.t,v:(x.b.v/first.b.v-1)*100,label:'BTC'},
    {t:x.p.t,v:(x.e.v/first.e.v-1)*100,label:'ETH'}
   ]);
  }
  chartAt=now();chartProvider=tr('CoinGecko · storico reale','CoinGecko · actual history');
 }catch(e){if(generation===serial){chart=[];chartProvider=tr('Storico CoinGecko non disponibile','CoinGecko history unavailable')}}
 finally{if(generation===serial){chartLoading=false;renderChart()}}
}
function pickMetric(m){if(!['price','relative','dominance','staking','burn'].includes(m))return;
 metric=m;chart=[];serial++;chartLoading=false;save('inj_node_intel_metric_v1',metric);void loadChart();}
function updateTranslation(){
 text('injIntelHeaderSubtitle',tr('Il centro di analisi di Injective','Injective market intelligence terminal'));
 text('injIntelTabIntel','INJ Intelligence');text('injIntelTabGlobal','Global Market');
 text('injIntelPriceLabel',tr('PREZZO INJ','INJ PRICE'));
 text('injIntelMCLabel','MARKET CAP');
 text('injIntelVolLabel',tr('VOLUME 24H','24H VOLUME'));
 text('injIntelDominanceLabel','INJ DOMINANCE');
 text('injIntelStakedLabel',tr('INJ IN STAKING','STAKED INJ'));
 text('injIntelBurnLabel','INJ BURNED');
 text('injIntelMetricsTitle',tr('TOKENOMICS & NETWORK','TOKENOMICS & NETWORK'));
 text('injIntelStakingTitle',tr('Staking Network','Staking Network'));
 text('injIntelBurnTitle','Burn Tracker');
 text('injIntelRelativeTitle','Relative Strength');
 text('injIntelRatioLabel',tr('STAKING RATIO','STAKING RATIO'));
 text('injIntelValidatorLabel',tr('VALIDATORI ATTIVI','ACTIVE VALIDATORS'));
 text('injIntelBurnSub',tr('INJ bruciati tramite le aste, quando verificabili','INJ destroyed by auction, when verifiable'));
 text('injIntelRel7Label',tr('INJ vs BTC · 7G','INJ vs BTC · 7D'));
 text('injIntelRel30Label',tr('INJ vs BTC · 30G','INJ vs BTC · 30D'));
 text('injIntelTVLLabel',tr('DEFI TVL · INJECTIVE','DEFI TVL · INJECTIVE'));
 text('injIntelChartPriceLabel',tr('Prezzo','Price'));
 text('injIntelChartDomLabel','Dominance');
 text('injIntelChartRelativeLabel',tr('Forza relativa','Relative'));
 text('injIntelChartStakingLabel','Staking');
 text('injIntelChartBurnLabel','Burn');
 text('injIntelSmallPrint',tr('Grafico basato su dati reali. Dominance, staking e burn costruiscono lo storico dalle rilevazioni sul dispositivo. Nessuna interpolazione o storico inventato. Dati ritardati in base al provider.','Actual data only. Dominance, staking and burn histories build from observations saved on this device. No synthetic history or invented data. Updates depend on providers.'));
 updateBar();heading();renderChart();
}
for(const button of document.querySelectorAll('[data-inj-intel-view]'))button.addEventListener('click',()=>viewSwitch(button.dataset.injIntelView));
for(const button of document.querySelectorAll('[data-inj-intel-metric]'))button.addEventListener('click',()=>pickMetric(button.dataset.injIntelMetric));
for(const button of document.querySelectorAll('[data-inj-intel-days]'))button.addEventListener('click',()=>{
 const value=Number(button.dataset.injIntelDays);if(!WINDOW[value])return;
 days=value;chart=[];serial++;chartLoading=false;save('inj_node_intel_days_v1',days);void loadChart();
});
$('injIntelRefresh')?.addEventListener('click',()=>{marketAt=0;chainAt=0;void Promise.all([loadMarket(true),loadChain(true)])});
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='injnode:market:language')updateTranslation()});
window.addEventListener('storage',e=>{if(e.key==='inj_node_language_v1')updateTranslation()});
window.addEventListener('pageshow',()=>{updateTranslation();void loadMarket();void loadChain()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){void loadMarket();void loadChain();if(['price','relative'].includes(metric)&&now()-chartAt>RATE)void loadChart()}});
viewSwitch(view);updateTranslation();void Promise.all([loadMarket(),loadChain()]);void loadChart();
setInterval(()=>{if(!document.hidden){void loadMarket();void loadChain()}},60000);
setInterval(()=>{if(!document.hidden&&['price','relative'].includes(metric)&&now()-chartAt>RATE&&!chartLoading)void loadChart()},RATE);
})();