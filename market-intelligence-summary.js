/* INJ Node · Market snapshot only (INJ Intelligence), v16.05.01
 * Keeps Global Market intact. No chart polling, burn endpoints or fabricated numbers. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
if(!$('injIntelligenceMain')||!$('injGlobalMarket'))return;
const CACHE='inj_node_intel_summary_cache_v1',STAKE_CACHE='inj_node_intel_chain_snapshot_v2';
const CG='https://api.coingecko.com/api/v3';
const LCD=['https://sentry.lcd.injective.network:443','https://lcd.injective.network','https://1rpc.io/inj-lcd'];
const now=()=>Date.now();
const read=k=>{try{return localStorage.getItem(k)}catch(_){return null}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
const en=()=>document.documentElement.lang==='en';
const tr=(it,eng)=>en()?eng:it;
const num=v=>(v===undefined||v===null||v===''?NaN:Number(v));
const positive=v=>{const n=num(v);return Number.isFinite(n)&&n>0?n:NaN};
const formatted=(n,d=2)=>Number.isFinite(n)?new Intl.NumberFormat(en()?'en-US':'it-IT',{maximumFractionDigits:d}).format(n):'—';
const usd=v=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:v<1?5:2}).format(v):'—';
const cap=v=>!Number.isFinite(v)?'—':v>=1e12?'$'+(v/1e12).toFixed(2)+'T':v>=1e9?'$'+(v/1e9).toFixed(2)+'B':v>=1e6?'$'+(v/1e6).toFixed(2)+'M':usd(v);
const percent=(n,d=2)=>Number.isFinite(n)?formatted(n,d)+'%':'—';
const time=t=>new Date(t).toLocaleTimeString(en()?'en-US':'it-IT',{hour:'2-digit',minute:'2-digit'});
const text=(id,v)=>{const el=$(id);if(el&&el.textContent!==v)el.textContent=v};
let view=read('inj_node_intel_view_v1')==='global'?'global':'intel';
let coin=null,global=null,marketAt=0,marketFetched=0,marketBusy=false;
let staked=NaN,stakingAt=0,stakingFetched=0,stakingBusy=false;
try{
 const saved=JSON.parse(read(CACHE)||'null');
 if(saved?.at>now()-3600000){
  coin=saved.coin||null;global=saved.global||null;marketAt=saved.at;
 }
 const chain=JSON.parse(read(STAKE_CACHE)||'null');
 if(chain?.at>now()-86400000&&Number.isFinite(Number(chain?.data?.bonded))){
  staked=Number(chain.data.bonded);stakingAt=chain.at;
 }
}catch(_){}
function labels(){
 text('injIntelTabIntel','INJ Intelligence');
 text('injIntelTabGlobal','Global Market');
 text('injIntelHeaderSubtitle',tr('Il centro di analisi di Injective','Injective market intelligence terminal'));
 text('injIntelPriceLabel',tr('PREZZO INJ','INJ PRICE'));
 text('injIntelMCLabel','MARKET CAP');
 text('injIntelVolLabel',tr('VOLUME 24H','24H VOLUME'));
 text('injIntelDominanceLabel','INJ DOMINANCE');
 text('injIntelStakedLabel',tr('INJ IN STAKING','STAKED INJ'));
 render();
}
function viewSwitch(next){
 view=next==='global'?'global':'intel';
 try{localStorage.setItem('inj_node_intel_view_v1',view)}catch(_){}
 $('injIntelligenceMain').hidden=view!=='intel';
 $('injGlobalMarket').hidden=view!=='global';
 text('injIntelHeaderSuffix',view==='global'?'TOP 200':'INJ');
 for(const button of document.querySelectorAll('[data-inj-intel-view]')){
  button.setAttribute('aria-pressed',String(button.dataset.injIntelView===view));
 }
}
function render(){
 const mcap=positive(coin?.market_cap),total=positive(global?.total_market_cap?.usd);
 const dominance=mcap&&total&&mcap<=total?mcap/total*100:NaN;
 text('injIntelPrice',usd(positive(coin?.current_price)));
 text('injIntelMarketCap',cap(mcap));
 text('injIntelVolume',cap(positive(coin?.total_volume)));
 text('injIntelDominance',percent(dominance,4));
 text('injIntelStaked',Number.isFinite(staked)?formatted(staked,0)+' INJ':'—');
 const daily=num(coin?.price_change_percentage_24h);
 text('injIntelDaily',Number.isFinite(daily)?(daily>0?'+':'')+percent(daily):'—');
 $('injIntelDaily')?.classList.toggle('is-down',Number.isFinite(daily)&&daily<0);
 insightRender();
 const t=Math.max(marketAt,stakingAt);
 const stale=t&&now()-t>6*60000;
 text('injIntelUpdate',t
  ?(stale?tr('Ultimi dati salvati · ','Last saved data · '):tr('Dati aggiornati · ','Data updated · '))+time(t)
  :tr('Sincronizzazione dati di mercato…','Syncing market data…'));
}

function insightRender(){
 const current=positive(coin?.current_price);
 const low=positive(coin?.low_24h),high=positive(coin?.high_24h);
 const ath=positive(coin?.ath);
 const circulating=positive(coin?.circulating_supply);
 const supply=positive(coin?.total_supply);
 const validRange=Number.isFinite(current)&&Number.isFinite(low)&&Number.isFinite(high)&&high>low&&current>=low*.95&&current<=high*1.05;
 const validAth=Number.isFinite(current)&&Number.isFinite(ath)&&ath>0;
 // Total supply is distinct from max supply and from staking.
 const validSupply=Number.isFinite(circulating)&&Number.isFinite(supply)&&supply>=circulating;
 const label=(id,it,eng)=>text(id,tr(it,eng));
 const percentLabel=(v)=>Number.isFinite(v)?formatted(v,1)+'%':'—';
 const uint=v=>Number.isFinite(v)?formatted(v,0)+' INJ':'—';
 label('injInsightTitle','Indicatori essenziali','Market essentials');
 text('injInsightSource',tr('CoinGecko · ','CoinGecko · ')+(marketAt?time(marketAt):'—'));
 label('injRangeTitle','Range prezzo 24H','24H price range');
 label('injRangeLowLabel','MIN 24H','24H LOW');
 label('injRangeHighLabel','MAX 24H','24H HIGH');
 label('injAthTitle',"Distanza dall'ATH",'ATH recovery');
 label('injAthCenterLabel','DEL MASSIMO','OF ATH');
 label('injAthMaxLabel','MASSIMO STORICO','ALL-TIME HIGH');
 label('injSupplyTitle','Distribuzione supply','Supply distribution');
 label('injSupplyCenterLabel','CIRCOLANTE','CIRCULATING');
 label('injSupplyCirculatingLabel','IN CIRCOLAZIONE','CIRCULATING');
 label('injSupplyRemainingLabel','DIFFERENZA DAL TOTALE','TOTAL LESS CIRCULATING');
 label('injInsightNote',
  "CoinGecko · I valori aggiornano insieme al prezzo. L'offerta non circolante non equivale ai token in staking.",
  'CoinGecko · Values update with the price. Non-circulating supply does not mean staked tokens.');
 const track=$('injRangeTrack');
 text('injRangePrice',usd(current));
 text('injRangeLow',usd(low));text('injRangeHigh',usd(high));
 if(track)track.dataset.ready=String(validRange);
 if(validRange){
  const n=Math.max(0,Math.min(1,(current-low)/(high-low)));
  track.style.setProperty('--inj-range-position',(n*100).toFixed(2)+'%');
  track.setAttribute('aria-label',tr('Prezzo INJ nel range 24 ore: ','INJ in 24-hour price range: ')+usd(current)+'. '+usd(low)+' — '+usd(high));
  text('injRangeNote',current<low||current>high?tr('Fuori intervallo','Outside range'):tr('POSIZIONE 24H','24H POSITION'));
 }else{
  track?.setAttribute('aria-label',tr('Range 24H non disponibile','24H range unavailable'));
  text('injRangeNote',tr('Dati insufficienti','Insufficient data'));
 }
 const ring=(arcId,gaugeId,ratio,description)=>{
  const r=Number.isFinite(ratio)?Math.max(0,Math.min(1,ratio)):NaN;
  const arc=$(arcId),gauge=$(gaugeId);
  if(arc)arc.style.strokeDasharray=Number.isFinite(r)?(r*314.1593).toFixed(2)+' 314.1593':'0 314.1593';
  if(gauge)gauge.setAttribute('aria-label',description);
 };
 if(validAth){
  const relative=current/ath;
  const recovering=Math.min(100,relative*100);
  text('injAthPercent',percentLabel(recovering));
  text('injAthPrice',usd(ath));
  text('injAthDistance',current<=ath?tr('Dal massimo: ','From ATH: ')+percentLabel((current/ath-1)*100):
   tr('Prezzo oltre ATH registrato','Price above recorded ATH'));
  ring('injAthArc','injAthGauge',relative,tr('Prezzo INJ pari al ','INJ price equals ')+percentLabel(recovering)+tr(' del massimo storico',' of the all-time high'));
 }else{
  text('injAthPercent','—');text('injAthPrice',usd(ath));text('injAthDistance',tr('ATH non disponibile','ATH unavailable'));
  ring('injAthArc','injAthGauge',NaN,tr('ATH non disponibile','ATH unavailable'));
 }
 const at=Date.parse(coin?.ath_date||'');
 text('injAthDate',Number.isFinite(at)?new Date(at).toLocaleDateString(en()?'en-US':'it-IT',{day:'2-digit',month:'short',year:'numeric'}):'—');
 if(validSupply){
  const fraction=circulating/supply;
  text('injSupplyPercent',percentLabel(fraction*100));
  text('injSupplyCirculating',uint(circulating));
  text('injSupplyRemaining',uint(Math.max(0,supply-circulating)));
  text('injSupplyTotal',tr('Supply totale: ','Total supply: ')+uint(supply));
  ring('injSupplyArc','injSupplyGauge',fraction,tr('Supply circolante: ','Circulating supply: ')+percentLabel(fraction*100));
 }else{
  text('injSupplyPercent','—');text('injSupplyCirculating',uint(circulating));
  text('injSupplyRemaining','—');
  text('injSupplyTotal',tr('Supply totale non disponibile','Total supply unavailable'));
  ring('injSupplyArc','injSupplyGauge',NaN,tr('Supply non disponibile','Supply unavailable'));
 }
}

function ingestShared(){
 try{
  const current=window.INJ_MARKET_READONLY_SNAPSHOT?.();
  const incoming=current?.injective;
  if(incoming&&positive(incoming.current_price)&&Number.isFinite(current.updated)&&current.updated>marketAt){
   coin=incoming;
   if(positive(current.global?.total_market_cap?.usd))global=current.global;
   marketAt=current.updated;
   save(CACHE,{at:marketAt,coin,global});
   render();
   return true;
  }
  if(current?.global?.total_market_cap?.usd&&!global){
   global=current.global;render();
  }
 }catch(_){}
 return false;
}
async function getJson(url,timeout=10500){
 const ctrl=new AbortController();
 const timer=setTimeout(()=>ctrl.abort(),timeout);
 try{
  const response=await fetch(url,{cache:'no-store',headers:{accept:'application/json'},signal:ctrl.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timer)}
}
async function marketFallback(force=false){
 if(marketBusy||document.hidden)return;
 if(!force&&coin&&global&&now()-marketAt<240000)return;
 if(!force&&now()-marketFetched<60000)return;
 marketBusy=true;marketFetched=now();
 try{
  const result=await Promise.allSettled([
   getJson(CG+'/coins/markets?vs_currency=usd&ids=injective-protocol&sparkline=false'),
   getJson(CG+'/global')
  ]);
  let changed=false;
  if(result[0].status==='fulfilled'){
   const c=result[0].value?.[0];
   if(c?.id==='injective-protocol'&&positive(c.current_price)){coin=c;changed=true}
  }
  if(result[1].status==='fulfilled'){
   const g=result[1].value?.data;
   if(positive(g?.total_market_cap?.usd)){global=g;changed=true}
  }
  if(changed){
   marketAt=now();save(CACHE,{at:marketAt,coin,global});
  }
 }catch(_){/* Keep last verified reading. */}finally{marketBusy=false;render()}
}
async function chainStaking(){
 if(stakingBusy||document.hidden||now()-stakingFetched<300000)return;
 stakingBusy=true;stakingFetched=now();
 for(const url of LCD){
  try{
   const result=await getJson(url+'/cosmos/staking/v1beta1/pool',5000);
   const bonded=Number(result?.pool?.bonded_tokens)/1e18;
   if(Number.isFinite(bonded)&&bonded>0&&bonded<2e8){
    staked=bonded;stakingAt=now();
    save(STAKE_CACHE,{at:stakingAt,data:{bonded}});
    break;
   }
  }catch(_){}
 }
 stakingBusy=false;render();
}
function tick(){
 if(document.hidden)return;
 ingestShared();
 if(!coin||!global||now()-marketAt>240000)void marketFallback();
 if(!Number.isFinite(staked)||now()-stakingAt>300000)void chainStaking();
}
for(const button of document.querySelectorAll('[data-inj-intel-view]')){
 button.addEventListener('click',()=>viewSwitch(button.dataset.injIntelView));
}
window.addEventListener('storage',e=>{
 if(e.key==='inj_node_language_v1')labels();
});
window.addEventListener('message',e=>{
 if(e.origin===location.origin&&e.data?.type==='injnode:market:language')labels();
});
window.addEventListener('pageshow',()=>{labels();tick()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
viewSwitch(view);labels();tick();
setInterval(tick,15000);
})();