'use strict';

const $ = (id) => document.getElementById(id);
const INJ_DECIMALS = 1e18;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const REWARD_REFRESH_MS = 2600;
const STATUS_REFRESH_MS = 8500;
const APR_REFRESH_MS = 120000;
const MARKET_REFRESH_MS = 60000;
const PARTICLE_QUANTUM_INJ = 0.000005;
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
  projectionNext: new Map()
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
  {key:'low',max:.025,color:'#8ad7ff'},
  {key:'normal',max:.075,color:'#22d3ee'},
  {key:'high',max:.150,color:'#a78bfa'},
  {key:'very-high',max:.300,color:'#ffb347'},
  {key:'extreme',max:Infinity,color:'#ffe8a3'}
];
const FLOW_STOPS = [
  {value:0,color:'#8ad7ff'},{value:.025,color:'#22d3ee'},{value:.075,color:'#7dd3fc'},
  {value:.150,color:'#a78bfa'},{value:.300,color:'#ffb347'},{value:.700,color:'#ffe8a3'},{value:1.5,color:'#fff7d6'}
];

function setText(id,it,en){ const el=$(id); if(el) el.textContent=copy(it,en); }
function tierLabel(key){ return (TIER_COPY[lang()]||TIER_COPY.it)[key]||'—'; }
function applyLanguage(){
  document.documentElement.lang=lang();
  setText('flowSubtitle','Flusso della produzione INJ','INJ production flow');
  setText('sourcesEyebrow','SORGENTI','SOURCES'); setText('sourcesTitle','5 wallet','5 wallets');
  setText('outputsEyebrow','USCITE','OUTPUTS'); setText('outputsTitle','Produzione futura','Future production');
  setText('flowCoreKicker','PRODUZIONE TOTALE','TOTAL PRODUCTION'); setText('flowDailyUnit','INJ / GIORNO','INJ / DAY');
  setText('coreStakedLabel','IN STAKING','STAKED'); setText('coreRewardLabel','REWARD ON-CHAIN','ON-CHAIN REWARDS');
  setText('flowNextInjLabel','1 INJ OGNI','1 INJ EVERY');
  setText('flowLegendLabel','COLORE FLUSSO = VELOCITÀ DI PRODUZIONE','FLOW COLOR = PRODUCTION SPEED');
  setText('legendLow','BASSA','LOW'); setText('legendExtreme','ESTREMA','EXTREME');
  setText('projDayLabel','1 GIORNO','1 DAY'); setText('projWeekLabel','7 GIORNI','7 DAYS');
  setText('projMonthLabel','30 GIORNI','30 DAYS'); setText('projYearLabel','1 ANNO','1 YEAR');
  setText('flowEmptyTitle','Nessun wallet salvato','No saved wallets'); setText('flowEmptyText','Aggiungi un wallet dalla Home.','Add a wallet from Home.');
  setText('flowDataNote','Saldo, staking e reward sono dati on-chain. La produzione è stimata da staking + APR netto.','Balance, staking and rewards are on-chain. Production is estimated from staking + net APR.');
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
function productionColor(daily){
  const d=Math.max(0,number(daily));
  for(let i=1;i<FLOW_STOPS.length;i++){ const a=FLOW_STOPS[i-1],b=FLOW_STOPS[i]; if(d<=b.value){const t=(d-a.value)/Math.max(1e-9,b.value-a.value);return mixColor(a.color,b.color,Math.max(0,Math.min(1,t)));}}
  return FLOW_STOPS[FLOW_STOPS.length-1].color;
}
function particleIntervalMs(daily){ const d=Math.max(0,number(daily)); return d>0?(PARTICLE_QUANTUM_INJ*86400000)/d:Infinity; }
function particleTravelMs(daily){ const d=Math.max(0,number(daily)); return Math.max(650,Math.min(2300,2200-Math.log1p(d*18)*520)); }
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
  if(!state.wallets.length)return;const t=totals(),tier=productionTier(t.daily),color=productionColor(t.daily),core=$('flowCore');applyFlowVisual(core,t.daily);
  $('flowDailyReward').textContent=formatProduction(t.daily);$('flowHourRate').textContent=`${formatProduction(t.daily/24)} INJ / ${copy('ora','h')}`;$('flowMinuteRate').textContent=`${formatProduction(t.daily/1440)} INJ / min`;
  $('flowCoreStaked').textContent=`${formatInj(t.staked,2)} INJ`;$('flowCoreReward').textContent=`${formatReward(t.reward,6)} INJ`;$('flowCoreTier').textContent=tierLabel(tier.key);$('flowNextInj').textContent=t.daily>0?formatDurationFromDays(1/t.daily):'—';
  $('flowProjectionDay').textContent=formatProduction(t.daily);$('flowProjectionWeek').textContent=formatProduction(t.daily*7);$('flowProjectionMonth').textContent=formatProduction(t.daily*30);$('flowProjectionYear').textContent=formatProduction(t.daily*365.25);
  document.querySelectorAll('.flow-projection').forEach(el=>{el.style.setProperty('--flow-color',color);el.dataset.tier=tier.key;});
}
function renderStatus(){
  const fresh=state.wallets.filter(r=>r.networkFresh).length,total=state.wallets.length,live=$('flowLiveBadge'),text=$('flowLiveText');
  const sourceTitle=$('sourcesTitle'); if(sourceTitle) sourceTitle.textContent=`${total} ${lang()==='en'?(total===1?'wallet':'wallets'):'wallet'}`;
  if(text)text.textContent=total&&fresh>=total?'LIVE':`SYNC ${fresh}/${total||5}`;live?.classList.toggle('sync',fresh<total);live?.classList.toggle('error',state.wallets.some(r=>!r.online&&r.networkFresh));
  const u=$('flowUpdated');if(u)u.textContent=fresh<total?`${copy('Sincronizzazione rete','Network sync')} ${fresh}/${total}`:state.lastSync?`${copy('Aggiornato','Updated')} ${new Date(state.lastSync).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:copy('Sincronizzazione…','Syncing…');
}
function renderAll(){ applyLanguageStaticOnly();renderWallets();renderTotals();renderStatus();updateMarketHeader();scheduleLayout(20); }
function applyLanguageStaticOnly(){
  document.documentElement.lang=lang();
  const map=[['flowSubtitle','Flusso della produzione INJ','INJ production flow'],['sourcesEyebrow','SORGENTI','SOURCES'],['sourcesTitle','5 wallet','5 wallets'],['outputsEyebrow','USCITE','OUTPUTS'],['outputsTitle','Produzione futura','Future production'],['flowCoreKicker','PRODUZIONE TOTALE','TOTAL PRODUCTION'],['flowDailyUnit','INJ / GIORNO','INJ / DAY'],['coreStakedLabel','IN STAKING','STAKED'],['coreRewardLabel','REWARD ON-CHAIN','ON-CHAIN REWARDS'],['flowNextInjLabel','1 INJ OGNI','1 INJ EVERY'],['flowLegendLabel','COLORE FLUSSO = VELOCITÀ DI PRODUZIONE','FLOW COLOR = PRODUCTION SPEED'],['legendLow','BASSA','LOW'],['legendExtreme','ESTREMA','EXTREME'],['projDayLabel','1 GIORNO','1 DAY'],['projWeekLabel','7 GIORNI','7 DAYS'],['projMonthLabel','30 GIORNI','30 DAYS'],['projYearLabel','1 ANNO','1 YEAR'],['flowEmptyTitle','Nessun wallet salvato','No saved wallets'],['flowEmptyText','Aggiungi un wallet dalla Home.','Add a wallet from Home.'],['flowDataNote','Saldo, staking e reward sono dati on-chain. La produzione è stimata da staking + APR netto.','Balance, staking and rewards are on-chain. Production is estimated from staking + net APR.']];map.forEach(([id,it,en])=>setText(id,it,en));
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
  state.wallets.forEach((row,i)=>{const card=document.querySelector(`.flow-wallet-card[data-address="${row.address}"]`);if(!card)return;const p=document.createElementNS(ns,'path');p.setAttribute('d',pathD(localPoint(card,'source'),coreIn,i,state.wallets.length));p.setAttribute('stroke',productionColor(dailyProduction(row)));svg.appendChild(p);});
  const outs=[...document.querySelectorAll('.flow-projection')];outs.forEach((el,i)=>{const p=document.createElementNS(ns,'path');p.classList.add('flow-out');p.setAttribute('d',pathD(coreOut,localPoint(el,'target'),i,outs.length));p.setAttribute('stroke',productionColor(totals().daily));svg.appendChild(p);});
}
function scheduleLayout(delay=0){ clearTimeout(state.layoutTimer);state.layoutTimer=setTimeout(()=>requestAnimationFrame(drawConnections),delay); }
function animateParticle(a,b,color,duration,index=0,total=1){
  const host=$('flowParticles');if(!host||document.hidden)return;const dot=document.createElement('i');dot.className='flow-particle';dot.style.setProperty('--particle-color',color);host.appendChild(dot);const mobile=window.innerWidth<=820&&window.innerHeight>=window.innerWidth;let mid;if(mobile){const bend=(index-(total-1)/2)*7;mid={x:(a.x+b.x)/2+bend,y:(a.y+b.y)/2};}else{const bend=(index-(total-1)/2)*7;mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2+bend};}
  const keyframes=[{transform:`translate3d(${a.x}px,${a.y}px,0) scale(.75)`,opacity:0},{offset:.08,transform:`translate3d(${a.x}px,${a.y}px,0) scale(1)`,opacity:1},{offset:.52,transform:`translate3d(${mid.x}px,${mid.y}px,0) scale(1.08)`,opacity:1},{transform:`translate3d(${b.x}px,${b.y}px,0) scale(.7)`,opacity:0}];
  const anim=dot.animate(keyframes,{duration,easing:'cubic-bezier(.24,.64,.28,1)',fill:'forwards'});anim.onfinish=()=>dot.remove();setTimeout(()=>dot.remove(),duration+350);
}
function spawnWalletParticle(row){ const card=document.querySelector(`.flow-wallet-card[data-address="${row.address}"]`);if(!card||!row.online)return;const i=state.wallets.indexOf(row);animateParticle(localPoint(card,'source'),corePoint('in'),productionColor(dailyProduction(row)),particleTravelMs(dailyProduction(row)),i,state.wallets.length); }
function spawnOutputParticle(el,index,total){ const daily=totals().daily;if(!(daily>0))return;animateParticle(corePoint('out'),localPoint(el,'target'),productionColor(daily),particleTravelMs(daily)*.9,index,total); }
function resetParticleSchedule(){ const now=performance.now();state.wallets.forEach((r,i)=>{const iv=particleIntervalMs(dailyProduction(r));r.particleInterval=iv;r.nextParticleAt=Number.isFinite(iv)?now+Math.min(Math.max(iv,180),850+i*110):Infinity;});state.projectionNext.clear();[...document.querySelectorAll('.flow-projection')].forEach((el,i)=>{const iv=particleIntervalMs(totals().daily)*4;state.projectionNext.set(el.dataset.projection,Number.isFinite(iv)?now+Math.min(Math.max(iv,250),1000+i*180):Infinity);}); }
function startParticleEngine(){
  clearInterval(state.particleTimer);resetParticleSchedule();state.particleTimer=setInterval(()=>{if(document.hidden)return;const now=performance.now();for(const row of state.wallets){const raw=particleIntervalMs(dailyProduction(row)),iv=Number.isFinite(raw)?Math.max(160,raw):Infinity;if(!Number.isFinite(iv)){row.nextParticleAt=Infinity;continue;}if(!Number.isFinite(row.nextParticleAt))row.nextParticleAt=now+iv;if(now>=row.nextParticleAt){spawnWalletParticle(row);row.nextParticleAt=now+iv;}}
    const outs=[...document.querySelectorAll('.flow-projection')],rawOut=particleIntervalMs(totals().daily)*Math.max(1,outs.length),outIv=Number.isFinite(rawOut)?Math.max(230,rawOut):Infinity;outs.forEach((el,i)=>{let next=state.projectionNext.get(el.dataset.projection);if(!Number.isFinite(outIv)){state.projectionNext.set(el.dataset.projection,Infinity);return;}if(!Number.isFinite(next))next=now+outIv;if(now>=next){spawnOutputParticle(el,i,outs.length);state.projectionNext.set(el.dataset.projection,now+outIv);}});
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
  const tr=$('flowTrend'),c=number(state.change24h),has=Number.isFinite(c)&&state.price>0;tr.textContent=has?`24H ${c>0?'+':''}${c.toFixed(2)}%`:'24H —';tr.classList.toggle('up',has&&c>0);tr.classList.toggle('down',has&&c<0);
}
function schedulePriceReconnect(delay=1200){clearTimeout(state.reconnectTimer);if(navigator.onLine===false)return;state.reconnectTimer=setTimeout(connectPriceSocket,delay);}
function connectPriceSocket(){ if(navigator.onLine===false)return;if(state.socket&&(state.socket.readyState===WebSocket.OPEN||state.socket.readyState===WebSocket.CONNECTING))return;try{const s=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@ticker');state.socket=s;s.addEventListener('message',e=>{try{const t=JSON.parse(e.data),p=number(t?.c),c=number(t?.P);if(p>0)state.price=p;if(Number.isFinite(c))state.change24h=c;updateMarketHeader();}catch(_){}});s.addEventListener('close',()=>{if(state.socket===s)state.socket=null;schedulePriceReconnect();});s.addEventListener('error',()=>{try{s.close();}catch(_){}});}catch(_){schedulePriceReconnect(1600);} }

function requestHomeReturn(){ if(window.parent&&window.parent!==window){try{window.parent.postMessage({type:'inj-flow-close'},location.origin);return true;}catch(_){}}return false; }
function bindHomeReturn(){ $('flowClose')?.addEventListener('click',e=>{e.preventDefault();if(requestHomeReturn())return;try{sessionStorage.setItem('inj_node_return_home','1');}catch(_){}let canBack=false;try{const ref=document.referrer?new URL(document.referrer):null;canBack=Boolean(ref&&ref.origin===location.origin&&history.length>1);}catch(_){}if(canBack)history.back();else location.replace('./index.html');});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&requestHomeReturn())e.preventDefault();}); }
function applyPrivacy(){ let hidden=false;try{hidden=localStorage.getItem('inj_monitor_privacy')==='1';}catch(_){}document.body.classList.toggle('privacy-active',hidden);document.querySelectorAll('.private').forEach(n=>n.classList.toggle('privacy-hidden',hidden)); }
function handleViewportChange(){state.orientationUntil=Date.now()+1000;scheduleLayout(0);scheduleLayout(180);scheduleLayout(480);}
function resume(){if(navigator.onLine===false)return;connectPriceSocket();if(Date.now()<state.orientationUntil){scheduleLayout(60);return;}void loadMarket24h();if(state.wallets.some(r=>!r.networkFresh))void syncAllFast();else{void syncRewards();void syncStatus();}}

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
