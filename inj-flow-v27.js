'use strict';

const $ = (id) => document.getElementById(id);
const INJ_DECIMALS = 1e18;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const REWARD_REFRESH_MS = 2600;
const STATUS_REFRESH_MS = 8500;
const APR_REFRESH_MS = 120000;
const MARKET_REFRESH_MS = 60000;
const PARTICLE_TICK_MS = 120;
const OFFICIAL_APR_ENDPOINT = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
const LCD_ENDPOINTS = [
  'https://sentry.lcd.injective.network:443',
  'https://lcd.injective.network',
  'https://1rpc.io/inj-lcd'
];

const validatorCommissionCache = new Map();
const state = {
  wallets: [], networkApr: 0, price: 0, change24h: 0, eurRate: 0.86, currency: 'USD',
  lastSync: 0, socket: null, reconnectTimer: 0, statusLoading: false, rewardLoading: false,
  fastLoading: false, aprLoading: false, particleTimer: 0, layoutTimer: 0, orientationUntil: 0,
  projectionNext: new Map(), rewardStream: [], streamBatch: 0, streamSeq: 0, streamCompleting: false, streamTimer: 0
};

const number = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
function fromWei(value){
  const raw=String(value??'0').trim();
  if(!/^-?\d+$/.test(raw)) return number(value)/INJ_DECIMALS;
  const neg=raw.startsWith('-'), digits=neg?raw.slice(1):raw, padded=digits.padStart(19,'0');
  const whole=padded.slice(0,-18)||'0', frac=padded.slice(-18,-6);
  const out=Number(whole)+Number(frac||'0')/1e12; return neg?-out:out;
}
const lang = () => { try { return localStorage.getItem('inj_node_language_v1') === 'en' ? 'en' : 'it'; } catch (_) { return 'it'; } };
const locale = () => lang()==='en'?'en-US':'it-IT';
const copy = (it,en) => lang()==='en'?en:it;
const validAddress = (value) => /^inj1[0-9a-z]{20,80}$/i.test(String(value||'').trim());

const TIER_COPY = {
  it:{low:'BASSA',normal:'NORMALE',high:'ALTA','very-high':'MOLTO ALTA',extreme:'ESTREMA'},
  en:{low:'LOW',normal:'NORMAL',high:'HIGH','very-high':'VERY HIGH',extreme:'EXTREME'}
};
const FLOW_TIERS = [
  {key:'low',min:0,max:.010,color:'#718b95',pps:.55,travel:2550,size:4},
  {key:'normal',min:.010,max:.050,color:'#22d3ee',pps:.95,travel:2150,size:5},
  {key:'high',min:.050,max:.100,color:'#45e0a4',pps:1.45,travel:1780,size:5.8},
  {key:'very-high',min:.100,max:.200,color:'#ffb347',pps:2.15,travel:1420,size:6.7},
  {key:'extreme',min:.200,max:Infinity,color:'#ff4f92',pps:3.20,travel:1080,size:8}
];
const FLOW_STOPS = [
  {value:0,color:'#718b95'},{value:.010,color:'#22d3ee'},{value:.050,color:'#45e0a4'},
  {value:.100,color:'#ffb347'},{value:.200,color:'#ff4f92'},{value:.500,color:'#ff7ab0'}
];

function setText(id,it,en){ const el=$(id); if(el) el.textContent=copy(it,en); }
function tierLabel(key){ return (TIER_COPY[lang()]||TIER_COPY.it)[key]||'—'; }
function applyLanguage(){
  document.documentElement.lang=lang();
  setText('flowSubtitle','Flusso della produzione INJ','INJ production flow');
  setText('sourcesEyebrow','SORGENTI','SOURCES'); setText('sourcesTitle','5 wallet','5 wallets');
  setText('outputsEyebrow','DESTINAZIONE','DESTINATION'); setText('outputsTitle','Reward raggiunto','Rewards reached');
  setText('flowCoreKicker','STAKING TOTALE','TOTAL STAKING'); setText('flowDailyUnit','INJ IN STAKING','INJ STAKED');
  setText('coreStakedLabel','PRODUZIONE / GIORNO','PRODUCTION / DAY'); setText('coreRewardLabel','WALLET ATTIVI','ACTIVE WALLETS');
  setText('flowNextInjLabel','1 INJ OGNI','1 INJ EVERY');
  setText('flowLegendLabel','VELOCITÀ DI PRODUZIONE','PRODUCTION SPEED');
  setText('legendLow','BASSA','LOW'); setText('legendNormal','NORMALE','NORMAL'); setText('legendHigh','ALTA','HIGH'); setText('legendVeryHigh','MOLTO ALTA','VERY HIGH'); setText('legendExtreme','ESTREMA','EXTREME');
  setText('rewardReachedLabel','REWARD RAGGIUNTO','REWARDS REACHED'); setText('rewardCurrentProductionLabel','PRODUZIONE ATTUALE','CURRENT PRODUCTION'); setText('rewardNextLabel','PROSSIMO +1 INJ','NEXT +1 INJ'); setText('rewardFlowLabel','FLUSSO LIVE','LIVE FLOW'); setText('rewardStreamTitle','REWARD STREAM','REWARD STREAM'); setText('flowStreamEmpty','In attesa del prossimo reward…','Waiting for the next reward…');
  setText('flowEmptyTitle','Nessun wallet salvato','No saved wallets'); setText('flowEmptyText','Aggiungi un wallet dalla Home.','Add a wallet from Home.');
  setText('flowDataNote','Saldo, staking e reward sono dati on-chain. Il Reward Stream mostra in chiaro cosa trasporta ogni pallino.','Balance, staking and rewards are on-chain. Reward Stream clearly shows what each particle is carrying.');
  const close=$('flowClose'); if(close){close.setAttribute('aria-label',copy('Torna alla Home','Back to Home'));close.title='Home';}
  renderWallets(); renderTotals();
}

function formatInj(value,digits=2){ return number(value).toLocaleString(locale(),{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true}); }
function formatReward(value,digits=6){ return number(value).toLocaleString(locale(),{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true}); }
function formatProduction(value){
  const v=Math.max(0,number(value)); const digits=v<1?6:v<10?5:v<100?4:v<1000?3:2;
  return v.toLocaleString(locale(),{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true});
}
function formatDurationFromDays(days){
  const d=Math.max(0,number(days)); if(!(d>0)) return '—';
  if(d<1/24) return `${Math.max(1,Math.round(d*1440))} ${copy('min','min')}`;
  if(d<1) return `${(d*24).toFixed(d*24<10?1:0)} ${copy('ore','h')}`;
  if(d<60) return `${d.toFixed(d<10?1:0)} ${copy('giorni','days')}`;
  const months=d/30.4375; if(months<24) return `${months.toFixed(months<10?1:0)} ${copy('mesi','months')}`;
  return `${(d/365.25).toFixed(1)} ${copy('anni','years')}`;
}
function aprPercent(value){ const n=number(value); return n<=0?0:(n<=1?n*100:n); }
function findInj(coins=[]){ const c=(Array.isArray(coins)?coins:[]).find(x=>x?.denom==='inj'); return c?fromWei(c.amount):0; }
function rewardTotal(data){ return (data?.total||[]).filter(c=>c?.denom==='inj').reduce((s,c)=>s+fromWei(c.amount),0); }
function delegationRows(data){ return (data?.delegation_responses||[]).map(r=>({validator:String(r?.delegation?.validator_address||''),amount:fromWei(r?.balance?.amount)})).filter(r=>r.validator&&r.amount>0); }

function productionTier(daily){ const d=Math.max(0,number(daily)); return FLOW_TIERS.find(t=>d<t.max)||FLOW_TIERS[FLOW_TIERS.length-1]; }
function hexRgb(hex){ const v=hex.replace('#',''); return [0,2,4].map(i=>parseInt(v.slice(i,i+2),16)); }
function mixColor(a,b,t){ const A=hexRgb(a),B=hexRgb(b); return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join(''); }
function productionColor(daily){ return productionTier(daily).color; }
function particleIntervalMs(daily){ const d=Math.max(0,number(daily)); if(!(d>0))return Infinity; const tier=productionTier(d); return 1000/Math.max(.1,tier.pps); }
function particleTravelMs(daily){ const d=Math.max(0,number(daily)); return d>0?productionTier(d).travel:2400; }
function particlePayloadInj(daily,elapsedMs){ const d=Math.max(0,number(daily)),iv=Math.max(0,number(elapsedMs)||particleIntervalMs(d)); return Number.isFinite(iv)?d*iv/86400000:0; }
function formatPayload(value){ const v=Math.max(0,number(value)); return v.toLocaleString(locale(),{minimumFractionDigits:v<.000001?9:8,maximumFractionDigits:9,useGrouping:false}); }
function streamThreshold(daily){
  const ladder=[.000001,.000002,.000005,.00001,.00002,.00005,.0001,.0002,.0005,.001,.002,.005,.01,.02,.05,.1,.2,.5,1,2,5,10,20,50,100];
  const target=Math.max(.000001,Math.max(0,number(daily))*10/86400);
  return ladder.find(v=>v>=target)||ladder[ladder.length-1];
}
function streamThresholdDigits(value){ const v=Math.max(0,number(value)); if(v<.00001)return 7;if(v<.0001)return 6;if(v<.001)return 5;if(v<.01)return 4;if(v<.1)return 3;if(v<1)return 2;return v<10?2:1; }
function formatStreamAmount(value,threshold=0){ const v=Math.max(0,number(value)),d=Math.max(streamThresholdDigits(threshold),v<.000001?9:v<.00001?8:v<.0001?7:v<.001?6:v<.01?5:v<.1?4:3);return v.toLocaleString(locale(),{minimumFractionDigits:d,maximumFractionDigits:d,useGrouping:false}); }
function renderRewardStream(){
  const list=$('flowRewardStream'),empty=$('flowStreamEmpty'),counter=$('flowStreamCounter'),bar=$('flowStreamProgress'),panel=$('flowRewardStreamPanel');if(!list||!counter||!bar)return;
  const threshold=streamThreshold(totals().daily),ratio=threshold>0?Math.min(1,state.streamBatch/threshold):0;
  counter.textContent=`${formatStreamAmount(state.streamBatch,threshold)} / ${formatStreamAmount(threshold,threshold)} INJ`;
  bar.style.transform=`scaleX(${ratio})`;bar.style.background=productionColor(totals().daily);bar.style.boxShadow=`0 0 15px ${productionColor(totals().daily)}`;
  if(panel)panel.style.setProperty('--stream-color',productionColor(totals().daily));
  const frag=document.createDocumentFragment(),visible=state.rewardStream.slice(-6),newest=visible.length?visible[visible.length-1].seq:0;
  for(const event of visible){
    const row=document.createElement('div');row.className=`flow-stream-row${event.seq===newest?' is-new':''}`;row.dataset.seq=String(event.seq);row.style.setProperty('--event-color',event.color);
    const dot=document.createElement('i'),name=document.createElement('span'),amount=document.createElement('strong');
    name.textContent=event.label;amount.textContent=`+${formatPayload(event.amount)} INJ`;amount.className='private';row.append(dot,name,amount);frag.appendChild(row);
  }
  list.replaceChildren(frag);if(empty)empty.hidden=state.rewardStream.length>0;
  applyPrivacy();
}
function finishRewardStreamBatch(threshold){
  if(state.streamCompleting)return;state.streamCompleting=true;const cutoff=state.streamSeq,panel=$('flowRewardStreamPanel'),done=$('flowStreamComplete');
  if(panel){panel.classList.remove('is-complete');void panel.offsetWidth;panel.classList.add('is-complete');}
  if(done){done.textContent=`+${formatStreamAmount(threshold,threshold)} INJ ${copy('COMPLETATO','COMPLETED')}`;done.setAttribute('aria-hidden','false');}
  clearTimeout(state.streamTimer);state.streamTimer=setTimeout(()=>{
    state.rewardStream=state.rewardStream.filter(e=>e.seq>cutoff);state.streamCompleting=false;
    if(panel)panel.classList.remove('is-complete');if(done)done.setAttribute('aria-hidden','true');renderRewardStream();
    const nextThreshold=streamThreshold(totals().daily);if(state.streamBatch>=nextThreshold){state.streamBatch=Math.max(0,state.streamBatch-nextThreshold);finishRewardStreamBatch(nextThreshold);}
  },820);
}
function pushRewardStream(row,amount,tier){
  const value=Math.max(0,number(amount));if(!(value>0)||!row)return;
  const event={seq:++state.streamSeq,label:row.label||`Wallet ${row.index+1}`,amount:value,color:tier?.color||productionColor(dailyProduction(row))};
  state.rewardStream.push(event);if(state.rewardStream.length>12)state.rewardStream.splice(0,state.rewardStream.length-12);state.streamBatch+=value;renderRewardStream();
  const threshold=streamThreshold(totals().daily);if(!state.streamCompleting&&state.streamBatch>=threshold){state.streamBatch=Math.max(0,state.streamBatch-threshold);finishRewardStreamBatch(threshold);}
}
function dailyProduction(row){ return Math.max(0,number(row?.ratePerMs))*86400000; }
function applyFlowVisual(el,daily){ if(!el)return; el.style.setProperty('--flow-color',productionColor(daily)); el.dataset.tier=productionTier(daily).key; }

async function fetchJson(url,timeout=4200){ const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}finally{clearTimeout(t);} }
async function lcd(path){ let last;for(const base of LCD_ENDPOINTS){try{return await fetchJson(base+path);}catch(e){last=e;}}throw last||new Error('Injective unavailable'); }

function readCachedSummaries(){ try{const v=JSON.parse(localStorage.getItem('inj_monitor_summaries_v1')||'{}');return v&&typeof v==='object'?v:{};}catch(_){return{};} }
function persistSnapshots(){
  try{
    const cached=readCachedSummaries();
    for(const row of state.wallets){cached[row.address]={...(cached[row.address]||{}),available:Math.max(0,number(row.available)),staked:Math.max(0,number(row.staked)),rewards:Math.max(0,number(row.confirmedReward)),total:Math.max(0,number(row.available))+Math.max(0,number(row.staked))+Math.max(0,number(row.confirmedReward)),personalApr:Math.max(0,number(row.apr)),updated:Math.max(0,number(row.lastNetworkAt))||Date.now()};}
    localStorage.setItem('inj_monitor_summaries_v1',JSON.stringify(cached));
  }catch(_){}
}
function readWallets(){
  const rows=[],seen=new Set();
  try{const saved=JSON.parse(localStorage.getItem('inj_monitor_wallets_v1')||'[]');for(const item of Array.isArray(saved)?saved:[]){const address=String(item?.address||'').trim().toLowerCase();if(!validAddress(address)||seen.has(address))continue;seen.add(address);rows.push({address,label:String(item?.label||'').trim().slice(0,28)||`Wallet ${rows.length+1}`});}}catch(_){}
  if(!rows.length){try{const address=String(localStorage.getItem('inj_monitor_address')||'').trim().toLowerCase();if(validAddress(address))rows.push({address,label:'Wallet 1'});}catch(_){}}
  const cached=readCachedSummaries();
  state.wallets=rows.slice(0,5).map((wallet,index)=>{const snap=cached[wallet.address]||{},staked=Math.max(0,number(snap.staked)),apr=Math.max(0,number(snap.personalApr));return {...wallet,index,staked,available:Math.max(0,number(snap.available)),confirmedReward:Math.max(0,number(snap.rewards)),apr,aprSource:apr>0?'cache':'none',ratePerMs:staked>0&&apr>0?staked*apr/100/YEAR_MS:0,validatorRows:[],validatorCount:0,online:false,networkFresh:false,lastNetworkAt:number(snap.updated)||0,nextParticleAt:Infinity};});
}

async function loadNetworkApr(){ try{const d=await fetchJson(OFFICIAL_APR_ENDPOINT,6500),n=aprPercent(d?.apr);if(n>0)state.networkApr=n;}catch(_){}return state.networkApr; }
async function validatorCommissionPercent(address){ const c=validatorCommissionCache.get(address),now=Date.now();if(c&&now-c.at<120000)return c.value;const d=await lcd(`/cosmos/staking/v1beta1/validators/${address}`),raw=number(d?.validator?.commission?.commission_rates?.rate);if(raw<0||!Number.isFinite(raw))throw new Error('commission');const value=Math.min(100,raw<=1?raw*100:raw);validatorCommissionCache.set(address,{value,at:now});return value; }
async function effectiveApr(rows){
  if(!rows.length)return{value:0,source:'none'};const networkApr=state.networkApr>0?state.networkApr:await loadNetworkApr();if(!(networkApr>0))return{value:0,source:'none'};
  try{const details=await Promise.all(rows.map(async r=>({...r,commission:await validatorCommissionPercent(r.validator)}))),total=details.reduce((s,r)=>s+r.amount,0);if(!(total>0))return{value:0,source:'none'};return{value:details.reduce((s,r)=>s+r.amount*networkApr*Math.max(0,1-r.commission/100),0)/total,source:'validator'};}catch(_){return{value:networkApr,source:'network'};}
}
function applyBaseSnapshot(row,bank,delegations,rewards){
  const ds=delegationRows(delegations);row.available=Math.max(0,findInj(bank?.balances||[]));row.staked=ds.reduce((s,r)=>s+r.amount,0);row.confirmedReward=Math.max(0,rewardTotal(rewards));row.validatorRows=ds;row.validatorCount=ds.length;row.lastNetworkAt=Date.now();row.online=true;row.networkFresh=true;if(row.apr>0)row.ratePerMs=row.staked*row.apr/100/YEAR_MS;
}
async function fetchBaseSnapshot(row){ const [bank,delegations,rewards]=await Promise.all([lcd(`/cosmos/bank/v1beta1/balances/${row.address}`),lcd(`/cosmos/staking/v1beta1/delegations/${row.address}`),lcd(`/cosmos/distribution/v1beta1/delegators/${row.address}/rewards`)]);applyBaseSnapshot(row,bank,delegations,rewards); }
async function syncAprForRow(row){ const rows=Array.isArray(row.validatorRows)?row.validatorRows:[];if(!rows.length){row.apr=0;row.ratePerMs=0;return;}const info=await effectiveApr(rows);if(info.value>0){row.apr=info.value;row.aprSource=info.source;row.ratePerMs=row.staked>0?row.staked*row.apr/100/YEAR_MS:0;} }
async function syncAprBackground(){ if(state.aprLoading||!state.wallets.length||navigator.onLine===false)return;state.aprLoading=true;try{await loadNetworkApr();await Promise.allSettled(state.wallets.map(syncAprForRow));persistSnapshots();renderAll();}finally{state.aprLoading=false;} }

function totals(){ return state.wallets.reduce((a,r)=>{a.staked+=Math.max(0,number(r.staked));a.available+=Math.max(0,number(r.available));a.reward+=Math.max(0,number(r.confirmedReward));a.daily+=dailyProduction(r);return a;},{staked:0,available:0,reward:0,daily:0}); }

function buildWallets(){
  const host=$('flowWallets'); if(!host)return; host.replaceChildren(); $('flowEmpty').hidden=state.wallets.length>0;
  state.wallets.forEach(row=>{
    const card=document.createElement('button');card.type='button';card.className='flow-wallet-card';card.dataset.address=row.address;
    card.innerHTML=`<div class="flow-wallet-head"><i></i><strong class="flow-wallet-name"></strong><span class="flow-tier">—</span></div><strong class="flow-wallet-staked private">—</strong><div class="flow-wallet-meta"><span><em data-label-reward>REWARD</em><b class="private" data-value-reward>—</b></span><span class="flow-wallet-production"><em data-label-production>PRODUZIONE</em><b class="private" data-value-production>—</b></span></div>`;
    card.querySelector('.flow-wallet-name').textContent=row.label;card.title=row.label;
    card.addEventListener('click',()=>{card.classList.add('selected');setTimeout(()=>card.classList.remove('selected'),550);void syncOneWallet(row.address);});host.appendChild(card);
  });
  renderWallets(); scheduleLayout(40);
}
function renderWallets(){
  state.wallets.forEach(row=>{
    const card=document.querySelector(`.flow-wallet-card[data-address="${row.address}"]`);if(!card)return;const daily=dailyProduction(row),tier=productionTier(daily);applyFlowVisual(card,daily);card.classList.toggle('offline',!row.online);
    const name=card.querySelector('.flow-wallet-name');if(name)name.textContent=row.label;
    const badge=card.querySelector('.flow-tier');if(badge)badge.textContent=tierLabel(tier.key);
    const staked=card.querySelector('.flow-wallet-staked');if(staked)staked.textContent=`${formatInj(row.staked,row.staked>=100?1:2)} INJ`;
    const lr=card.querySelector('[data-label-reward]'),lp=card.querySelector('[data-label-production]');if(lr)lr.textContent=copy('REWARD','REWARD');if(lp)lp.textContent=copy('PRODUZIONE','PRODUCTION');
    const vr=card.querySelector('[data-value-reward]'),vp=card.querySelector('[data-value-production]');if(vr)vr.textContent=`${formatReward(row.confirmedReward,5)} INJ`;if(vp)vp.textContent=daily>0?`${formatProduction(daily)} ${copy('INJ/g','INJ/d')}`:'—';
  });
}
function renderTotals(){
  if(!state.wallets.length)return;
  const t=totals(),tier=productionTier(t.daily),color=productionColor(t.daily),core=$('flowCore'),active=state.wallets.filter(r=>r.online).length;
  applyFlowVisual(core,t.daily);
  $('flowDailyReward').textContent=formatInj(t.staked,2);
  $('flowHourRate').textContent=`${formatProduction(t.daily)} ${copy('INJ / giorno','INJ / day')}`;
  $('flowMinuteRate').textContent=`${formatProduction(t.daily/24)} INJ / ${copy('ora','h')}`;
  $('flowCoreStaked').textContent=`${formatProduction(t.daily)} ${copy('INJ/g','INJ/d')}`;
  $('flowCoreReward').textContent=`${active}/${state.wallets.length}`;
  $('flowCoreTier').textContent=tierLabel(tier.key);
  $('flowNextInj').textContent=t.daily>0?formatDurationFromDays(1/t.daily):'—';
  const out=$('flowRewardOutput'); if(out)applyFlowVisual(out,t.daily);
  const reached=$('flowRewardReached'); if(reached)reached.textContent=formatReward(t.reward,6);
  const prod=$('flowRewardDaily'); if(prod)prod.textContent=`${formatProduction(t.daily)} ${copy('INJ/giorno','INJ/day')}`;
  const next=$('flowRewardNext'); if(next)next.textContent=t.daily>0?formatDurationFromDays(1/t.daily):'—';
  updateRewardFiat();renderRewardStream();
}
function updateRewardFiat(){
  const el=$('flowRewardFiat'); if(!el)return; const t=totals();
  if(!(state.price>0)){el.textContent='—';return;}
  const value=t.reward*state.price*(state.currency==='EUR'?Math.max(0,state.eurRate):1),symbol=state.currency==='EUR'?'€':'$';
  el.textContent=`≈ ${symbol}${value.toLocaleString(locale(),{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
function renderStatus(){
  const fresh=state.wallets.filter(r=>r.networkFresh).length,total=state.wallets.length,live=$('flowLiveBadge'),text=$('flowLiveText');
  const sourceTitle=$('sourcesTitle'); if(sourceTitle) sourceTitle.textContent=`${total} ${lang()==='en'?(total===1?'wallet':'wallets'):'wallet'}`;
  if(text)text.textContent=total&&fresh>=total?'LIVE':`SYNC ${fresh}/${total||5}`;live?.classList.toggle('sync',fresh<total);live?.classList.toggle('error',state.wallets.some(r=>!r.online&&r.networkFresh));
  const u=$('flowUpdated');if(u)u.textContent=fresh<total?`${copy('Sincronizzazione rete','Network sync')} ${fresh}/${total}`:state.lastSync?`${copy('Aggiornato','Updated')} ${new Date(state.lastSync).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:copy('Sincronizzazione…','Syncing…');
}
function renderAll(){ applyLanguageStaticOnly();renderWallets();renderTotals();renderStatus();updateMarketHeader();renderRewardStream();scheduleLayout(20); }
function applyLanguageStaticOnly(){
  document.documentElement.lang=lang();
  const map=[['flowSubtitle','Flusso della produzione INJ','INJ production flow'],['sourcesEyebrow','SORGENTI','SOURCES'],['sourcesTitle','5 wallet','5 wallets'],['outputsEyebrow','DESTINAZIONE','DESTINATION'],['outputsTitle','Reward raggiunto','Rewards reached'],['flowCoreKicker','STAKING TOTALE','TOTAL STAKING'],['flowDailyUnit','INJ IN STAKING','INJ STAKED'],['coreStakedLabel','PRODUZIONE / GIORNO','PRODUCTION / DAY'],['coreRewardLabel','WALLET ATTIVI','ACTIVE WALLETS'],['flowNextInjLabel','1 INJ OGNI','1 INJ EVERY'],['flowLegendLabel','VELOCITÀ DI PRODUZIONE','PRODUCTION SPEED'],['legendLow','BASSA','LOW'],['legendNormal','NORMALE','NORMAL'],['legendHigh','ALTA','HIGH'],['legendVeryHigh','MOLTO ALTA','VERY HIGH'],['legendExtreme','ESTREMA','EXTREME'],['rewardReachedLabel','REWARD RAGGIUNTO','REWARDS REACHED'],['rewardCurrentProductionLabel','PRODUZIONE ATTUALE','CURRENT PRODUCTION'],['rewardNextLabel','PROSSIMO +1 INJ','NEXT +1 INJ'],['rewardFlowLabel','FLUSSO LIVE','LIVE FLOW'],['rewardStreamTitle','REWARD STREAM','REWARD STREAM'],['flowStreamEmpty','In attesa del prossimo reward…','Waiting for the next reward…'],['flowEmptyTitle','Nessun wallet salvato','No saved wallets'],['flowEmptyText','Aggiungi un wallet dalla Home.','Add a wallet from Home.'],['flowDataNote','Saldo, staking e reward sono dati on-chain. Il Reward Stream mostra in chiaro cosa trasporta ogni pallino.','Balance, staking and rewards are on-chain. Reward Stream clearly shows what each particle is carrying.']];map.forEach(([id,it,en])=>setText(id,it,en));
}

function localPoint(el,side){
  const pipe=$('flowPipeline');if(!pipe||!el)return{x:0,y:0};const pr=pipe.getBoundingClientRect(),r=el.getBoundingClientRect(),mobile=window.innerWidth<=820&&window.innerHeight>=window.innerWidth;
  if(mobile){ if(side==='source')return{x:r.left-pr.left+r.width/2,y:r.bottom-pr.top}; if(side==='target')return{x:r.left-pr.left+r.width/2,y:r.top-pr.top}; }
  if(side==='source')return{x:r.right-pr.left,y:r.top-pr.top+r.height/2};
  return{x:r.left-pr.left,y:r.top-pr.top+r.height/2};
}
function corePoint(side){ const el=$('flowCore'),pipe=$('flowPipeline');if(!el||!pipe)return{x:0,y:0};const pr=pipe.getBoundingClientRect(),r=el.getBoundingClientRect(),mobile=window.innerWidth<=820&&window.innerHeight>=window.innerWidth;if(mobile)return side==='in'?{x:r.left-pr.left+r.width/2,y:r.top-pr.top}:{x:r.left-pr.left+r.width/2,y:r.bottom-pr.top};return side==='in'?{x:r.left-pr.left,y:r.top-pr.top+r.height/2}:{x:r.right-pr.left,y:r.top-pr.top+r.height/2}; }
function pathD(a,b,index=0,total=1){ const mobile=window.innerWidth<=820&&window.innerHeight>=window.innerWidth;if(mobile){const dy=(b.y-a.y)*.46;const spread=(index-(total-1)/2)*4;return`M ${a.x} ${a.y} C ${a.x+spread} ${a.y+dy}, ${b.x-spread} ${b.y-dy}, ${b.x} ${b.y}`;}const dx=(b.x-a.x)*.5;const spread=(index-(total-1)/2)*4;return`M ${a.x} ${a.y} C ${a.x+dx} ${a.y+spread}, ${b.x-dx} ${b.y-spread}, ${b.x} ${b.y}`; }
function drawConnections(){
  const svg=$('flowConnections'),pipe=$('flowPipeline');if(!svg||!pipe)return;const r=pipe.getBoundingClientRect();if(r.width<1||r.height<1)return;svg.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);svg.replaceChildren();const ns='http://www.w3.org/2000/svg',coreIn=corePoint('in'),coreOut=corePoint('out');
  state.wallets.forEach((row,i)=>{const card=document.querySelector(`.flow-wallet-card[data-address="${row.address}"]`);if(!card)return;const p=document.createElementNS(ns,'path');p.setAttribute('d',pathD(localPoint(card,'source'),coreIn,i,state.wallets.length));p.setAttribute('stroke',productionColor(dailyProduction(row)));p.dataset.route=`wallet-${i}`;p.dataset.tier=productionTier(dailyProduction(row)).key;svg.appendChild(p);});
  const out=$('flowRewardOutput');if(out){const p=document.createElementNS(ns,'path');p.classList.add('flow-out');p.setAttribute('d',pathD(coreOut,localPoint(out,'target'),0,1));p.setAttribute('stroke',productionColor(totals().daily));p.dataset.route='reward-out';p.dataset.tier=productionTier(totals().daily).key;svg.appendChild(p);}
}
function scheduleLayout(delay=0){ clearTimeout(state.layoutTimer);state.layoutTimer=setTimeout(()=>requestAnimationFrame(drawConnections),delay); }
function routePath(routeId){ return [...document.querySelectorAll('#flowConnections path')].find(p=>p.dataset.route===routeId)||null; }
function animateParticle(routeId,color,duration,payload,tierKey){
  const host=$('flowParticles'),path=routePath(routeId);if(!host||!path||document.hidden)return false;
  let length=0;try{length=path.getTotalLength();}catch(_){return false;}if(!(length>0))return false;
  const tier=FLOW_TIERS.find(t=>t.key===tierKey)||productionTier(0),dot=document.createElement('i');dot.className=`flow-particle tier-${tier.key}`;dot.style.setProperty('--particle-color',color);dot.style.setProperty('--particle-size',`${tier.size}px`);dot.dataset.payload=String(payload);host.appendChild(dot);
  const desktopScale=window.innerWidth>1440?Math.min(1.72,Math.max(1,length/420)):1;
  const travelDuration=Math.round(duration*desktopScale);
  const started=performance.now();let raf=0;
  const tick=(now)=>{const t=Math.min(1,(now-started)/travelDuration),ease=1-Math.pow(1-t,3);let pt;try{pt=path.getPointAtLength(length*ease);}catch(_){dot.remove();return;}const size=tier.size||5;dot.style.transform=`translate3d(${pt.x-size/2}px,${pt.y-size/2}px,0) scale(${t<.08?.78:t>.9?.78:1})`;dot.style.opacity=t<.05?String(t/.05):t>.92?String((1-t)/.08):'1';if(t<1)raf=requestAnimationFrame(tick);else dot.remove();};
  raf=requestAnimationFrame(tick);setTimeout(()=>{if(raf)cancelAnimationFrame(raf);dot.remove();},travelDuration+300);return true;
}
function spawnWalletParticle(row,elapsedMs){ const card=document.querySelector(`.flow-wallet-card[data-address="${row.address}"]`);if(!card||!row.online)return;const i=state.wallets.indexOf(row),daily=dailyProduction(row),tier=productionTier(daily),payload=particlePayloadInj(daily,elapsedMs);if(animateParticle(`wallet-${i}`,tier.color,particleTravelMs(daily),payload,tier.key))pushRewardStream(row,payload,tier); }
function spawnOutputParticle(elapsedMs){ const daily=totals().daily;if(!(daily>0))return;const tier=productionTier(daily);animateParticle('reward-out',tier.color,particleTravelMs(daily)*.9,particlePayloadInj(daily,elapsedMs),tier.key); }
function resetParticleSchedule(){ const now=performance.now();state.wallets.forEach((r,i)=>{const iv=particleIntervalMs(dailyProduction(r));r.particleInterval=iv;r.lastParticleAt=now;r.nextParticleAt=Number.isFinite(iv)?now+Math.min(iv,420+i*95):Infinity;});state.projectionNext.clear();const iv=particleIntervalMs(totals().daily);state.projectionNext.set('reward',Number.isFinite(iv)?now+Math.min(iv,560):Infinity);state.outputLastParticleAt=now; }
function startParticleEngine(){
  clearInterval(state.particleTimer);resetParticleSchedule();state.particleTimer=setInterval(()=>{if(document.hidden)return;const now=performance.now();for(const row of state.wallets){const iv=particleIntervalMs(dailyProduction(row));if(!Number.isFinite(iv)){row.nextParticleAt=Infinity;continue;}if(!Number.isFinite(row.nextParticleAt))row.nextParticleAt=now+iv;if(now>=row.nextParticleAt){const elapsed=Math.max(1,now-(number(row.lastParticleAt)||now-iv));spawnWalletParticle(row,elapsed);row.lastParticleAt=now;row.nextParticleAt=now+iv;}}
    const outIv=particleIntervalMs(totals().daily);let next=state.projectionNext.get('reward');if(Number.isFinite(outIv)){if(!Number.isFinite(next))next=now+outIv;if(now>=next){const elapsed=Math.max(1,now-(number(state.outputLastParticleAt)||now-outIv));spawnOutputParticle(elapsed);state.outputLastParticleAt=now;state.projectionNext.set('reward',now+outIv);}}else state.projectionNext.set('reward',Infinity);
  },PARTICLE_TICK_MS);
}

async function syncAllFast(){ if(state.fastLoading||!state.wallets.length||navigator.onLine===false)return;state.fastLoading=true;renderStatus();await Promise.allSettled(state.wallets.map(async row=>{try{await fetchBaseSnapshot(row);row.online=true;}catch(_){row.online=false;}renderWallets();renderTotals();renderStatus();scheduleLayout(10);}));state.lastSync=Date.now();persistSnapshots();state.fastLoading=false;renderAll();resetParticleSchedule();void syncAprBackground(); }
async function syncOneWallet(address){ const row=state.wallets.find(r=>r.address===address);if(!row||navigator.onLine===false)return;try{await fetchBaseSnapshot(row);if(!state.networkApr)await loadNetworkApr();await syncAprForRow(row);state.lastSync=Date.now();persistSnapshots();renderAll();resetParticleSchedule();}catch(_){row.online=false;renderAll();} }
async function syncRewards(){ if(state.rewardLoading||state.fastLoading||!state.wallets.length||navigator.onLine===false)return;state.rewardLoading=true;try{await Promise.allSettled(state.wallets.map(async row=>{try{const d=await lcd(`/cosmos/distribution/v1beta1/delegators/${row.address}/rewards`);row.confirmedReward=Math.max(0,rewardTotal(d));row.online=true;row.networkFresh=true;row.lastNetworkAt=Date.now();}catch(_){row.online=false;}}));state.lastSync=Date.now();persistSnapshots();}finally{state.rewardLoading=false;renderAll();} }
async function syncStatus(){ if(state.statusLoading||state.fastLoading||!state.wallets.length||navigator.onLine===false)return;state.statusLoading=true;try{await Promise.allSettled(state.wallets.map(async row=>{try{const[bank,delegations]=await Promise.all([lcd(`/cosmos/bank/v1beta1/balances/${row.address}`),lcd(`/cosmos/staking/v1beta1/delegations/${row.address}`)]);const ds=delegationRows(delegations);row.available=Math.max(0,findInj(bank?.balances||[]));row.staked=ds.reduce((s,r)=>s+r.amount,0);row.validatorRows=ds;row.validatorCount=ds.length;row.lastNetworkAt=Date.now();row.online=true;row.networkFresh=true;if(row.apr>0)row.ratePerMs=row.staked*row.apr/100/YEAR_MS;}catch(_){row.online=false;}}));state.lastSync=Date.now();persistSnapshots();}finally{state.statusLoading=false;renderAll();resetParticleSchedule();} }

async function loadMarket24h(){ try{const d=await fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT',5500),p=number(d?.lastPrice),c=number(d?.priceChangePercent);if(p>0)state.price=p;if(Number.isFinite(c))state.change24h=c;updateMarketHeader();}catch(_){} }
async function loadEurRate(){ try{const cached=number(localStorage.getItem('inj_monitor_eur_rate'));if(cached>0)state.eurRate=cached;const d=await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR',6000),n=number(d?.rates?.EUR);if(n>0){state.eurRate=n;localStorage.setItem('inj_monitor_eur_rate',String(n));updateMarketHeader();}}catch(_){} }
function updateMarketHeader(){
  if(state.price>0){const shown=state.currency==='EUR'?state.price*Math.max(0,state.eurRate):state.price,symbol=state.currency==='EUR'?'€':'$';$('flowPrice').textContent=`INJ ${symbol}${shown.toFixed(shown<10?4:3)}`;}
  const tr=$('flowTrend'),c=number(state.change24h),has=Number.isFinite(c)&&state.price>0;tr.textContent=has?`24H ${c>0?'+':''}${c.toFixed(2)}%`:'24H —';tr.classList.toggle('up',has&&c>0);tr.classList.toggle('down',has&&c<0);updateRewardFiat();
}
function schedulePriceReconnect(delay=1200){clearTimeout(state.reconnectTimer);if(navigator.onLine===false)return;state.reconnectTimer=setTimeout(connectPriceSocket,delay);}
function connectPriceSocket(){ if(navigator.onLine===false)return;if(state.socket&&(state.socket.readyState===WebSocket.OPEN||state.socket.readyState===WebSocket.CONNECTING))return;try{const s=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@ticker');state.socket=s;s.addEventListener('message',e=>{try{const t=JSON.parse(e.data),p=number(t?.c),c=number(t?.P);if(p>0)state.price=p;if(Number.isFinite(c))state.change24h=c;updateMarketHeader();}catch(_){}});s.addEventListener('close',()=>{if(state.socket===s)state.socket=null;schedulePriceReconnect();});s.addEventListener('error',()=>{try{s.close();}catch(_){}});}catch(_){schedulePriceReconnect(1600);} }

function requestHomeReturn(){ if(window.parent&&window.parent!==window){try{window.parent.postMessage({type:'inj-flow-close'},location.origin);return true;}catch(_){}}return false; }
function bindHomeReturn(){ $('flowClose')?.addEventListener('click',e=>{e.preventDefault();if(requestHomeReturn())return;try{sessionStorage.setItem('inj_node_return_home','1');}catch(_){}let canBack=false;try{const ref=document.referrer?new URL(document.referrer):null;canBack=Boolean(ref&&ref.origin===location.origin&&history.length>1);}catch(_){}if(canBack)history.back();else location.replace('./index.html');});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&requestHomeReturn())e.preventDefault();}); }
function applyPrivacy(){ let hidden=false;try{hidden=localStorage.getItem('inj_monitor_privacy')==='1';}catch(_){}document.body.classList.toggle('privacy-active',hidden);document.querySelectorAll('.private').forEach(n=>n.classList.toggle('privacy-hidden',hidden)); }
function handleViewportChange(){state.orientationUntil=Date.now()+1000;scheduleLayout(0);scheduleLayout(180);scheduleLayout(480);}
function resume(){if(navigator.onLine===false)return;connectPriceSocket();resetParticleSchedule();if(Date.now()<state.orientationUntil){scheduleLayout(60);return;}void loadMarket24h();if(state.wallets.some(r=>!r.networkFresh))void syncAllFast();else{void syncRewards();void syncStatus();}}

function boot(){
  try{state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD';}catch(_){}
  applyLanguageStaticOnly();readWallets();buildWallets();renderAll();startParticleEngine();bindHomeReturn();applyPrivacy();
  $('flowWallets')?.addEventListener('scroll',()=>scheduleLayout(18),{passive:true});
  void Promise.allSettled([loadEurRate(),loadMarket24h()]);void syncAllFast();connectPriceSocket();
  setInterval(()=>{if(!document.hidden)void syncRewards();},REWARD_REFRESH_MS);setInterval(()=>{if(!document.hidden)void syncStatus();},STATUS_REFRESH_MS);setInterval(()=>{if(!document.hidden)void syncAprBackground();},APR_REFRESH_MS);setInterval(()=>{if(!document.hidden)void loadMarket24h();},MARKET_REFRESH_MS);
  window.addEventListener('resize',handleViewportChange,{passive:true});window.addEventListener('orientationchange',handleViewportChange,{passive:true});window.visualViewport?.addEventListener('resize',handleViewportChange,{passive:true});window.addEventListener('online',resume);window.addEventListener('focus',()=>{if(!document.hidden)resume();},{passive:true});window.addEventListener('pageshow',()=>{if(!document.hidden)resume();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume();});
  window.addEventListener('storage',e=>{if(!['inj_monitor_wallets_v1','inj_monitor_currency','inj_monitor_theme','inj_monitor_privacy','inj_node_language_v1'].includes(e.key))return;if(e.key==='inj_monitor_wallets_v1'){readWallets();buildWallets();renderAll();startParticleEngine();applyPrivacy();resume();}if(e.key==='inj_monitor_currency'){try{state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD';}catch(_){}updateMarketHeader();}if(e.key==='inj_monitor_theme'){try{document.documentElement.dataset.theme=localStorage.getItem('inj_monitor_theme')||'navy';}catch(_){}}if(e.key==='inj_monitor_privacy')applyPrivacy();if(e.key==='inj_node_language_v1')renderAll();});
  window.addEventListener('injnode:languagechange',renderAll);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
