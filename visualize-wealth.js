/* Valore Potenziale / Potential Value — selected Home wallet only, read-only simulator. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const PREFIX='inj_node_visualize_wealth_price_';
const SCENARIO='inj_node_visualize_wealth_scenario_v2';
let previousCurrency='';
let walletScope=read('inj_node_visualize_wealth_scope_v2')==='all'?'all':'selected';
let spotUsd=NaN;
let nextSpotCheck=0;
let spotLoading=false;
const missingWalletRequests=new Map();
const multiAprCache=new Map();
let waitingForRate=false;
let aprGeneration=0;
let aprLive={address:'',value:NaN,updated:0,nextAt:0,busy:false};
const dict={
it:{
 title:'Valore Potenziale',eyebrow:'SIMULATORE',
 kicker:'IL TUO PATRIMONIO, A QUALSIASI PREZZO',
 desc:'Immagina un prezzo per INJ e scopri quanto varrebbe il tuo patrimonio.',
 price:'PREZZO IPOTETICO DI 1 INJ',help:'Inserisci un prezzo e la simulazione si aggiorna immediatamente.',
 total:'NET WORTH SIMULATO',stake:'SOLO STAKING',
 totalBase:'Disponibili + staking + reward',stakeBase:'Solo INJ effettivamente delegati',
 note:'Simulazione indicativa: valorizza esclusivamente gli INJ, senza stimare altri token, commissioni o imposte.',
 yieldTitle:'RENDITA POTENZIALE DA STAKING · USD',yieldNote:'Valori stimati sul prezzo ipotetico e APR netto dei validatori, senza compound né variazioni future.',yieldLoading:'APR NETTO · SINCRONIZZAZIONE',yieldCached:'CACHE',yieldLive:'LIVE',yieldUnavailable:'APR non disponibile: in attesa della rete Injective.',yieldNoStake:'NESSUNO STAKING',yieldFx:'Cambio EUR/USD non disponibile per stimare la rendita in dollari.',
 scopeSelected:'WALLET SELEZIONATO',scopeAll:'ALL WALLETS',selectedTab:'Selezionato',allTab:'All Wallets',allWallets:'Tutti i wallet',walletCount:'wallet',
 noWallet:'Nessun wallet salvato',noSelected:'Nessun wallet selezionato',incomplete:'DATI INCOMPLETI',
 waiting:'IN ATTESA',saved:'DATI SALVATI',recent:'DATI AGGIORNATI',privacy:'PRIVACY ATTIVA',
 privacyNote:'I valori sono nascosti dalle impostazioni Privacy.', invalid:'Prezzo non valido'
},
en:{
 title:'Potential Value',eyebrow:'SIMULATOR',
 kicker:'YOUR WEALTH, AT ANY PRICE',
 desc:'Enter a hypothetical INJ price and visualize what your holdings could be worth.',
 price:'HYPOTHETICAL PRICE OF 1 INJ',help:'Enter a price to update the simulation instantly.',
 total:'SIMULATED NET WORTH',stake:'STAKING ONLY',
 totalBase:'Available + staked + rewards',stakeBase:'Delegated INJ only',
 note:'Illustrative simulation: values INJ only, excluding other tokens, fees and taxes.',
 yieldTitle:'POTENTIAL STAKING INCOME · USD',yieldNote:'Estimated at the hypothetical price and validator net APR, without compounding or future rate changes.',yieldLoading:'NET APR · SYNCING',yieldCached:'CACHED',yieldLive:'LIVE',yieldUnavailable:'APR unavailable: waiting for Injective network.',yieldNoStake:'NO STAKING',yieldFx:'EUR/USD exchange rate unavailable for USD yield estimates.',
 scopeSelected:'SELECTED WALLET',scopeAll:'ALL WALLETS',selectedTab:'Selected',allTab:'All Wallets',allWallets:'All wallets',walletCount:'wallets',
 noWallet:'No saved wallets',noSelected:'No selected wallet',incomplete:'INCOMPLETE DATA',
 waiting:'WAITING',saved:'CACHED DATA',recent:'UPDATED DATA',privacy:'PRIVACY ON',
 privacyNote:'Values are hidden by your Privacy settings.',invalid:'Invalid price'
}};
function read(k){try{return localStorage.getItem(k)}catch(_){return null}}
function lang(){return read('inj_node_language_v1')==='en'?'en':'it'}
function curr(){return read('inj_monitor_currency')==='EUR'?'EUR':'USD'}
function eurPerUsd(){
 // Shared market rate in INJ Node: one USD is this many EUR.
 const rate=Number(read('inj_monitor_eur_rate'));
 if(Number.isFinite(rate)&&rate>0&&rate<10)return rate;
 const parentRate=Number(dashboardSnapshot()?.eurPerUsd);
 return Number.isFinite(parentRate)&&parentRate>0&&parentRate<10?parentRate:NaN;
}
function convertedPrice(value,from,to){
 if(from===to)return value;
 const rate=eurPerUsd();
 if(!Number.isFinite(value)||!Number.isFinite(rate))return NaN;
 return from==='USD'?value*rate:value/rate;
}
function formatPriceInput(value){
 if(!Number.isFinite(value)||value<0)return '';
 return new Intl.NumberFormat(lang()==='en'?'en-US':'it-IT',{
  useGrouping:false,maximumFractionDigits:10
 }).format(value);
}
function savedScenario(){
 try{
  const data=JSON.parse(read(SCENARIO)||'null');
  if(data && ['EUR','USD'].includes(data.currency)){
   const price=Number(data.price);
   if(Number.isFinite(price)&&price>=0&&price<=1e12)return {currency:data.currency,price};
  }
 }catch(_){}
 return null;
}
function saveScenario(value,currency){
 try{
  const price=parsePrice(value);
  if(Number.isFinite(price))localStorage.setItem(SCENARIO,JSON.stringify({currency,price}));
  else localStorage.removeItem(SCENARIO);
 }catch(_){}
}
function parsePrice(input){
 const s=String(input||'').trim().replace(/[\s\u00a0\u202f€$]/g,'');
 if(!s||!/^[\d.,]+$/.test(s))return NaN;
 const d=s.lastIndexOf('.'),c=s.lastIndexOf(',');
 let normalized=s;
 if(d>=0&&c>=0){const dec=d>c?'.':',';normalized=s.split(dec==='.'?',':'.').join('').replace(dec,'.')}
 else if((s.match(/[.,]/g)||[]).length>1){const sep=c>=0?',':'.',pos=s.lastIndexOf(sep);normalized=s.slice(0,pos).replace(/[.,]/g,'')+'.'+s.slice(pos+1)}
 else normalized=s.replace(',','.');
 const value=Number(normalized);
 return Number.isFinite(value)&&value>=0&&value<=1e12?value:NaN;
}
function num(n){const v=Number(n);return n===null||n===undefined||!Number.isFinite(v)||v<0?NaN:v}
function fmtQty(n){return new Intl.NumberFormat(lang()==='en'?'en-US':'it-IT',{maximumFractionDigits:4}).format(n)}
function money(n){
 const currency=curr();
 return new Intl.NumberFormat(currency==='EUR'?'it-IT':'en-US',{
  style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2
 }).format(n);
}
function dashboardSnapshot(){
 try{
  if(window.parent!==window && window.parent.location.origin===location.origin){
   const fn=window.parent.INJ_GET_POTENTIAL_VALUE_SNAPSHOT;
   if(typeof fn==='function'){
    const snapshot=fn();
    if(snapshot&&Array.isArray(snapshot.wallets))return snapshot;
   }
  }
 }catch(_){}
 return null;
}
function validWalletAddress(address){return /^inj1[a-z0-9]{30,}$/i.test(String(address||''))}
function normalizeWallet(entry,cached){
 const address=String(entry?.address||'').trim().toLowerCase();
 if(!validWalletAddress(address))return null;
 const total=num(entry?.total),staked=num(entry?.staked),updated=Number(entry?.updated)||0;
 const validLive=updated>0&&Number.isFinite(total)&&Number.isFinite(staked)&&staked<=total+1e-5;
 const cachedTotal=num(cached?.total),cachedStaked=num(cached?.staked),cachedUpdated=Number(cached?.updated)||0;
 const cachedValid=cachedUpdated>0&&Number.isFinite(cachedTotal)&&Number.isFinite(cachedStaked)&&cachedStaked<=cachedTotal+1e-5;
 const useLive=validLive&&(!cachedValid||updated>=cachedUpdated);
 const source=useLive?entry:cachedValid?cached:null;
 return {
  address,label:String(entry?.label||cached?.label||'Wallet'),
  total:source?num(source.total):NaN,
  staked:source?num(source.staked):NaN,
  updated:source?(Number(source.updated)||0):0,
  personalApr:Number.isFinite(cachedApr(entry?.personalApr))?cachedApr(entry.personalApr):cachedApr(cached?.personalApr)
 };
}
function getRows(){
 let wallets=[],summaries={};
 try{wallets=JSON.parse(read('inj_monitor_wallets_v1')||'[]')}catch(_){}
 try{summaries=JSON.parse(read('inj_monitor_summaries_v1')||'{}')}catch(_){}
 if(!Array.isArray(wallets))wallets=[];
 if(!summaries||typeof summaries!=='object')summaries={};
 const snapshot=dashboardSnapshot();
 const sources=snapshot?snapshot.wallets:wallets;
 const seen=new Set(),rows=[];
 for(const item of sources){
  const address=String(item?.address||'').trim().toLowerCase();
  if(!validWalletAddress(address)||seen.has(address))continue;
  seen.add(address);
  const row=normalizeWallet(item,summaries[address]);
  if(row)rows.push(row);
 }
 let selected=snapshot?String(snapshot.selectedAddress||'').toLowerCase():String(read('inj_monitor_address')||'').toLowerCase();
 if(!rows.some(row=>row.address===selected))selected=rows[0]?.address||'';
 const marketPrice=num(snapshot?.priceUsd);
 if(marketPrice>0)spotUsd=marketPrice;
 return {rows,selected,priceUsd:marketPrice>0?marketPrice:spotUsd,source:snapshot?'dashboard':'cache'};
}
function refreshSpotPrice(){
 if(document.hidden||spotUsd>0||spotLoading||Date.now()<nextSpotCheck)return;
 spotLoading=true;nextSpotCheck=Date.now()+60_000;
 apiJson('https://api.binance.com/api/v3/ticker/price?symbol=INJUSDT')
  .then(data=>{
   const price=num(data?.price);
   if(price>0){spotUsd=price;render();}
  }).catch(()=>{}).finally(()=>{spotLoading=false;});
}
// APR is expressed in percent, as in Dashboard. Never infer it from wallet balances.
function cachedApr(value){
 if(value===null||value===undefined||value==='')return NaN;
 const v=Number(value);
 return Number.isFinite(v)&&v>=0&&v<=100? v:NaN;
}
function aprPercent(value){
 const n=Number(value);
 return Number.isFinite(n)&&n>0?(n<=1?n*100:n):NaN;
}
function chainRate(value){
 const n=Number(value);
 return Number.isFinite(n)&&n>=0?(n>1?n/1e18:n):NaN;
}
const lcdEndpoints=['https://sentry.lcd.injective.network:443','https://lcd.injective.network','https://1rpc.io/inj-lcd'];
async function apiJson(url){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8500);
 try{
  const response=await fetch(url,{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timer)}
}
async function chainJson(path){
 let error;
 for(const base of lcdEndpoints){
  try{return await apiJson(base+path)}catch(e){error=e}
 }
 throw error||Error('Injective LCD unavailable');
}
async function networkApr(){
 // Same primary APR feed as Dashboard, with its on-chain fallback.
 try{
  const data=await apiJson('https://api.ui.injective.network/api/v1/cache/stats/apr');
  const live=aprPercent(data?.apr);
  if(Number.isFinite(live))return live;
 }catch(_){}
 const [mint,pool,distribution]=await Promise.all([
  chainJson('/cosmos/mint/v1beta1/annual_provisions'),
  chainJson('/cosmos/staking/v1beta1/pool'),
  chainJson('/cosmos/distribution/v1beta1/params').catch(()=>null)
 ]);
 const annual=Number(mint?.annual_provisions);
 const bonded=Number(pool?.pool?.bonded_tokens);
 const tax=chainRate(distribution?.params?.community_tax);
 const rate=bonded>0&&annual>0?(annual/bonded)*100*(1-(Number.isFinite(tax)?Math.min(1,tax):0)):NaN;
 if(!Number.isFinite(rate)||rate<=0)throw Error('APR unavailable');
 return rate;
}
async function livePersonalApr(address){
 const [data,baseApr]=await Promise.all([
  chainJson('/cosmos/staking/v1beta1/delegations/'+encodeURIComponent(address)),
  networkApr()
 ]);
 const delegated=(Array.isArray(data?.delegation_responses)?data.delegation_responses:[])
  .map(r=>({operator:String(r?.delegation?.validator_address||''),amount:Number(r?.balance?.amount)/1e18}))
  .filter(r=>r.operator&&Number.isFinite(r.amount)&&r.amount>0);
 const total=delegated.reduce((sum,r)=>sum+r.amount,0);
 if(total<=0)return 0;
 // Each validator's commission and jailed/bonded status are included; no
 // blanket network APR is applied to an inactive delegation.
 const rows=await Promise.all(delegated.map(async row=>{
  const data=await chainJson('/cosmos/staking/v1beta1/validators/'+encodeURIComponent(row.operator));
  const validator=data?.validator;
  if(!validator)throw Error('Validator details missing');
  const commission=chainRate(validator?.commission?.commission_rates?.rate);
  if(!Number.isFinite(commission)||commission>1)throw Error('Validator commission unavailable');
  const active=!validator.jailed&&(!validator.status||validator.status==='BOND_STATUS_BONDED');
  return row.amount*(active?Math.max(0,1-commission):0);
 }));
 return baseApr*rows.reduce((sum,value)=>sum+value,0)/total;
}
function syncApr(wallet){
 const address=wallet?.address||'';
 if(aprLive.address!==address){
  aprGeneration++;
  aprLive={address,value:NaN,updated:0,nextAt:0,busy:false};
 }
 if(!address||!ready(wallet)||!(wallet.staked>0))return;
 const now=Date.now();
 if(aprLive.busy||now<aprLive.nextAt)return;
 const generation=aprGeneration;
 aprLive.busy=true;
 // Re-read every five minutes while the section is visible; retry failures.
 aprLive.nextAt=now+5*60_000;
 livePersonalApr(address).then(value=>{
  if(generation!==aprGeneration)return;
  aprLive.value=value;
  aprLive.updated=Date.now();
  aprLive.nextAt=Date.now()+5*60_000;
 }).catch(()=>{
  if(generation!==aprGeneration)return;
  aprLive.nextAt=Date.now()+35_000;
 }).finally(()=>{
  if(generation!==aprGeneration)return;
  aprLive.busy=false;
  render();
 });
}
function usdMoney(value){
 const abs=Math.abs(value);
 const digits=abs>0&&abs<.01?4:2;
 return new Intl.NumberFormat(lang()==='en'?'en-US':'it-IT',{
  style:'currency',currency:'USD',minimumFractionDigits:digits,maximumFractionDigits:digits
 }).format(value);
}
function renderYield(wallet,complete,price,hidden){
 const t=dict[lang()];
 if(walletScope==='all')syncMultiApr(wallet);
 else syncApr(wallet);
 const hasStake=complete&&wallet.staked===0;
 const aprLiveValue=walletScope==='all'?wallet?.personalApr:(aprLive.address===wallet?.address&&aprLive.updated>0?aprLive.value:NaN);
 const apr=Number.isFinite(aprLiveValue)?aprLiveValue:cachedApr(wallet?.personalApr);
 const live=walletScope==='all'?Boolean(wallet?.allLive):Number.isFinite(aprLiveValue)&&Date.now()-aprLive.updated<10*60_000;
 const usdPrice=convertedPrice(price,curr(),'USD');
 const canCalculate=complete&&Number.isFinite(price)&&Number.isFinite(usdPrice)&&(hasStake||Number.isFinite(apr));
 const netApr=hasStake?0:apr;
 const periods=[['wealthYield1h',1/24],['wealthYield1d',1],['wealthYield1w',7],['wealthYield1m',365/12],['wealthYield1y',365]];
 for(const [id,days] of periods){
  $(id).textContent=hidden?'••••••':canCalculate?usdMoney(wallet.staked*netApr/100*days/365*usdPrice):'—';
 }
 $('wealthYieldApr').textContent=hidden?'APR · ••••••':
  hasStake?'APR · '+t.yieldNoStake:
  Number.isFinite(apr)?(lang()==='en'?'NET APR ':'APR NETTO ')+apr.toFixed(3)+'% · '+(live?t.yieldLive:t.yieldCached):
  t.yieldLoading;
 $('wealthYieldNote').textContent=hidden?t.privacyNote:
  !Number.isFinite(usdPrice)&&Number.isFinite(price)?t.yieldFx:
  !hasStake&&!Number.isFinite(apr)&&!aprLive.busy&&complete?t.yieldUnavailable:t.yieldNote;
}
function aggregateWallets(rows){
 if(!rows.length)return null;
 const readyRows=rows.filter(ready);
 const complete=readyRows.length===rows.length;
 // An unsynchronised account must never blank out the accounts already
 // available. Show a clearly labelled partial total while catching up.
 const staked=readyRows.reduce((sum,r)=>sum+r.staked,0);
 const total=readyRows.reduce((sum,r)=>sum+r.total,0);
 const weighted=readyRows.reduce((sum,r)=>{
  const cached=multiAprCache.get(r.address);
  const apr=cached?.updated?cached.value:r.personalApr;
  return sum+(r.staked>0&&Number.isFinite(apr)?r.staked*apr:0);
 },0);
 const aprReady=readyRows.every(r=>r.staked<=0||Number.isFinite(multiAprCache.get(r.address)?.updated?multiAprCache.get(r.address).value:r.personalApr));
 return {address:'__all__',label:'All wallets',
  total:readyRows.length?total:NaN,staked:readyRows.length?staked:NaN,
  updated:readyRows.length?Math.min(...readyRows.map(r=>r.updated)):0,
  partial:!complete,readyCount:readyRows.length,walletCount:rows.length,
  personalApr:aprReady&&readyRows.length&&staked>0?weighted/staked:readyRows.length&&staked===0?0:NaN,
  allLive:complete&&readyRows.every(r=>r.staked<=0||(multiAprCache.get(r.address)?.updated>0&&Date.now()-multiAprCache.get(r.address).updated<10*60_000)),
  members:rows};
}
async function recoverMissingWallet(row){
 const address=row?.address;
 if(!address||ready(row))return;
 const prior=missingWalletRequests.get(address);
 if(prior && (prior.loading||Date.now()<prior.retryAt))return;
 const pending={loading:true,retryAt:Date.now()+45000};
 missingWalletRequests.set(address,pending);
 try{
  const [bank,delegations,rewards]=await Promise.all([
   chainJson('/cosmos/bank/v1beta1/balances/'+encodeURIComponent(address)),
   chainJson('/cosmos/staking/v1beta1/delegations/'+encodeURIComponent(address)),
   chainJson('/cosmos/distribution/v1beta1/delegators/'+encodeURIComponent(address)+'/rewards')
  ]);
  const units=1e18;
  const available=(bank?.balances||[]).filter(x=>x?.denom==='inj').reduce((sum,x)=>sum+Number(x.amount||0)/units,0);
  const staked=(delegations?.delegation_responses||[]).reduce((sum,x)=>sum+Number(x?.balance?.amount||0)/units,0);
  const reward=(rewards?.total||[]).filter(x=>x?.denom==='inj').reduce((sum,x)=>sum+Number(x.amount||0)/units,0);
  if(![available,staked,reward].every(Number.isFinite))throw Error('Incomplete wallet amounts');
  // Merge against the freshest shared cache, never replace other accounts.
  const summaries=JSON.parse(read('inj_monitor_summaries_v1')||'{}');
  if((Number(summaries[address]?.updated)||0)<Date.now()-10000){
   summaries[address]={...summaries[address],available,staked,rewards:reward,total:available+staked+reward,updated:Date.now()};
   localStorage.setItem('inj_monitor_summaries_v1',JSON.stringify(summaries));
  }
 }catch(_){
  pending.retryAt=Date.now()+45000;
 }finally{
  pending.loading=false;
  render();
 }
}
function syncMissingWallets(rows){
 const waiting=rows.filter(r=>!ready(r)&&!missingWalletRequests.get(r.address)?.loading);
 // Two requests at most, avoiding network congestion on iPhone/PWA.
 let busy=[...missingWalletRequests.values()].filter(x=>x.loading).length;
 for(const row of waiting){
  if(busy>=2)break;
  const previous=missingWalletRequests.get(row.address);
  if(previous&&Date.now()<previous.retryAt)continue;
  busy++;
  void recoverMissingWallet(row);
 }
}
function syncMultiApr(wallet){
 if(!wallet?.members)return;
 let inflight=[...multiAprCache.values()].filter(entry=>entry.busy).length;
 for(const row of wallet.members){
  if(inflight>=2)break;
  if(!ready(row)||row.staked<=0)continue;
  const old=multiAprCache.get(row.address);
  if(old?.busy||Date.now()<(old?.nextAt||0))continue;
  const entry={value:old?.value??NaN,updated:old?.updated||0,nextAt:Date.now()+5*60_000,busy:true};
  multiAprCache.set(row.address,entry);
  inflight++;
  livePersonalApr(row.address).then(apr=>{
   entry.value=apr;entry.updated=Date.now();entry.nextAt=Date.now()+5*60_000;
  }).catch(()=>{entry.nextAt=Date.now()+35_000}).finally(()=>{entry.busy=false;render()});
 }
}
function ready(row){return row&&row.updated>0&&Number.isFinite(row.total)&&Number.isFinite(row.staked)&&row.staked<=row.total+1e-5}
function translate(){
 const t=dict[lang()];document.documentElement.lang=lang();
 const texts={
  wealthPageTitle:t.title,wealthMainTitle:t.title,wealthEyebrow:t.eyebrow,
  wealthKicker:t.kicker,wealthDescription:t.desc,wealthPriceLabel:t.price,
  wealthTotalLabel:t.total,wealthStakedLabel:t.stake,wealthFootnote:t.note,
  wealthYieldTitle:t.yieldTitle
 };
 for(const [id,str] of Object.entries(texts))$(id).textContent=str;
 document.title=t.title+' · INJ Node';
}
function render(){
 const t=dict[lang()],unit=curr();translate();
 if(previousCurrency!==unit||waitingForRate){
  const prior=previousCurrency;
  const existing=prior?parsePrice($('wealthPrice').value):NaN;
  const scenario=savedScenario();
  const source=prior&&Number.isFinite(existing)
   ?{price:existing,currency:prior}:scenario;
  let nextValue=read(PREFIX+unit.toLowerCase()+'_v1')||'';
  waitingForRate=false;
  if(source){
   const equivalent=convertedPrice(source.price,source.currency,unit);
   if(Number.isFinite(equivalent)){
    nextValue=formatPriceInput(equivalent);
    try{localStorage.setItem(PREFIX+unit.toLowerCase()+'_v1',nextValue)}catch(_){}
   }else{
    // Never mislabel a cached USD amount as EUR if the FX rate is missing.
    nextValue='';
    waitingForRate=true;
   }
  }
  previousCurrency=unit;
  $('wealthCurrency').textContent=unit==='EUR'?'€':'$';
  $('wealthPrice').value=nextValue;
  if(nextValue&&source&&source.currency!==unit)saveScenario(nextValue,unit);
 }
 $('wealthPriceLabel').textContent=t.price+' · '+unit;
 const price=parsePrice($('wealthPrice').value);
 const all=getRows();
 if(walletScope==='all')syncMissingWallets(all.rows);
 const wallet=walletScope==='all'?aggregateWallets(all.rows):all.rows.find(r=>r.address===all.selected);
 $('wealthScopeText').textContent=walletScope==='all'?(lang()==='en'?'ALL · ':'TUTTI · ')+all.rows.length:(lang()==='en'?'SINGLE':'SINGOLO');
 $('wealthScopeToggle').setAttribute('aria-pressed',String(walletScope==='all'));
 $('wealthScopeToggle').dataset.scope=walletScope;
 $('wealthScopeToggle').title=walletScope==='all'?t.scopeSelected:t.scopeAll;
 $('wealthScopeToggle').setAttribute('aria-label',(walletScope==='all'?t.scopeAll:t.scopeSelected)+(walletScope==='all'?' · '+all.rows.length:''));
 $('wealthScopeToggle').disabled=all.rows.length===0;
 const complete=ready(wallet);
 const total=complete?wallet.total:NaN;
 const staked=complete?wallet.staked:NaN;
 const oldest=complete?wallet.updated:0;
 const privateOn=read('inj_monitor_privacy')==='1';
 const partial=walletScope==='all'&&Boolean(wallet?.partial);
 const status=privateOn?t.privacy:partial?wallet.readyCount+'/'+wallet.walletCount+' '+(lang()==='en'?'SYNCED':'SINCRONIZZATI'):complete?(Date.now()-oldest<120000?t.recent:t.saved):wallet?t.incomplete:t.waiting;
 $('wealthDataStatus').textContent=status;
 $('wealthWalletLabel').textContent=walletScope==='all'?(t.allWallets+' · '+all.rows.length+' '+t.walletCount):(wallet?(lang()==='en'?'Selected wallet · ':'Wallet selezionato · ')+wallet.label:(all.rows.length?t.noSelected:t.noWallet));
 const valid=complete&&Number.isFinite(price);
 const visible=valid&&!privateOn;
 $('wealthTotal').textContent=privateOn?'••••••':visible?money(total*price):'—';
 $('wealthStaked').textContent=privateOn?'••••••':visible?money(staked*price):'—';
 $('wealthTotalDetail').textContent=privateOn?t.privacyNote:complete?fmtQty(total)+' INJ · '+t.totalBase+(partial?' · '+wallet.readyCount+'/'+wallet.walletCount+' '+t.walletCount:''):wallet?t.totalBase+' · '+t.incomplete:(all.rows.length?t.noSelected:t.noWallet);
 $('wealthStakedDetail').textContent=privateOn?t.privacyNote:complete?fmtQty(staked)+' INJ · '+t.stakeBase+(partial?' · '+wallet.readyCount+'/'+wallet.walletCount+' '+t.walletCount:''):t.stakeBase;
 renderYield(wallet,complete,price,privateOn);
 $('wealthPriceHelp').textContent=waitingForRate
  ?(lang()==='en'?'Waiting for the EUR/USD exchange rate, or enter a price manually.':'In attesa del cambio EUR/USD, oppure inserisci un prezzo manualmente.')
  :$('wealthPrice').value&&!Number.isFinite(price)?t.invalid:t.help;
}
$('wealthScopeToggle').addEventListener('click',()=>{walletScope=walletScope==='selected'?'all':'selected';try{localStorage.setItem('inj_node_visualize_wealth_scope_v1',walletScope)}catch(_){}render()});
$('wealthPrice').addEventListener('input',()=>{
 const key=PREFIX+curr().toLowerCase()+'_v1';
 try{if($('wealthPrice').value)localStorage.setItem(key,$('wealthPrice').value);else localStorage.removeItem(key)}catch(_){}
 waitingForRate=false;
 saveScenario($('wealthPrice').value,curr());
 render();
});
$('visualizeWealthBack').addEventListener('click',()=>{
 if(parent!==window)parent.postMessage({type:'injnode:section:home'},location.origin);
 else location.href='./index.html';
});
window.addEventListener('storage',(event)=>{
 if(!event.key||['inj_monitor_currency','inj_monitor_eur_rate',
    'inj_monitor_privacy','inj_node_language_v1',
    'inj_monitor_wallets_v1','inj_monitor_summaries_v1',
    'inj_monitor_address','inj_node_comparison_selected_wallet_v1'].includes(event.key))render();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
render();
setInterval(()=>{if(!document.hidden)render()},2000);
})();