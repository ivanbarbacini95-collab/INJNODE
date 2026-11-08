/* INJ Node · Cash Reserve · watch-only portfolio and verified yield monitor */
(() => {
  'use strict';
  // Fixed address configuration is held in cash-portfolio-onchain.js; never rendered.
  // V3 history is scoped to the two fixed, configured wallet accounts.
  const KEY_HISTORY = 'inj_node_cash_reserve_history_v3';
  const KEY_TARGET = 'inj_node_cash_reserve_goal_v1';
  const KEY_PRIVACY = 'inj_node_cash_reserve_privacy_v1';
  const $ = (id) => document.getElementById(id);
  if (!$('cashReservePanel')) return;

  const state = { amounts: null, usd: null, fx: null, lastSync: 0, loading: false, error: false, partial: false, errorDetail: '', privacy: false, target: 0, currency: 'USD', lang: 'it', range: 'ALL', history: [], portfolio: null };
  const historyKey = () => KEY_HISTORY;
  const phrases = {
    it: {reserve:'CASH RESERVE', sub:'Riserva patrimoniale · Injective + Solana', nominal:'Valore nominale della riserva', note:'Valore nominale: 1 stablecoin = 1 USD. Non è una quotazione di mercato né un capitale assicurato.', target:'Obiettivo di accumulo', targetHint:'Imposta un obiettivo in USD', save:'Salva', noGoal:'Nessun obiettivo impostato', ofGoal:'del target', history:'Evoluzione riserva', historyEmpty:'Lo storico si formerà da questo dispositivo a partire dalle prossime sincronizzazioni.', sync:'Sincronizza', updating:'Sincronizzazione…', online:'Online', offline:'Offline', pending:'In attesa', copied:'Indirizzo copiato', copy:'Copia', privacy:'Privacy', address:'Wallet di riserva', updated:'Aggiornato', noFX:'Cambio EUR/USD temporaneamente non disponibile', source:'Sola lettura · saldo on-chain · nessuna firma richiesta', warning:'Solo USDC nativo su Injective e USDC/USDT ufficiali su Solana. I saldi delle due reti restano distinti.', solPlaceholder:'Indirizzo pubblico wallet Solana', solMissing:'Solana non configurata: totale riferito solo a Injective.', solConfigured:'Solana collegata · lettura pubblica dei saldi', solInvalid:'Indirizzo Solana non valido.', partial:'Parziale', solFailed:'Impossibile leggere Solana; verifica la rete RPC.', injFailed:'Impossibile leggere Injective; verifica la rete LCD.', failed:'Saldo non verificabile: controlla la rete o riprova.', fx:'Controvalore stimato con cambio di riferimento USD/EUR.'},
    en: {reserve:'CASH RESERVE', sub:'Capital reserve · Injective + Solana', nominal:'Nominal reserve value', note:'Nominal valuation: 1 stablecoin = 1 USD. Not a market quote or insured capital.', target:'Savings target', targetHint:'Set a target in USD', save:'Save', noGoal:'No target set', ofGoal:'of target', history:'Reserve history', historyEmpty:'History starts on this device with the next successful syncs.', sync:'Sync', updating:'Syncing…', online:'Online', offline:'Offline', pending:'Waiting', copied:'Address copied', copy:'Copy', privacy:'Privacy', address:'Reserve wallet', updated:'Updated', noFX:'EUR/USD rate temporarily unavailable', source:'Read-only · on-chain balance · no wallet signature required', warning:'Only native USDC on Injective and official USDC/USDT on Solana. Balances stay separated by network.', solPlaceholder:'Public Solana wallet address', solMissing:'Solana not configured: total includes Injective only.', solConfigured:'Solana connected · public balance monitoring', solInvalid:'Invalid Solana address.', partial:'Partial', solFailed:'Solana balance unavailable; check RPC.', injFailed:'Injective balance unavailable; check LCD.', failed:'Balance cannot be verified: check the network and try again.', fx:'Estimated value using a reference USD/EUR exchange rate.'}
  };
  const tr = (k) => phrases[state.lang][k] || k;
  const store = (k, value) => { try { localStorage.setItem(k, JSON.stringify(value)); } catch (_) {} };
  const load = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (_) { return fallback; } };
  const fmt = (n, places = 2) => Number(n).toLocaleString(state.lang === 'it' ? 'it-IT' : 'en-US',{ minimumFractionDigits: places, maximumFractionDigits: places });
  const money = (n, c = 'USD') => (c === 'EUR' ? '€ ' : '$ ') + fmt(n);
  const shown = (v) => state.privacy ? '••••••' : v;
  const updateTexts = () => {
    document.querySelectorAll('[data-cash-it]').forEach((node) => {
      const label = state.lang === 'en' ? node.dataset.cashEn : node.dataset.cashIt;
      if (label) node.textContent = label;
    });
    $('cashGoalAmount').placeholder = tr('targetHint');
    $('cashSync').textContent = state.loading ? tr('updating') : tr('sync');
    $('cashPrivacy').setAttribute('aria-label',tr('privacy'));
  };
  const readPrefs = () => {
    try {
      state.lang = localStorage.getItem('inj_node_language_v1') === 'en' ? 'en' : 'it';
      state.currency = localStorage.getItem('inj_monitor_currency') === 'EUR' ? 'EUR' : 'USD';
    } catch (_) {}
  };
  const pickCurrency = () => {
    const c = state.currency;
    $('cashCurrency').value = c;
    const value = state.usd == null ? null : (c === 'EUR' && state.fx != null ? state.usd * state.fx : c === 'USD' ? state.usd : null);
    $('cashTotal').textContent = state.usd == null ? '—' : (value == null ? '—' : shown(money(value,c)));
    $('cashFxNote').textContent = c === 'EUR' && state.fx == null ? tr('noFX') : c === 'EUR' ? tr('fx') : tr('note');
  };
  const updateStatus = () => {
    const el = $('cashStatus');
    const online = !state.error && state.lastSync > 0;
    el.className = 'cash-pill ' + (state.error ? (state.partial ? 'is-partial' : 'is-error') : online ? 'is-ok' : 'is-idle');
    el.textContent = state.error ? (state.partial ? tr('partial') : tr('offline')) : online ? tr('online') : tr('pending');
    $('cashSyncInfo').textContent = state.lastSync ? tr('updated') + ' ' + new Date(state.lastSync).toLocaleTimeString(state.lang === 'it'?'it-IT':'en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : tr('pending');
    $('cashError').textContent = state.error ? (state.errorDetail || tr('failed')) : '';
  };
  function updateAmounts() {
    for (const [id, key] of [['cashUsdc','usdcInj'],['cashUsdcSol','usdcSol'],['cashUsdtSol','usdtSol']]) {
      const amount = state.amounts?.[key];
      $(id).textContent = Number.isFinite(amount) ? shown(fmt(amount,2)) : '—';
    }
  }

  function makeNode(tag, cls, value) {
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(value!=null)e.textContent=value;
    return e;
  }
  function renderAssetList(target,network) {
    const root=$(target);
    if(!root)return;
    root.replaceChildren();
    if(!network) {
      root.append(makeNode('p','cash-token-empty',state.lang==='it'?'Rete non disponibile · riprova la sincronizzazione':'Network unavailable · retry sync'));
      return;
    }
    const list=network.assets.slice().sort((a,b)=>{
      const rank=v=>v.kind==='stable'?0:v.kind==='native'?1:2;
      return rank(a)-rank(b)||a.name.localeCompare(b.name);
    });
    if(!list.length) {
      root.append(makeNode('p','cash-token-empty',state.lang==='it'?'Nessun asset con saldo positivo.':'No positive asset balances.'));
      return;
    }
    for(const entry of list) {
      const row=makeNode('div','cash-token-row');
      const icon=makeNode('span','cash-token-icon',entry.symbol.slice(0,4).toUpperCase());
      icon.setAttribute('aria-hidden','true');
      const main=makeNode('div','cash-token-name');
      main.append(makeNode('strong','',entry.name));
      main.append(makeNode('small','',entry.note));
      const amount=makeNode('div','cash-token-amount');
      amount.append(makeNode('strong','',shown(entry.amount.text)));
      if(entry.unformatted)amount.append(makeNode('small','',state.lang==='it'?'Unità base, decimali non disponibili':'Raw units; decimals unavailable'));
      else amount.append(makeNode('small','',entry.symbol));
      row.append(icon,main,amount);
      root.append(row);
    }
  }
  function renderYield() {
    const root=$('cashYieldList');
    if(!root)return;
    root.replaceChildren();
    const report=state.portfolio?.yield;
    if(!report) {
      root.append(makeNode('p','cash-token-empty',state.lang==='it'?'Lettura posizioni di rendimento non disponibile.':'Yield position data unavailable.'));
      return;
    }
    if(!report.positions.length) {
      root.append(makeNode('p','cash-token-empty',state.lang==='it'?'Nessuna delegazione staking nativa rilevata. Le posizioni in altre dApp richiedono integrazioni specifiche.':'No native staking delegations detected. Other dApps require dedicated integrations.'));
    }
    for(const p of report.positions) {
      const row=makeNode('article','cash-yield-position');
      const top=makeNode('div','cash-yield-heading');
      top.append(makeNode('strong','',p.name));
      top.append(makeNode('span','',p.apr!=null?fmt(p.apr,2)+'% APR '+(state.lang==='it'?'rete':'network'):'APR —'));
      const info=makeNode('div','cash-yield-metrics');
      function cell(label,val) {const wrapper=makeNode('div','');wrapper.append(makeNode('span','',label));wrapper.append(makeNode('strong','',shown(val)));return wrapper;}
      info.append(cell(state.lang==='it'?'IN DELEGA':'STAKED',fmt(p.amount,4)+' '+p.asset));
      info.append(cell(state.lang==='it'?'REWARD ON-CHAIN':'ON-CHAIN REWARDS',p.rewards==null?'—':fmt(p.rewards,6)+' '+p.asset));
      info.append(cell(state.lang==='it'?'STIMA / GIORNO':'EST. / DAY',p.day==null?'—':fmt(p.day,6)+' '+p.asset));
      row.append(top,info,makeNode('small','cash-yield-hint',state.lang==='it'?'APR di riferimento di rete, non rendimento garantito; reward confermate dalla blockchain.':'Reference network APR, not guaranteed; on-chain rewards shown separately.'));
      root.append(row);
    }
    root.append(makeNode('p','cash-yield-disclaimer',state.lang==='it'?'Le posizioni in Hydro, vault, lending e altre dApp non possono essere ricostruite in modo affidabile dal solo saldo del wallet: servono adapter specifici per contratto e protocollo. Nessuna rendita viene inventata.':'Hydro, vaults, lending and other dApps require protocol-specific on-chain adapters. No unverified yield is invented.'));
  }
  function renderPortfolio() {
    renderAssetList('cashInjectiveTokens',state.portfolio?.inj);
    renderAssetList('cashSolanaTokens',state.portfolio?.sol);
    const inj=$('cashInjAssetsStatus'),sol=$('cashSolAssetsStatus');
    if(inj)inj.textContent=state.portfolio?.inj?(state.lang==='it'?'ONLINE':'ONLINE'):'OFFLINE';
    if(sol)sol.textContent=state.portfolio?.sol?(state.lang==='it'?'ONLINE':'ONLINE'):'OFFLINE';
    const count=[state.portfolio?.inj,state.portfolio?.sol].filter(Boolean).reduce((sum,b)=>sum+b.assets.length,0);
    const counter=$('cashTokenCount');
    if(counter)counter.textContent=count+(state.portfolio?.inj&&state.portfolio?.sol?'':' · PARZIALE');
    const solUnsupported=$('cashSolAssetsNote');
    if(solUnsupported)solUnsupported.textContent=state.portfolio?.sol?.unsupported?(state.lang==='it'?'Alcuni token con formato non leggibile: '+state.portfolio.sol.unsupported:'Unreadable token accounts: '+state.portfolio.sol.unsupported):'';
    renderYield();
  }
  const updateGoal = () => {
    const progress = state.target > 0 && state.usd != null ? Math.max(0, Math.min(100, state.usd / state.target * 100)) : 0;
    $('cashProgressBar').style.width = progress + '%';
    $('cashGoalProgress').textContent = state.target > 0 ? (state.usd != null ? shown(fmt(progress,1)+'% '+tr('ofGoal')) : (state.lang==='it'?'Saldi in sincronizzazione':'Waiting for balances')) : tr('noGoal');
    $('cashGoalTotal').textContent = state.target > 0 ? shown(money(state.target)) : '—';
    $('cashGoalAmount').value = state.target > 0 ? String(state.target) : '';
  };
  const saveSnapshot = () => {
    if (state.usd == null) return;
    const now = Date.now();
    const last = state.history[state.history.length-1];
    if (!last || Math.abs(last.v - state.usd) > 0.000001 || now - last.t > 3600000) {
      state.history.push({t:now,v:state.usd});
      state.history = state.history.slice(-1800);
      store(historyKey(),state.history);
    }
  };
  const updateChart = () => {
    const chart = $('cashHistoryChart');
    const now = Date.now();
    const windows = { '1M':30*86400000,'3M':90*86400000,'6M':180*86400000,'1Y':365*86400000,'ALL':Infinity };
    let points = state.history.filter(p => p.t >= now-windows[state.range]);
    const current = state.usd != null ? {t:now,v:state.usd} : null;
    if (current && (!points.length || points[points.length-1].t < now-5000)) points.push(current);
    chart.textContent = '';
    $('cashChartEmpty').hidden = points.length > 1;
    if (points.length <= 1) return;
    const minT = points[0].t, maxT = Math.max(now,points[points.length-1].t,minT+1000);
    const lo = Math.min(...points.map(p => p.v)), hi = Math.max(...points.map(p=>p.v));
    const padding = Math.max((hi-lo)*0.12,hi*0.015,1);
    const yMin = Math.max(0,lo-padding), yMax = hi+padding;
    const x = p => 8+(p.t-minT)/(maxT-minT)*644;
    const y = p => 164 - (p.v-yMin)/(yMax-yMin)*146;
    const ns = 'http://www.w3.org/2000/svg';
    const shape = (tag,attributes) => {
      const element = document.createElementNS(ns,tag);
      Object.entries(attributes).forEach(([k,v]) => element.setAttribute(k,String(v)));
      chart.appendChild(element);
      return element;
    };
    [24,72,120,164].forEach(y => shape('line',{x1:8,x2:652,y1:y,y2:y,stroke:'currentColor','stroke-opacity':'.12','stroke-dasharray':'3 6'}));
    let d = 'M '+x(points[0]).toFixed(1)+' '+y(points[0]).toFixed(1);
    // A stepped series represents on-chain deposits and withdrawals without fake interpolation.
    points.slice(1).forEach(p => { d += ' H '+x(p).toFixed(1)+' V '+y(p).toFixed(1); });
    shape('path',{d,fill:'none',stroke:'#45e5ce','stroke-width':2.6,'stroke-linejoin':'round','stroke-linecap':'round'});
    const end = points[points.length-1];
    shape('circle',{cx:x(end),cy:y(end),r:4,fill:'#45e5ce'});
    $('cashChartFirst').textContent = new Date(minT).toLocaleDateString(state.lang==='it'?'it-IT':'en-US');
    $('cashChartLast').textContent = new Date(now).toLocaleDateString(state.lang==='it'?'it-IT':'en-US');
  };
  const render = () => { readPrefs(); updateTexts(); updateAmounts(); pickCurrency(); updateGoal(); updateStatus(); updateChart(); renderPortfolio(); };
  async function getJSON(url,ms=6500) {
    const abort = new AbortController(), timer = setTimeout(()=>abort.abort(),ms);
    try {
      const result = await fetch(url,{cache:'no-store',signal:abort.signal});
      if (!result.ok) throw new Error('HTTP '+result.status);
      return await result.json();
    } finally { clearTimeout(timer); }
  }
  async function refreshFX() {
    try {
      const j = await getJSON('https://api.frankfurter.app/latest?from=USD&to=EUR',6000);
      if (Number(j?.rates?.EUR) > 0) { state.fx = Number(j.rates.EUR); render(); }
    } catch (_) { /* Never invent a live FX rate. USD remains available. */ }
  }
  async function sync() {
    if(state.loading||document.hidden)return;
    state.loading=true;render();
    let p;
    try {p=await window.INJ_CASH_PORTFOLIO.scan();}
    catch(e) {p={inj:null,sol:null,yield:null,errors:{inj:true,sol:true,yield:true}};}
    state.portfolio=p;
    const injOK=Boolean(p.inj),solOK=Boolean(p.sol);
    state.amounts={
      usdcInj:injOK?p.inj.usdc:null,
      usdcSol:solOK?p.sol.usdc:null,
      usdtSol:solOK?p.sol.usdt:null
    };
    state.error=!injOK||!solOK;
    state.partial=state.error&&(injOK||solOK);
    state.errorDetail=[
      !injOK&&tr('injFailed'),
      !solOK&&tr('solFailed')
    ].filter(Boolean).join(' ');
    // Do not call a partial total a complete reserve.
    state.usd=injOK&&solOK?p.inj.usdc+p.sol.usdc+p.sol.usdt:null;
    if(injOK||solOK)state.lastSync=Date.now();
    if(state.usd!=null)saveSnapshot();
    state.loading=false;
    render();
  }
  function boot() {
    state.history = (load(historyKey(),[]) || []).filter(p=>Number.isFinite(p?.t)&&Number.isFinite(p?.v)&&p.v>=0).slice(-1800);
    state.target = Math.max(0,Number(load(KEY_TARGET,0))||0);
    state.privacy = !!load(KEY_PRIVACY,false);
    $('cashPrivacy').setAttribute('aria-pressed',String(state.privacy));
    $('cashGoalForm').addEventListener('submit',event=>{
      event.preventDefault();
      const v = Number($('cashGoalAmount').value);
      if (!Number.isFinite(v) || v < 0) return;
      state.target = v;store(KEY_TARGET,v);render();
    });
    $('cashPrivacy').addEventListener('click',()=>{
      state.privacy = !state.privacy;
      store(KEY_PRIVACY,state.privacy);
      $('cashPrivacy').setAttribute('aria-pressed',String(state.privacy));render();
    });
    $('cashCurrency').addEventListener('change',event=>{
      state.currency = event.target.value;
      try{localStorage.setItem('inj_monitor_currency',state.currency)}catch(_){}
      render();
    });
    $('cashSync').addEventListener('click',()=>void sync());
    document.querySelectorAll('[data-cash-range]').forEach(button=>{
      button.addEventListener('click',()=>{
        state.range=button.dataset.cashRange;
        document.querySelectorAll('[data-cash-range]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
        updateChart();
      });
    });
    window.addEventListener('storage',event=>{
      if (['inj_node_language_v1','inj_monitor_currency'].includes(event.key)) render();
    });
    document.addEventListener('visibilitychange',()=>{ if (!document.hidden) void sync(); });
    window.addEventListener('online',()=>void sync());
    render();void sync();void refreshFX();
    setInterval(()=>{ if (!document.hidden) void sync(); },30000);
    setInterval(()=>{ if (!document.hidden) void refreshFX(); },3600000);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
