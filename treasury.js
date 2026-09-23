(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const N = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const state = {
    currency: 'USD', eurRate: 0.86, price: 0, open24: 0, change: 0,
    available: 0, staked: 0, rewards: 0, totalInj: 0, apr: 0, updatedAt: 0,
    loading: false, socket: null, session: [], lastSessionAt: 0
  };

  try { state.currency = localStorage.getItem('inj_monitor_currency') === 'EUR' ? 'EUR' : 'USD'; } catch (_) {}

  function inj(v, digits = 4) {
    return `${N(v).toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} INJ`;
  }
  function currencyValue(usd) { return state.currency === 'EUR' ? N(usd) * state.eurRate : N(usd); }
  function money(usd, digits = 2) {
    return new Intl.NumberFormat(state.currency === 'EUR' ? 'it-IT' : 'en-US', {
      style:'currency', currency:state.currency, minimumFractionDigits:digits, maximumFractionDigits:digits
    }).format(currencyValue(usd));
  }
  function compactMoney(usd) {
    const v = currencyValue(usd), a = Math.abs(v);
    if (a < 1000) return money(usd, 2);
    const u = a >= 1e9 ? [1e9,'B'] : a >= 1e6 ? [1e6,'M'] : [1e3,'K'];
    const n = a / u[0], d = n >= 100 ? 0 : n >= 10 ? 1 : 2;
    const s = n.toLocaleString(state.currency === 'EUR' ? 'it-IT' : 'en-US',{maximumFractionDigits:d});
    return state.currency === 'EUR' ? `${v < 0 ? '−' : ''}${s}${u[1]} €` : `${v < 0 ? '−' : ''}$${s}${u[1]}`;
  }
  function ago(ts) {
    const seconds = Math.max(0, Math.floor((Date.now()-N(ts))/1000));
    if (seconds < 3) return 'adesso';
    if (seconds < 60) return `${seconds}s fa`;
    return `${Math.floor(seconds/60)}m fa`;
  }
  function toast(message) {
    const el = $('treasuryToast'); if (!el) return;
    el.textContent = message; el.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200);
  }
  async function fetchJson(url, timeout = 8000) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(url,{cache:'no-store',signal:c.signal,headers:{Accept:'application/json'}});
      const d=await r.json().catch(()=>null);
      if(!r.ok) throw new Error(d?.message||`HTTP ${r.status}`);
      return d;
    } finally { clearTimeout(t); }
  }
  async function loadEur() {
    try {
      const cached=N(localStorage.getItem('inj_monitor_eur_rate'));
      if(cached>0) state.eurRate=cached;
      const d=await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR',6000);
      const r=N(d?.rates?.EUR);
      if(r>0){state.eurRate=r;localStorage.setItem('inj_monitor_eur_rate',String(r));render();}
    } catch (_) {}
  }
  async function loadMarket() {
    try {
      const d=await fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT',8000);
      updateMarket(N(d.lastPrice),N(d.openPrice),N(d.priceChangePercent));
    } catch (_) {
      try {
        const d=await fetchJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=injective-protocol&sparkline=false',8000);
        const c=d?.[0];
        updateMarket(N(c?.current_price),N(c?.current_price)-N(c?.price_change_24h),N(c?.price_change_percentage_24h));
      } catch (_) {}
    }
  }
  function updateMarket(price, open, change) {
    if(price>0) state.price=price;
    if(open>0) state.open24=open;
    state.change = state.open24>0&&state.price>0 ? (state.price/state.open24-1)*100 : change;
    pushSession(); render();
  }
  function connectMarket() {
    try { state.socket?.close(); } catch (_) {}
    if(document.hidden) return;
    try {
      const ws=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@miniTicker');
      state.socket=ws;
      ws.onmessage=(e)=>{try{const d=JSON.parse(e.data);updateMarket(N(d.c),N(d.o),0);}catch(_){}};
      ws.onclose=()=>{if(!document.hidden)setTimeout(connectMarket,4500);};
      ws.onerror=()=>{};
    } catch (_) { setTimeout(connectMarket,5000); }
  }
  async function loadTreasury(silent = false) {
    if(state.loading) return;
    state.loading=true;
    if(!silent) setStatus('sync');
    try {
      const d=await fetchJson('/api/treasury',10000);
      if(!d?.ok||!d?.treasury) throw new Error(d?.message||'Treasury non disponibile');
      const t=d.treasury;
      state.available=N(t.available); state.staked=N(t.staked); state.rewards=N(t.rewards);
      state.totalInj=N(t.totalInj); state.apr=N(t.apr);
      state.updatedAt=Date.parse(t.updatedAt||'')||Date.now();
      document.body.classList.remove('treasury-error');
      pushSession(true); render(); setStatus('online');
    } catch (e) {
      document.body.classList.add('treasury-error');
      setStatus('error', e?.message || 'Treasury non disponibile');
    } finally { state.loading=false; }
  }
  function setStatus(mode, message='') {
    const live=$('treasuryLiveText'), sync=$('treasurySync');
    if(mode==='error'){
      if(live)live.textContent='OFFLINE';
      if(sync)sync.textContent=message;
      return;
    }
    if(live) live.textContent=mode==='sync'?'SYNC':'LIVE';
    if(sync) sync.textContent=mode==='sync'?'Sincronizzazione…':state.updatedAt?`Aggiornato ${ago(state.updatedAt)}`:'In attesa…';
  }
  function setText(id,text){const el=$(id);if(el)el.textContent=text;}
  function render() {
    const total=state.totalInj, price=state.price, worth=total*price;
    setText('treasuryTotalInj', total>0?inj(total,2):'— INJ');
    setText('treasuryNetWorth',worth>0?compactMoney(worth):'—');
    setText('treasuryPrice',price>0?`$${price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:price<10?4:2})}`:'$—');
    const ch=$('treasuryChange');
    if(ch){
      ch.textContent=price>0?`${state.change>0?'+':''}${state.change.toFixed(2)}% · 24H`:'— · 24H';
      ch.className=state.change>0?'up':state.change<0?'down':'';
    }
    setText('treasuryStaked',state.staked>0?inj(state.staked):'— INJ');
    setText('treasuryStakedValue',price>0?money(state.staked*price):'—');
    setText('treasuryAvailable',inj(state.available));
    setText('treasuryAvailableValue',price>0?money(state.available*price):'—');
    setText('treasuryRewards',inj(state.rewards));
    setText('treasuryRewardsValue',price>0?money(state.rewards*price):'—');

    const stakePct=total>0?state.staked/total*100:0;
    const availPct=total>0?state.available/total*100:0;
    const rewardPct=total>0?state.rewards/total*100:0;
    const sb=$('treasuryStakedBar'),ab=$('treasuryAvailableBar');
    if(sb)sb.style.width=`${Math.min(100,stakePct)}%`;
    if(ab)ab.style.width=`${Math.min(100,availPct)}%`;
    setText('treasuryStakePct',`${stakePct.toFixed(1)}%`);
    setText('treasuryStakePctRow',`${stakePct.toFixed(1)}%`);
    setText('treasuryAvailablePctRow',`${availPct.toFixed(1)}%`);
    setText('treasuryRewardPctRow',`${rewardPct.toFixed(2)}%`);
    const ring=$('treasuryAllocationRing');
    if(ring){
      ring.style.setProperty('--stake',`${stakePct*3.6}deg`);
      ring.style.setProperty('--avail',`${(stakePct+availPct)*3.6}deg`);
    }
    renderVelocity(); renderMilestone(); renderSession();
    setText('treasuryCurrency',state.currency==='EUR'?'€':'$');
  }
  function renderVelocity(){
    const annual=state.staked*Math.max(0,state.apr)/100, day=annual/365;
    setText('treasuryApr',state.apr>0?`APR ${state.apr.toFixed(2)}%`:'APR —');
    setText('rewardHour',inj(day/24)); setText('rewardDay',inj(day));
    setText('rewardWeek',inj(day*7)); setText('rewardMonth',inj(annual/12));
    setText('rewardYear',inj(annual));
    setText('rewardYearValue',state.price>0?`≈ ${money(annual*state.price,0)}`:'—');
  }
  function nextTarget(total){
    const levels=[100,250,500,1000,1500,2000,2500,3000,5000,7500,10000,15000,25000,50000,100000,250000,500000,1000000];
    return levels.find(v=>v>total)||Math.ceil(total/1000000+1)*1000000;
  }
  function renderMilestone(){
    const total=state.totalInj,target=nextTarget(total);
    const levels=[0,100,250,500,1000,1500,2000,2500,3000,5000,7500,10000,15000,25000,50000,100000,250000,500000,1000000];
    const prev=levels.filter(v=>v<=total).pop()||0;
    const pct=Math.max(0,Math.min(100,(total-prev)/Math.max(1,target-prev)*100));
    const missing=Math.max(0,target-total);
    setText('milestoneTitle',`${target.toLocaleString('it-IT')} INJ`);
    setText('milestonePct',`${pct.toFixed(1)}%`);
    setText('milestoneCurrent',`${total.toLocaleString('it-IT',{maximumFractionDigits:2})} INJ`);
    setText('milestoneTarget',`${target.toLocaleString('it-IT')} INJ`);
    setText('milestoneMissing',`${missing.toLocaleString('it-IT',{maximumFractionDigits:2})} INJ mancanti`);
    const bar=$('milestoneBar'); if(bar)bar.style.width=`${pct}%`;
    const daily=(state.staked*Math.max(0,state.apr)/100)/365;
    let time='Solo reward: —';
    if(daily>0&&missing>0){
      const days=missing/daily;
      time=days<1?`Solo reward: ${(days*24).toFixed(1)}h`:days<60?`Solo reward: ${days.toFixed(1)}g`:`Solo reward: ${(days/30.44).toFixed(1)} mesi`;
    }
    setText('milestoneRewardTime',time);
  }
  function pushSession(force=false){
    const value=state.totalInj*state.price;
    if(!(value>0))return;
    const now=Date.now();
    if(!force&&now-state.lastSessionAt<1500)return;
    state.lastSessionAt=now;
    state.session.push({t:now,v:value});
    if(state.session.length>160)state.session.splice(0,state.session.length-160);
  }
  function renderSession(){
    const rows=state.session,line=$('sessionLine'),area=$('sessionArea'),dot=$('sessionDot'),empty=$('sessionEmpty');
    if(!line||!area||!dot)return;
    if(rows.length<2){
      if(empty)empty.hidden=false;
      line.setAttribute('d',''); area.setAttribute('d',''); dot.setAttribute('cx','-20');
      return;
    }
    if(empty)empty.hidden=true;
    const W=720,H=220,P=14,min=Math.min(...rows.map(r=>r.v)),max=Math.max(...rows.map(r=>r.v));
    const pad=Math.max((max-min)*.18,max*.00025,0.01),lo=min-pad,hi=max+pad,span=Math.max(.000001,hi-lo);
    const pts=rows.map((r,i)=>({x:P+(i/(rows.length-1))*(W-P*2),y:H-P-((r.v-lo)/span)*(H-P*2)}));
    const d=pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    line.setAttribute('d',d);
    area.setAttribute('d',`${d} L${pts.at(-1).x.toFixed(2)} ${H-P} L${pts[0].x.toFixed(2)} ${H-P} Z`);
    dot.setAttribute('cx',pts.at(-1).x); dot.setAttribute('cy',pts.at(-1).y);
    const delta=rows.at(-1).v-rows[0].v,pct=rows[0].v?delta/rows[0].v*100:0;
    setText('sessionDelta',`${delta>=0?'+':''}${money(delta,2)} · ${pct>=0?'+':''}${pct.toFixed(2)}%`);
    const sd=$('sessionDelta'); if(sd)sd.style.color=delta>0?'var(--up)':delta<0?'var(--down)':'var(--muted)';
    const tf=(t)=>new Date(t).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    setText('sessionStart',tf(rows[0].t)); setText('sessionNow',tf(rows.at(-1).t));
  }
  function toggleCurrency(){
    state.currency=state.currency==='USD'?'EUR':'USD';
    try{localStorage.setItem('inj_monitor_currency',state.currency);}catch(_){}
    render(); toast(`Valuta: ${state.currency}`);
  }
  function goHome(){
    try{
      if(sessionStorage.getItem('inj_node_treasury_from_home')){
        sessionStorage.removeItem('inj_node_treasury_from_home');
        history.back(); return;
      }
    }catch(_){}
    location.assign('./index.html');
  }
  function bind(){
    $('treasuryHome')?.addEventListener('click',goHome);
    $('treasuryCurrency')?.addEventListener('click',toggleCurrency);
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){try{state.socket?.close();}catch(_){}}
      else{connectMarket();loadTreasury(true);loadMarket();}
    });
  }
  async function init(){
    bind(); render(); setStatus('sync');
    void loadEur();
    await Promise.allSettled([loadMarket(),loadTreasury(true)]);
    connectMarket();
    setInterval(()=>{if(!document.hidden)loadTreasury(true);},12000);
    setInterval(()=>{if(!document.hidden && (!state.socket || state.socket.readyState!==WebSocket.OPEN))loadMarket();},60000);
    setInterval(()=>{if(!document.hidden){pushSession();renderSession();if(state.updatedAt)setStatus('online');}},2000);
  }
  init();
})();