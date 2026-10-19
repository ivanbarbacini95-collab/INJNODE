/* INJ Node · INJ Atlas v16.00.78
   Five real Injective wallets; never generate or simulate balance values.
   Cache is explicitly distinguished from on-chain data.
*/
(() => {
  'use strict';
  const ADDRESSES=Object.freeze([
    'inj1cqvjau8tl4ge874crfaj6gkw55pnn6n2vmwdhv',
    'inj1ewp22h79mx9ln494nnx08laan4u2x7xyf37ceu',
    'inj19ue2rs8a8vr5q7fc7a52ee9kx8axt46wndhzv9',
    'inj1tgy6auqyps9uql9xpmnkwfd7gsf3hrkdx9cv3q',
    'inj1x2pste4f04pltkmaw6wzqflrgpgsu9x6gn3l9m'
  ]);
  const LCDS=[
    'https://sentry.lcd.injective.network:443',
    'https://lcd.injective.network',
    'https://1rpc.io/inj-lcd'
  ];
  const CACHE_KEY='inj_node_atlas_wallets_v1';
  const SAVED_WALLETS_KEY='inj_monitor_wallets_v1';
  const LABELS_KEY='inj_node_treasury_wallet_labels_v1';
  const DASHBOARD_SUMMARIES_KEY='inj_monitor_summaries_v1';
  const REFRESH_MS=18000;
  const FRESH_MS=90000;
  const WEI=1e18;
  const $=id=>document.getElementById(id);
  const safeNumber=value=>{
    if(value===null||value===undefined||value==='')return NaN;
    const parsed=Number(value);
    return Number.isFinite(parsed)&&parsed>=0?parsed:NaN;
  };
  const dictionary={
    it:{
      subtitle:'Architettura del capitale · 5 wallet',totalManaged:'TOTALE GESTITO',
      totalCopy:'Disponibile + staking + reward',staked:'IN STAKING',
      stakedCopy:'Capitale delegato',rewards:'REWARD DISPONIBILI',rewardsCopy:'Reward verificati on-chain',
      mapOverline:'ASSET MAP · INJECTIVE',mapTitle:'Le tue cinque torri',
      mapDescription:'Altezza proporzionale ai dati del wallet. Tocca una torre per esplorarla.',
      modeTotal:'Totale',modeStaked:'Staking',modeRewards:'Reward',legendStaked:'Staking',
      legendAvailable:'Disponibile',legendRewards:'Reward',walletDetail:'DETTAGLIO WALLET',
      detailTotal:'TOTALE',detailStaking:'STAKING',detailAvailable:'DISPONIBILE',detailReward:'REWARD',
      portfolioShare:'Quota sul totale',milestone:'Prossimo traguardo',
      milestoneNote:'Traguardi calcolati sul totale reale dei cinque wallet.',
      sourceNote:'Dati pubblici on-chain. Nessun indirizzo mostrato.',
      missing:'mancanti',updated:'Aggiornato',cached:'DATI SALVATI',sync:'SINCRONIZZAZIONE',
      live:'LIVE',waiting:'IN ATTESA',notAvailable:'Dati non disponibili',
      openHome:'Torna alla Home',chooseMetric:'Seleziona la metrica',
      atlasTowers:'Confronto fra i cinque wallet',
      unverified:'Ultima lettura salvata'
    },
    en:{
      subtitle:'Capital architecture · 5 wallets',totalManaged:'TOTAL MANAGED',
      totalCopy:'Available + staking + rewards',staked:'STAKED',
      stakedCopy:'Delegated capital',rewards:'AVAILABLE REWARDS',rewardsCopy:'On-chain verified rewards',
      mapOverline:'ASSET MAP · INJECTIVE',mapTitle:'Your five towers',
      mapDescription:'Height is proportional to wallet holdings. Tap a tower to explore.',
      modeTotal:'Total',modeStaked:'Staking',modeRewards:'Rewards',legendStaked:'Staking',
      legendAvailable:'Available',legendRewards:'Rewards',walletDetail:'WALLET DETAILS',
      detailTotal:'TOTAL',detailStaking:'STAKING',detailAvailable:'AVAILABLE',detailReward:'REWARDS',
      portfolioShare:'Share of total',milestone:'Next milestone',
      milestoneNote:'Milestones are calculated from the real total of all five wallets.',
      sourceNote:'Public on-chain data. Wallet addresses are not displayed.',
      missing:'remaining',updated:'Updated',cached:'CACHED DATA',sync:'SYNCING',
      live:'LIVE',waiting:'WAITING',notAvailable:'Data unavailable',
      openHome:'Back to Home',chooseMetric:'Select metric',
      atlasTowers:'Comparison of five wallets',
      unverified:'Last saved reading'
    }
  };
  const rows=ADDRESSES.map((address,index)=>({
    address,index,label:'Wallet '+(index+1),
    available:NaN,staked:NaN,rewards:NaN,total:NaN,updatedAt:0,syncedAt:0
  }));
  let mode='total';
  let selected=0;
  let currentLanguage='it';
  let refreshing=false;
  let previousAggregate=NaN;
  const modeKeys=['total','staked','rewards'];
  const currentLang=()=>{try{return localStorage.getItem('inj_node_language_v1')==='en'?'en':'it';}catch(_){return 'it';}};
  const t=key=>dictionary[currentLanguage][key]||key;
  const locale=()=>currentLanguage==='en'?'en-US':'it-IT';
  const format=(n,digits=2)=>{
    if(!Number.isFinite(n))return '—';
    return n.toLocaleString(locale(),{minimumFractionDigits:digits,maximumFractionDigits:digits});
  };
  const fmtInj=(n,digits=2)=>Number.isFinite(n)?format(n,digits)+' INJ':'—';
  const fmtTower=(n)=>{
    if(!Number.isFinite(n))return '—';
    if(n>=1e6)return format(n/1e6,2)+'M';
    if(n>=1e4)return format(n/1e3,2)+'K';
    if(n>=100)return format(n,0);
    return format(n,n<1?4:2);
  };
  const readJson=(key,fallback)=>{
    try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback;}
    catch(_){return fallback;}
  };
  const hasData=row=>Number.isFinite(row.available)&&Number.isFinite(row.staked)&&Number.isFinite(row.rewards)&&Number.isFinite(row.total);
  const isFresh=row=>row.syncedAt>0&&Date.now()-row.syncedAt<FRESH_MS;
  function readNames() {
    const saved=readJson(SAVED_WALLETS_KEY,[]);
    const labels=readJson(LABELS_KEY,{});
    const names=new Map();
    if(Array.isArray(saved))for(const wallet of saved) {
      const address=String(wallet?.address||'').toLowerCase();
      const label=String(wallet?.label||'').trim().slice(0,28);
      if(address&&label)names.set(address,label);
    }
    if(labels&&typeof labels==='object'&&!Array.isArray(labels)){
      for(const [address,label] of Object.entries(labels)){
        const clean=String(label||'').trim().slice(0,28);
        if(clean)names.set(address.toLowerCase(),clean);
      }
    }
    rows.forEach((row,index)=>{row.label=names.get(row.address)||'Wallet '+(index+1);});
  }
  function maybeApplyCache(row,candidate,time) {
    if(!candidate||typeof candidate!=='object')return;
    const available=safeNumber(candidate.available);
    const staked=safeNumber(candidate.staked);
    const rewards=safeNumber(candidate.rewards);
    if(!Number.isFinite(available)||!Number.isFinite(staked)||!Number.isFinite(rewards))return;
    const updatedAt=Number(time)||0;
    if(updatedAt<=0||updatedAt<row.updatedAt)return;
    // A wildly old snapshot is not useful as a portfolio representation.
    if(Date.now()-updatedAt>7*86400000||updatedAt>Date.now()+3600000)return;
    Object.assign(row,{available,staked,rewards,total:available+staked+rewards,updatedAt,syncedAt:0});
  }
  function hydrate(){
    const own=readJson(CACHE_KEY,{});
    const dashboard=readJson(DASHBOARD_SUMMARIES_KEY,{});
    rows.forEach(row=>{
      const cached=own?.[row.address];
      maybeApplyCache(row,cached,cached?.updatedAt);
      const other=dashboard?.[row.address];
      maybeApplyCache(row,other,other?.updatedAt||other?.updated);
    });
  }
  function store(){
    const snapshot={};
    rows.forEach(row=>{
      if(hasData(row))snapshot[row.address]={
        available:row.available,staked:row.staked,rewards:row.rewards,
        updatedAt:row.updatedAt
      };
    });
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(snapshot));}catch(_){}
  }
  function createTowers(){
    const container=$('atlasTowers');
    if(!container||container.children.length===5)return;
    container.replaceChildren();
    for(let index=0;index<5;index++){
      const btn=document.createElement('button');
      btn.className='atlas-tower';
      btn.type='button';
      btn.dataset.index=String(index);
      btn.innerHTML='<span class="atlas-tower-amount" data-amount>—</span>'+
        '<span class="atlas-tower-track"><span class="atlas-tower-fill">'+
          '<span class="atlas-tower-segment staked" data-part="staked"></span>'+
          '<span class="atlas-tower-segment available" data-part="available"></span>'+
          '<span class="atlas-tower-segment rewards" data-part="rewards"></span>'+
        '</span></span>'+
        '<span class="atlas-tower-index">'+String(index+1).padStart(2,'0')+'</span>'+
        '<span class="atlas-tower-label" data-name></span>';
      btn.addEventListener('click',()=>{
        selected=index;
        render();
      });
      container.append(btn);
    }
  }
  function renderTowers(){
    const valid=rows.filter(hasData);
    const max=Math.max(0,...valid.map(row=>row[mode]));
    const barMax=max>0?max:1;
    $('atlasTowers')?.querySelectorAll('.atlas-tower').forEach((btn,index)=>{
      const row=rows[index];
      const known=hasData(row);
      const metric=known?row[mode]:NaN;
      let percent=known?Math.max(0,metric)/barMax*100:0;
      // Do not invent a visual bar for a zero or unknown value.
      percent=Math.min(100,percent);
      const fill=btn.querySelector('.atlas-tower-fill');
      fill.style.setProperty('--atlas-bar-height',percent+'%');
      const proportions=mode==='total'
        ? {staked:row.total>0?row.staked/row.total:0,available:row.total>0?row.available/row.total:0,rewards:row.total>0?row.rewards/row.total:0}
        : {staked:mode==='staked'?1:0,available:0,rewards:mode==='rewards'?1:0};
      for(const key of ['staked','available','rewards']){
        const part=btn.querySelector('[data-part="'+key+'"]');
        part.style.height=(known?Math.max(0,proportions[key])*100:0)+'%';
      }
      btn.querySelector('[data-amount]').textContent=fmtTower(metric);
      btn.querySelector('[data-name]').textContent=row.label;
      btn.classList.toggle('is-selected',index===selected);
      btn.classList.toggle('is-cached',known&&!isFresh(row));
      btn.setAttribute('aria-pressed',index===selected?'true':'false');
      btn.setAttribute('aria-label',row.label+' · '+t(mode==='total'?'modeTotal':mode==='staked'?'modeStaked':'modeRewards')+': '+fmtInj(metric,mode==='rewards'?4:2));
      btn.title=row.label+' · '+fmtInj(metric,mode==='rewards'?4:2);
    });
  }
  function milestoneFor(total){
    const targets=[500,1000,1500,2000,2500,3000,4000,5000,7500,10000,15000,25000,50000,100000,250000,500000,1000000];
    const next=targets.find(target=>target>total)||Math.ceil(total/1000000+1)*1000000;
    const previous=[...targets].reverse().find(target=>target<=total)||0;
    const progress=Math.max(0,Math.min(100,100*(total-previous)/(next-previous)));
    return {next,progress,remaining:Math.max(0,next-total)};
  }
  function renderMilestone(total,complete){
    const panel=$('atlasMilestonePanel');
    if(!complete){
      $('atlasTarget').textContent='—';
      $('atlasProgress').style.width='0%';
      $('atlasProgressPercent').textContent='—';
      $('atlasMissing').textContent='—';
      return;
    }
    const m=milestoneFor(total);
    $('atlasTarget').textContent=format(m.next,0)+' INJ';
    $('atlasProgress').style.width=m.progress.toFixed(2)+'%';
    $('atlasProgressPercent').textContent=format(m.progress,1)+'%';
    $('atlasMissing').textContent=fmtInj(m.remaining,2)+' '+t('missing');
    if(Number.isFinite(previousAggregate)&&total>previousAggregate&&milestoneFor(previousAggregate).next<=total){
      panel.classList.remove('reached');
      void panel.offsetWidth;
      panel.classList.add('reached');
    }
    previousAggregate=total;
  }
  function applyLanguage(){
    currentLanguage=currentLang();
    document.documentElement.lang=currentLanguage;
    document.querySelectorAll('[data-t]').forEach(node=>{
      const copy=dictionary[currentLanguage][node.dataset.t];
      if(copy)node.textContent=copy;
    });
    $('atlasBack').setAttribute('aria-label',t('openHome'));
    $('atlasBack').title=t('openHome');
    document.querySelector('.atlas-filters')?.setAttribute('aria-label',t('chooseMetric'));
    $('atlasTowers')?.setAttribute('aria-label',t('atlasTowers'));
    render();
  }
  function render(){
    const known=rows.filter(hasData);
    const complete=known.length===5;
    const fresh=rows.filter(isFresh).length;
    const total=complete?rows.reduce((sum,row)=>sum+row.total,0):NaN;
    const staked=complete?rows.reduce((sum,row)=>sum+row.staked,0):NaN;
    const rewards=complete?rows.reduce((sum,row)=>sum+row.rewards,0):NaN;
    $('atlasTotal').textContent=fmtInj(total,2);
    $('atlasStaked').textContent=fmtInj(staked,2);
    $('atlasRewards').textContent=fmtInj(rewards,4);
    const status=$('atlasConnection');
    status.classList.toggle('live',fresh===5);
    status.classList.toggle('cache',fresh!==5&&known.length>0);
    $('atlasConnectionText').textContent=fresh===5?t('live')+' 5/5'
      :fresh>0?fresh+'/5 '+t('live')
      :known.length?t('cached')+' '+known.length+'/5'
      :t('sync');
    const last=Math.max(0,...known.map(row=>row.updatedAt));
    $('atlasLastUpdate').textContent=last>0?t('updated')+' '+new Date(last).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'}):t('waiting');
    document.querySelectorAll('[data-atlas-mode]').forEach(btn=>{
      const active=btn.dataset.atlasMode===mode;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',active?'true':'false');
    });
    renderTowers();
    const row=rows[selected];
    $('atlasSelectedName').textContent=row.label;
    $('atlasSelectedState').textContent=isFresh(row)?t('live'):hasData(row)?t('cached'):t('sync');
    $('atlasSelectedState').classList.toggle('live',isFresh(row));
    $('atlasDetailTotal').textContent=fmtInj(hasData(row)?row.total:NaN,2);
    $('atlasDetailStaked').textContent=fmtInj(hasData(row)?row.staked:NaN,2);
    $('atlasDetailAvailable').textContent=fmtInj(hasData(row)?row.available:NaN,4);
    $('atlasDetailRewards').textContent=fmtInj(hasData(row)?row.rewards:NaN,4);
    $('atlasWalletShare').textContent=complete&&total>0?format(row.total/total*100,2)+'%':'—';
    renderMilestone(total,complete);
  }
  async function readJsonUrl(url,timeout=6500){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{accept:'application/json'}});
      if(!response.ok)throw new Error('HTTP '+response.status);
      return await response.json();
    }finally{clearTimeout(timer);}
  }
  async function lcd(path){
    let lastError;
    for(const base of LCDS){
      try{return await readJsonUrl(base+path);}
      catch(error){lastError=error;}
    }
    throw lastError||new Error(t('notAvailable'));
  }
  const coinInj=coins=>(Array.isArray(coins)?coins:[])
    .filter(coin=>coin?.denom==='inj')
    .reduce((sum,coin)=>sum+Math.max(0,Number(coin.amount)||0)/WEI,0);
  const stakedInj=data=>(Array.isArray(data?.delegation_responses)?data.delegation_responses:[])
    .reduce((sum,item)=>sum+Math.max(0,Number(item?.balance?.amount)||0)/WEI,0);
  async function readWallet(row){
    const address=row.address;
    const paths=[
      '/cosmos/bank/v1beta1/balances/'+address,
      '/cosmos/staking/v1beta1/delegations/'+address,
      '/cosmos/distribution/v1beta1/delegators/'+address+'/rewards'
    ];
    const [bank,delegations,reward]=await Promise.all(paths.map(path=>lcd(path)));
    if(!Array.isArray(bank?.balances)||!Array.isArray(delegations?.delegation_responses)||!Array.isArray(reward?.total)){
      throw new Error('Invalid LCD data');
    }
    const available=coinInj(bank.balances);
    const staked=stakedInj(delegations);
    const rewards=coinInj(reward.total);
    if(![available,staked,rewards].every(Number.isFinite))throw new Error('Invalid wallet values');
    const now=Date.now();
    return {available,staked,rewards,total:available+staked+rewards,updatedAt:now,syncedAt:now};
  }
  async function refresh(){
    if(refreshing||document.hidden||navigator.onLine===false)return;
    refreshing=true;
    let position=0;
    const worker=async()=>{
      while(position<rows.length){
        const index=position++;
        const previous=rows[index];
        try{
          const fresh=await readWallet(previous);
          Object.assign(previous,fresh);
          render();
        }catch(_){
          // Keep the previously verified reading, but never mark it LIVE.
          // The background refresh retries independently on its next cycle.
        }
      }
    };
    try{await Promise.all([worker(),worker()]);store();}
    finally{refreshing=false;render();}
  }
  function bind(){
    $('atlasBack')?.addEventListener('click',()=>{
      if(window.parent!==window)return;
      window.location.replace('./index.html');
    });
    document.querySelectorAll('[data-atlas-mode]').forEach(btn=>btn.addEventListener('click',()=>{
      if(!modeKeys.includes(btn.dataset.atlasMode))return;
      mode=btn.dataset.atlasMode;
      render();
    }));
    window.addEventListener('storage',event=>{
      if(event.key==='inj_node_language_v1')applyLanguage();
      if(event.key===SAVED_WALLETS_KEY||event.key===LABELS_KEY){readNames();render();}
    });
    window.addEventListener('pageshow',()=>{
      readNames();applyLanguage();
      if(!document.hidden)void refresh();
    });
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden){readNames();render();void refresh();}
    });
    window.addEventListener('online',()=>{if(!document.hidden)void refresh();});
    window.setInterval(()=>{if(!document.hidden)void refresh();},REFRESH_MS);
    window.setInterval(()=>{if(!document.hidden)render();},12000);
  }
  function start(){
    createTowers();
    readNames();
    hydrate();
    bind();
    applyLanguage();
    void refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
