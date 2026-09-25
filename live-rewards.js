'use strict';

const $ = (id) => document.getElementById(id);
const INJ_DECIMALS = 1e18;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const REWARD_REFRESH_MS = 6000;
const STATUS_REFRESH_MS = 60000;
const CLAIM_EPSILON = 1e-10;
const OFFICIAL_APR_ENDPOINT = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
const LCD_ENDPOINTS = [
  'https://sentry.lcd.injective.network:443',
  'https://lcd.injective.network',
  'https://1rpc.io/inj-lcd'
];
const MANAGED_ADDRESSES = Object.freeze([
  'inj1cqvjau8tl4ge874crfaj6gkw55pnn6n2vmwdhv',
  'inj1ewp22h79mx9ln494nnx08laan4u2x7xyf37ceu',
  'inj19ue2rs8a8vr5q7fc7a52ee9kx8axt46wndhzv9',
  'inj1tgy6auqyps9uql9xpmnkwfd7gsf3hrkdx9cv3q',
  'inj1x2pste4f04pltkmaw6wzqflrgpgsu9x6gn3l9m'
]);
const LABELS_KEY = 'inj_node_treasury_wallet_labels_v1';
const SAVED_WALLETS_KEY = 'inj_monitor_wallets_v1';

const state = {
  rows: MANAGED_ADDRESSES.map((address, index) => ({
    address, index, label:`Wallet ${index + 1}`,
    staked:0, baseReward:0, baseAt:0, ratePerMs:0,
    lastNetworkReward:0, lastNetworkAt:0,
    online:false, synced:false
  })),
  apr: 0,
  price: 0,
  eurRate: 0.86,
  currency: 'USD',
  rewardLoading: false,
  statusLoading: false,
  lastSync: 0,
  lastStatusSync: 0,
  socket: null,
  reconnectTimer: 0,
  editorAddress: ''
};

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const fromWei = (value) => number(value) / INJ_DECIMALS;
const shortAddress = (address) => address ? `${address.slice(0,9)}…${address.slice(-7)}` : '—';
const lang = () => { try { return localStorage.getItem('inj_node_language_v1') === 'en' ? 'en' : 'it'; } catch (_) { return 'it'; } };
const copy = (it, en) => lang() === 'en' ? en : it;
const formatInj = (value, digits = 8) => number(value).toLocaleString(lang()==='en'?'en-US':'it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true});
const formatRate = (value, digits = 6) => number(value).toLocaleString(lang()==='en'?'en-US':'it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true});

function money(value) {
  const valid = number(value);
  if (state.currency === 'EUR') return valid.toLocaleString(lang()==='en'?'en-US':'it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2});
  return valid.toLocaleString(lang()==='en'?'en-US':'it-IT',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
}
function currentReward(row, now = performance.timeOrigin + performance.now()) {
  if (!row.baseAt) return row.baseReward;
  return Math.max(0, row.baseReward + Math.max(0, now - row.baseAt) * Math.max(0, row.ratePerMs));
}
function currentTotal(now = performance.timeOrigin + performance.now()) {
  return state.rows.reduce((sum,row)=>sum + currentReward(row,now),0);
}
function totalDailyRate() { return state.rows.reduce((sum,row)=>sum + Math.max(0,row.ratePerMs) * 86400000,0); }

function readLabels() {
  const matched = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_WALLETS_KEY) || '[]');
    for (const item of Array.isArray(saved)?saved:[]) {
      const address=String(item?.address||'').toLowerCase();
      const label=String(item?.label||'').trim();
      if(address&&label) matched.set(address,label.slice(0,28));
    }
  } catch (_) {}
  try {
    const custom = JSON.parse(localStorage.getItem(LABELS_KEY) || '{}');
    if(custom&&typeof custom==='object') for(const [address,label] of Object.entries(custom)) if(String(label||'').trim()) matched.set(address.toLowerCase(),String(label).trim().slice(0,28));
  } catch (_) {}
  state.rows.forEach((row,index)=>{row.label=matched.get(row.address) || `Wallet ${index+1}`;});
}
function saveLabel(address,label) {
  const clean=String(label||'').trim().slice(0,28);
  if(!clean)return;
  try {
    const map=JSON.parse(localStorage.getItem(LABELS_KEY)||'{}');
    map[address]=clean;
    localStorage.setItem(LABELS_KEY,JSON.stringify(map));
  } catch (_) {}
  try {
    const saved=JSON.parse(localStorage.getItem(SAVED_WALLETS_KEY)||'[]');
    if(Array.isArray(saved)){
      const wallet=saved.find((item)=>String(item?.address||'').toLowerCase()===address);
      if(wallet){wallet.label=clean;localStorage.setItem(SAVED_WALLETS_KEY,JSON.stringify(saved));}
    }
  } catch (_) {}
  const row=state.rows.find((item)=>item.address===address);if(row)row.label=clean;
  renderRows();
}

function renderRows() {
  const host=$('rewardsList');if(!host)return;
  const existing=new Map(Array.from(host.children).map((node)=>[node.dataset.address,node]));
  state.rows.forEach((row,index)=>{
    let node=existing.get(row.address);
    if(!node){
      node=document.createElement('article');node.className='reward-row';node.dataset.address=row.address;
      node.innerHTML=`
        <div class="reward-wallet">
          <div class="reward-wallet-index">${String(index+1).padStart(2,'0')}</div>
          <div class="reward-wallet-copy"><strong data-wallet-name></strong><small>${shortAddress(row.address)}</small></div>
          <button class="reward-edit" type="button" aria-label="Rinomina wallet" title="Rinomina wallet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg></button>
        </div>
        <div class="reward-live-number"><strong data-reward>0,00000000 INJ</strong><small data-rate>— INJ / giorno</small><span class="row-live"><i></i><b>LIVE</b></span></div>`;
      node.querySelector('.reward-edit')?.addEventListener('click',()=>openEditor(row.address));
      host.appendChild(node);
    }
    existing.delete(row.address);
    node.classList.toggle('offline',!row.online);
    const name=node.querySelector('[data-wallet-name]');if(name)name.textContent=row.label;
    const rate=node.querySelector('[data-rate]');if(rate)rate.textContent=`${formatRate(row.ratePerMs*86400000,6)} INJ / ${copy('giorno','day')}`;
    const live=node.querySelector('.row-live b');if(live)live.textContent=row.online?'LIVE':copy('SYNC','SYNC');
  });
  existing.forEach((node)=>node.remove());
}

let lastFramePaint = 0;
function renderFrame(frameNow = 0) {
  requestAnimationFrame(renderFrame);
  if (frameNow - lastFramePaint < 80) return;
  lastFramePaint = frameNow;
  const now=performance.timeOrigin + performance.now();
  let total=0;
  state.rows.forEach((row)=>{
    const value=currentReward(row,now);total+=value;
    const node=document.querySelector(`.reward-row[data-address="${row.address}"]`);
    const target=node?.querySelector('[data-reward]');
    if(target) target.textContent=`${formatInj(value,8)} INJ`;
  });
  if($('rewardsTotal'))$('rewardsTotal').textContent=formatInj(total,8);
  const fiatBase=state.price>0?total*state.price:0;
  if($('rewardsTotalFiat'))$('rewardsTotalFiat').textContent=state.price>0?money(state.currency==='EUR'?fiatBase*state.eurRate:fiatBase):'—';
  if($('rewardsTotalDay'))$('rewardsTotalDay').textContent=`${formatRate(totalDailyRate(),6)} INJ / ${copy('giorno','day')}`;
}

async function fetchJson(url,timeout=7000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json();}finally{clearTimeout(timer)}}
async function lcd(path){let lastError;for(const base of LCD_ENDPOINTS){try{return await fetchJson(base+path)}catch(error){lastError=error}}throw lastError||new Error('Injective unavailable')}
function delegationTotal(data){return (data?.delegation_responses||[]).reduce((sum,row)=>sum+fromWei(row?.balance?.amount),0)}
function rewardTotal(data){return (data?.total||[]).filter((coin)=>coin?.denom==='inj').reduce((sum,coin)=>sum+fromWei(coin.amount),0)}
function aprPercent(value){const n=number(value);if(n<=0)return 0;return n<=1?n*100:n}
async function loadApr(){try{const data=await fetchJson(OFFICIAL_APR_ENDPOINT,7000);return aprPercent(data?.apr)}catch(_){return state.apr}}
async function loadPendingReward(address){
  const rewards=await lcd(`/cosmos/distribution/v1beta1/delegators/${address}/rewards`);
  return {address,rewards:rewardTotal(rewards)};
}
async function loadDelegation(address){
  const delegations=await lcd(`/cosmos/staking/v1beta1/delegations/${address}`);
  return {address,staked:delegationTotal(delegations)};
}

// Live Rewards reads ONLY staking/distribution rewards.
// Spendable/bank balance is deliberately excluded.
async function syncRewardFlow(force=false){
  if(state.rewardLoading)return;
  if(!force&&state.lastSync&&Date.now()-state.lastSync<REWARD_REFRESH_MS-800)return;
  state.rewardLoading=true;
  $('rewardsLiveBadge')?.classList.add('sync');
  $('rewardsLiveBadge')?.classList.remove('error');
  try{
    const settled=await Promise.all(MANAGED_ADDRESSES.map((address)=>
      loadPendingReward(address).then((value)=>({ok:true,value})).catch(()=>({ok:false,address}))
    ));
    const now=Date.now();let liveCount=0;
    settled.forEach((entry)=>{
      const address=entry.ok?entry.value.address:entry.address;
      const row=state.rows.find((item)=>item.address===address);if(!row)return;
      if(!entry.ok){row.online=false;return;}
      const networkReward=Math.max(0,number(entry.value.rewards));
      const previousNetwork=row.lastNetworkReward;
      const previousAt=row.lastNetworkAt;
      const claimDetected=row.synced&&(networkReward+CLAIM_EPSILON<previousNetwork);

      if(!claimDetected&&previousAt&&networkReward>=previousNetwork){
        const elapsed=now-previousAt;
        const observed=elapsed>2500?(networkReward-previousNetwork)/elapsed:0;
        const modelRate=Math.max(0,row.ratePerMs);
        if(observed>0){
          row.ratePerMs=modelRate>0&&observed<modelRate*10
            ?(modelRate*.35)+(observed*.65)
            :observed;
        }
      }

      // A claim/withdrawal simply becomes the new on-chain anchor.
      // The wallet's spendable balance is never added or subtracted here.
      row.baseReward=networkReward;
      row.baseAt=now;
      row.lastNetworkReward=networkReward;
      row.lastNetworkAt=now;
      row.online=true;
      row.synced=true;
      liveCount++;
    });
    if(!liveCount)throw new Error('No wallets live');
    state.lastSync=now;
    if($('rewardsUpdated'))$('rewardsUpdated').textContent=`${copy('Aggiornato','Updated')} ${new Date(now).toLocaleTimeString(lang()==='en'?'en-US':'it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    if($('rewardsWalletStatus'))$('rewardsWalletStatus').textContent=`${liveCount}/5 ${copy('wallet live','wallets live')}`;
    $('rewardsLiveBadge')?.classList.remove('sync','error');
    renderRows();
  }catch(_){
    $('rewardsLiveBadge')?.classList.remove('sync');
    $('rewardsLiveBadge')?.classList.add('error');
    if($('rewardsUpdated'))$('rewardsUpdated').textContent=copy('Rete Injective temporaneamente non disponibile','Injective network temporarily unavailable');
    renderRows();
  }finally{state.rewardLoading=false;}
}

async function syncStatus(force=false){
  if(state.statusLoading)return;
  if(!force&&state.lastStatusSync&&Date.now()-state.lastStatusSync<STATUS_REFRESH_MS-2000)return;
  state.statusLoading=true;
  try{
    const [apr,...settled]=await Promise.all([
      loadApr(),
      ...MANAGED_ADDRESSES.map((address)=>loadDelegation(address).then((value)=>({ok:true,value})).catch(()=>({ok:false,address})))
    ]);
    if(apr>0)state.apr=apr;
    settled.forEach((entry)=>{
      if(!entry.ok)return;
      const row=state.rows.find((item)=>item.address===entry.value.address);if(!row)return;
      row.staked=Math.max(0,number(entry.value.staked));
      const modelRate=row.staked*Math.max(0,state.apr)/100/YEAR_MS;
      if(modelRate>0&&row.ratePerMs<=0)row.ratePerMs=modelRate;
      else if(modelRate>0)row.ratePerMs=(row.ratePerMs*.7)+(modelRate*.3);
    });
    state.lastStatusSync=Date.now();
    if($('rewardsApr'))$('rewardsApr').textContent=state.apr>0?`${state.apr.toFixed(3)}%`:'—';
    renderRows();
  }finally{state.statusLoading=false;}
}

async function loadPrice(){try{const ticker=await fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=INJUSDT',6000);const price=number(ticker?.price);if(price>0){state.price=price;if($('rewardsHeaderPrice'))$('rewardsHeaderPrice').textContent=`INJ $${price.toFixed(price<10?4:3)}`;}}catch(_){}}
async function loadEurRate(){try{const cached=number(localStorage.getItem('inj_monitor_eur_rate'));if(cached>0)state.eurRate=cached;const data=await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR',6000);const next=number(data?.rates?.EUR);if(next>0){state.eurRate=next;localStorage.setItem('inj_monitor_eur_rate',String(next));}}catch(_){}}
function connectPriceSocket(){clearTimeout(state.reconnectTimer);try{state.socket?.close()}catch(_){};try{const socket=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@trade');state.socket=socket;socket.addEventListener('message',(event)=>{try{const tick=JSON.parse(event.data);const price=number(tick?.p);if(price>0){state.price=price;if($('rewardsHeaderPrice'))$('rewardsHeaderPrice').textContent=`INJ $${price.toFixed(price<10?4:3)}`;}}catch(_){}});socket.addEventListener('close',()=>{if(!document.hidden)state.reconnectTimer=setTimeout(connectPriceSocket,4500)});socket.addEventListener('error',()=>{try{socket.close()}catch(_){}})}catch(_){state.reconnectTimer=setTimeout(connectPriceSocket,5000)}}

function openEditor(address){const row=state.rows.find((item)=>item.address===address);if(!row)return;state.editorAddress=address;$('rewardEditorAddress').textContent=shortAddress(address);$('rewardEditorInput').value=row.label.startsWith('Wallet ')?'':row.label;$('rewardEditor').hidden=false;$('rewardEditor').setAttribute('aria-hidden','false');document.documentElement.style.overflow='hidden';setTimeout(()=>{$('rewardEditorInput')?.focus();$('rewardEditorInput')?.select()},40)}
function closeEditor(){state.editorAddress='';$('rewardEditor').hidden=true;$('rewardEditor').setAttribute('aria-hidden','true');document.documentElement.style.overflow=''}
function bindEditor(){$('rewardEditorForm')?.addEventListener('submit',(event)=>{event.preventDefault();const value=$('rewardEditorInput')?.value.trim();if(value&&state.editorAddress)saveLabel(state.editorAddress,value);closeEditor()});document.querySelectorAll('[data-editor-close]').forEach((node)=>node.addEventListener('click',closeEditor));document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!$('rewardEditor')?.hidden)closeEditor()})}
function bindHomeReturn(){const close=$('rewardsClose');if(!close)return;close.addEventListener('click',(event)=>{event.preventDefault();try{sessionStorage.setItem('inj_node_return_home','1')}catch(_){}let canBack=false;try{const ref=document.referrer?new URL(document.referrer):null;canBack=Boolean(ref&&ref.origin===location.origin&&(ref.pathname.endsWith('/index.html')||ref.pathname.endsWith('/'))&&history.length>1)}catch(_){}if(canBack)history.back();else location.replace('./index.html')})}

function boot(){
  try{state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD'}catch(_){}
  readLabels();renderRows();bindEditor();bindHomeReturn();requestAnimationFrame(renderFrame);
  Promise.allSettled([loadPrice(),loadEurRate(),syncStatus(true),syncRewardFlow(true)]);connectPriceSocket();
  setInterval(()=>{if(!document.hidden)void syncRewardFlow(false)},REWARD_REFRESH_MS);
  setInterval(()=>{if(!document.hidden)void syncStatus(false)},STATUS_REFRESH_MS);
  setInterval(()=>{if(!document.hidden&&(!state.socket||state.socket.readyState!==WebSocket.OPEN))void loadPrice()},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){readLabels();renderRows();void syncStatus(true);void syncRewardFlow(true);connectPriceSocket()}});
  window.addEventListener('storage',(event)=>{if([LABELS_KEY,SAVED_WALLETS_KEY,'inj_monitor_currency','inj_node_language_v1'].includes(event.key)){if(event.key==='inj_monitor_currency')state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD';readLabels();renderRows();}});
  window.addEventListener('injnode:languagechange',()=>{renderRows();if(state.lastSync&&$('rewardsUpdated'))$('rewardsUpdated').textContent=`${copy('Aggiornato','Updated')} ${new Date(state.lastSync).toLocaleTimeString(lang()==='en'?'en-US':'it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
