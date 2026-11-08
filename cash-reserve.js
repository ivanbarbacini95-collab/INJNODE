/* INJ Node · Cash Reserve · read-only Injective stablecoin monitor */
(() => {
  'use strict';
  const ADDRESS = 'inj1hqzpll2ma9t02rywfcfx7hpsl0rran5ptj4pd8';
  const LCDS = [
    'https://sentry.lcd.injective.network:443',
    'https://lcd.injective.network',
    'https://1rpc.io/inj-lcd'
  ];
  // Exact, chain-verified denoms. Do not match tokens by their display symbol.
  const ASSETS = Object.freeze([
    { id: 'usdc', label: 'USDC', denom: 'erc20:0xa00c59ff5a080d2b954d0c75e46e22a0c371235a', decimals: 6 },
    { id: 'usdt', label: 'USDT', denom: 'peggy0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
    { id: 'usdcnb', label: 'USDCnb', denom: 'ibc/2cbc2ea121ae42563b08028466f37b600f2d7d4282342de938283cc3fb2bc00e', decimals: 6 }
  ]);
  const KEY_HISTORY = 'inj_node_cash_reserve_history_v1';
  const KEY_TARGET = 'inj_node_cash_reserve_goal_v1';
  const KEY_PRIVACY = 'inj_node_cash_reserve_privacy_v1';
  const $ = (id) => document.getElementById(id);
  if (!$('cashReservePanel')) return;

  const state = { amounts: null, usd: null, fx: null, lastSync: 0, loading: false, error: false, privacy: false, target: 0, currency: 'USD', lang: 'it', range: 'ALL', history: [] };
  const phrases = {
    it: {reserve:'CASH RESERVE', sub:'Riserva patrimoniale · Injective', nominal:'Valore nominale della riserva', note:'Valore nominale: 1 stablecoin = 1 USD. Non è una quotazione di mercato né un capitale assicurato.', target:'Obiettivo di accumulo', targetHint:'Imposta un obiettivo in USD', save:'Salva', noGoal:'Nessun obiettivo impostato', ofGoal:'del target', history:'Evoluzione riserva', historyEmpty:'Lo storico si formerà da questo dispositivo a partire dalle prossime sincronizzazioni.', sync:'Sincronizza', updating:'Sincronizzazione…', online:'Online', offline:'Offline', pending:'In attesa', copied:'Indirizzo copiato', copy:'Copia', privacy:'Privacy', address:'Wallet di riserva', updated:'Aggiornato', noFX:'Cambio EUR/USD temporaneamente non disponibile', source:'Sola lettura · saldo on-chain · nessuna firma richiesta', warning:'USDCnb è una versione bridged/legacy e viene distinta da USDC nativo.', failed:'Saldo non verificabile: controlla la rete o riprova.', fx:'Controvalore stimato con cambio di riferimento USD/EUR.'},
    en: {reserve:'CASH RESERVE', sub:'Capital reserve · Injective', nominal:'Nominal reserve value', note:'Nominal valuation: 1 stablecoin = 1 USD. Not a market quote or insured capital.', target:'Savings target', targetHint:'Set a target in USD', save:'Save', noGoal:'No target set', ofGoal:'of target', history:'Reserve history', historyEmpty:'History starts on this device with the next successful syncs.', sync:'Sync', updating:'Syncing…', online:'Online', offline:'Offline', pending:'Waiting', copied:'Address copied', copy:'Copy', privacy:'Privacy', address:'Reserve wallet', updated:'Updated', noFX:'EUR/USD rate temporarily unavailable', source:'Read-only · on-chain balance · no wallet signature required', warning:'USDCnb is a bridged/legacy token, distinct from native USDC.', failed:'Balance cannot be verified: check the network and try again.', fx:'Estimated value using a reference USD/EUR exchange rate.'}
  };
  const tr = (k) => phrases[state.lang][k] || k;
  const store = (k, value) => { try { localStorage.setItem(k, JSON.stringify(value)); } catch (_) {} };
  const load = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (_) { return fallback; } };
  const fmt = (n, places = 2) => Number(n).toLocaleString(state.lang === 'it' ? 'it-IT' : 'en-US',{ minimumFractionDigits: places, maximumFractionDigits: places });
  const money = (n, c = 'USD') => (c === 'EUR' ? '€ ' : '$ ') + fmt(n);
  const shown = (v) => state.privacy ? '••••••' : v;
  const amt = (raw, decimals) => {
    try { return Number(BigInt(raw || '0')) / (10 ** decimals); } catch (_) { return NaN; }
  };
  const updateTexts = () => {
    document.querySelectorAll('[data-cash-it]').forEach((node) => {
      const label = state.lang === 'en' ? node.dataset.cashEn : node.dataset.cashIt;
      if (label) node.textContent = label;
    });
    $('cashGoalAmount').placeholder = tr('targetHint');
    $('cashSync').textContent = state.loading ? tr('updating') : tr('sync');
    $('cashCopy').textContent = tr('copy');
    $('cashPrivacy').setAttribute('aria-label', tr('privacy'));
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
    el.className = 'cash-pill ' + (state.error ? 'is-error' : online ? 'is-ok' : 'is-idle');
    el.textContent = state.error ? tr('offline') : online ? tr('online') : tr('pending');
    $('cashSyncInfo').textContent = state.lastSync ? tr('updated') + ' ' + new Date(state.lastSync).toLocaleTimeString(state.lang === 'it'?'it-IT':'en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : tr('pending');
    $('cashError').textContent = state.error ? tr('failed') : '';
  };
  function updateAmounts() {
    if (!state.amounts) {
      ['cashUsdc','cashUsdt','cashUsdcnb'].forEach(id => $(id).textContent = '—');
      return;
    }
    $('cashUsdc').textContent = shown(fmt(state.amounts.usdc,2));
    $('cashUsdt').textContent = shown(fmt(state.amounts.usdt,2));
    $('cashUsdcnb').textContent = shown(fmt(state.amounts.usdcnb,2));
  }
  const updateGoal = () => {
    const progress = state.target > 0 && state.usd != null ? Math.max(0, Math.min(100, state.usd / state.target * 100)) : 0;
    $('cashProgressBar').style.width = progress + '%';
    $('cashGoalProgress').textContent = state.target > 0 && state.usd != null ? shown(fmt(progress,1)+'% '+tr('ofGoal')) : tr('noGoal');
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
      store(KEY_HISTORY,state.history);
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
  const render = () => { readPrefs(); updateTexts(); updateAmounts(); pickCurrency(); updateGoal(); updateStatus(); updateChart(); };
  async function getJSON(url,ms=6500) {
    const abort = new AbortController(), timer = setTimeout(()=>abort.abort(),ms);
    try {
      const result = await fetch(url,{cache:'no-store',signal:abort.signal});
      if (!result.ok) throw new Error('HTTP '+result.status);
      return await result.json();
    } finally { clearTimeout(timer); }
  }
  async function fetchBalances() {
    let lastError = null;
    for (const host of LCDS) {
      try {
        const all = [], visited = new Set();
        let nextKey = '';
        for(let page=0;page<8;page++) {
          const path = '/cosmos/bank/v1beta1/balances/'+encodeURIComponent(ADDRESS)+'?pagination.limit=200'+(nextKey?'&pagination.key='+encodeURIComponent(nextKey):'');
          const result = await getJSON(host+path,5000);
          if (!Array.isArray(result.balances)) throw new Error('Invalid bank balance response');
          all.push(...result.balances);
          nextKey = result.pagination && result.pagination.next_key || '';
          if (!nextKey) return all;
          if (visited.has(nextKey)) throw new Error('Repeated pagination key');
          visited.add(nextKey);
        }
        throw new Error('Too many balance pages');
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('LCD unavailable');
  }
  async function refreshFX() {
    try {
      const j = await getJSON('https://api.frankfurter.app/latest?from=USD&to=EUR',6000);
      if (Number(j?.rates?.EUR) > 0) { state.fx = Number(j.rates.EUR); render(); }
    } catch (_) { /* Never invent a live FX rate. USD remains available. */ }
  }
  async function sync() {
    if (state.loading || document.hidden) return;
    state.loading=true;render();
    try {
      const balances = await fetchBalances();
      const byDenom = new Map();
      balances.forEach(b=>byDenom.set(String(b.denom || '').toLowerCase(),String(b.amount || '0')));
      const amounts = {};
      for (const asset of ASSETS) {
        const amount = amt(byDenom.get(asset.denom) || '0',asset.decimals);
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid token amount');
        amounts[asset.id] = amount;
      }
      state.amounts = amounts;
      state.usd = amounts.usdc + amounts.usdt + amounts.usdcnb;
      state.lastSync = Date.now();
      state.error = false;
      saveSnapshot();
    } catch (error) {
      state.error = true;
      console.warn('Cash Reserve sync failed',error);
    } finally {
      state.loading=false;
      render();
    }
  }
  function boot() {
    state.history = (load(KEY_HISTORY,[]) || []).filter(p=>Number.isFinite(p?.t)&&Number.isFinite(p?.v)&&p.v>=0).slice(-1800);
    state.target = Math.max(0,Number(load(KEY_TARGET,0))||0);
    state.privacy = !!load(KEY_PRIVACY,false);
    $('cashWalletAddress').textContent = ADDRESS.slice(0,11)+'…'+ADDRESS.slice(-9);
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
    $('cashCopy').addEventListener('click',async()=>{
      try { await navigator.clipboard.writeText(ADDRESS); $('cashCopy').textContent=tr('copied'); }
      catch (_) { $('cashWalletAddress').textContent=ADDRESS; }
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
