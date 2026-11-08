/* INJ Node · Cash Reserve · read-only Injective + Solana stablecoin monitor */
(() => {
  'use strict';
  const ADDRESS = 'inj1hqzpll2ma9t02rywfcfx7hpsl0rran5ptj4pd8';
  const LCDS = [
    'https://sentry.lcd.injective.network:443',
    'https://lcd.injective.network',
    'https://1rpc.io/inj-lcd'
  ];
  // Exact, chain-verified denoms. Do not match tokens by their display symbol.
  // Keep only the canonical native Injective USDC denom.
  const INJ_USDC_DENOM = 'erc20:0xa00c59ff5a080d2b954d0c75e46e22a0c371235a';
  // Solana mainnet mint IDs confirmed by Solana and the respective issuers.
  const SOL_MINTS = Object.freeze({
    usdcSol: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    usdtSol: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  });
  const SOL_RPC = 'https://api.mainnet-beta.solana.com';
  // Version 2 starts a fresh history because the old token basket included bridged/legacy assets.
  const KEY_HISTORY = 'inj_node_cash_reserve_history_v2_';
  const KEY_SOL_ADDRESS = 'inj_node_cash_reserve_sol_wallet_v1';
  const KEY_TARGET = 'inj_node_cash_reserve_goal_v1';
  const KEY_PRIVACY = 'inj_node_cash_reserve_privacy_v1';
  const $ = (id) => document.getElementById(id);
  if (!$('cashReservePanel')) return;

  const state = { amounts: null, usd: null, fx: null, lastSync: 0, loading: false, error: false, partial: false, errorDetail: '', privacy: false, target: 0, currency: 'USD', lang: 'it', range: 'ALL', history: [], solAddress: '' };
  const historyKey = () => KEY_HISTORY + (state.solAddress || 'injective-only');
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
    $('cashSolAddress').placeholder = tr('solPlaceholder');
    $('cashSolSave').textContent = tr('save');
    $('cashSolStatus').textContent = state.solAddress ? tr('solConfigured') : tr('solMissing');
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
  const render = () => { readPrefs(); updateTexts(); updateAmounts(); pickCurrency(); updateGoal(); updateStatus(); updateChart(); };
  async function getJSON(url,ms=6500) {
    const abort = new AbortController(), timer = setTimeout(()=>abort.abort(),ms);
    try {
      const result = await fetch(url,{cache:'no-store',signal:abort.signal});
      if (!result.ok) throw new Error('HTTP '+result.status);
      return await result.json();
    } finally { clearTimeout(timer); }
  }
  async function postRPC(payload, ms = 9000) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), ms);
    try {
      const result = await fetch(SOL_RPC, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload), cache: 'no-store', signal: abort.signal
      });
      if (!result.ok) throw new Error('Solana RPC HTTP ' + result.status);
      const json = await result.json();
      if (json.error) throw new Error(json.error.message || 'Solana RPC error');
      if (!Array.isArray(json.result?.value)) throw new Error('Invalid Solana RPC response');
      return json.result.value;
    } finally { clearTimeout(timer); }
  }
  async function fetchSolanaBalances(address) {
    const entries = await Promise.all(Object.entries(SOL_MINTS).map(async ([id,mint],index) => {
      const accounts = await postRPC({
        jsonrpc:'2.0', id:index+1, method:'getTokenAccountsByOwner',
        params:[address,{mint},{encoding:'jsonParsed',commitment:'confirmed'}]
      });
      let total = 0n;
      for (const account of accounts) {
        const info = account?.account?.data?.parsed?.info;
        const token = info?.tokenAmount;
        if (info?.mint !== mint || token?.decimals !== 6 || !/^\\d+$/.test(String(token?.amount ?? ''))) {
          throw new Error('Unexpected Solana mint/decimals response');
        }
        total += BigInt(token.amount);
      }
      const value = Number(total) / 1e6;
      if (!Number.isFinite(value) || value < 0) throw new Error('Invalid Solana token balance');
      return [id,value];
    }));
    return Object.fromEntries(entries);
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
    state.loading = true; render();
    const useSolana = Boolean(state.solAddress);
    const addressAtStart = state.solAddress;
    const [injective, solana] = await Promise.allSettled([
      fetchBalances(),
      useSolana ? fetchSolanaBalances(addressAtStart) : Promise.resolve(null)
    ]);
    // Never combine balances from a wallet that changed during an in-flight request.
    if (addressAtStart !== state.solAddress) {
      state.loading = false; render(); void sync(); return;
    }
    const next = {usdcInj:null,usdcSol:null,usdtSol:null};
    if (injective.status === 'fulfilled') {
      const byDenom = new Map();
      injective.value.forEach(b=>byDenom.set(String(b.denom||'').toLowerCase(),String(b.amount||'0')));
      const value = amt(byDenom.get(INJ_USDC_DENOM) || '0',6);
      if (Number.isFinite(value) && value >= 0) next.usdcInj = value;
    }
    if (useSolana && solana.status === 'fulfilled') {
      next.usdcSol = solana.value.usdcSol;
      next.usdtSol = solana.value.usdtSol;
    }
    const injOK = Number.isFinite(next.usdcInj);
    const solOK = !useSolana || (Number.isFinite(next.usdcSol) && Number.isFinite(next.usdtSol));
    state.amounts = next;
    state.error = !injOK || !solOK;
    state.partial = state.error && (injOK || (useSolana && solOK));
    state.errorDetail = [!injOK && tr('injFailed'),useSolana && !solOK && tr('solFailed')].filter(Boolean).join(' ');
    state.usd = injOK && solOK ? next.usdcInj + (useSolana ? next.usdcSol + next.usdtSol : 0) : null;
    if (injOK || (useSolana && solOK)) state.lastSync = Date.now();
    if (state.usd != null) saveSnapshot();
    state.loading = false;
    render();
  }
  function boot() {
    state.solAddress = String(load(KEY_SOL_ADDRESS,'')||'');
    state.history = (load(historyKey(),[]) || []).filter(p=>Number.isFinite(p?.t)&&Number.isFinite(p?.v)&&p.v>=0).slice(-1800);
    $('cashSolAddress').value = state.solAddress;
    state.target = Math.max(0,Number(load(KEY_TARGET,0))||0);
    state.privacy = !!load(KEY_PRIVACY,false);
    $('cashWalletAddress').textContent = ADDRESS.slice(0,11)+'…'+ADDRESS.slice(-9);
    $('cashPrivacy').setAttribute('aria-pressed',String(state.privacy));
    $('cashSolWalletForm').addEventListener('submit',event=>{
      event.preventDefault();
      const address = $('cashSolAddress').value.trim();
      const error = $('cashSolAddressError');
      if (address && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        error.textContent = tr('solInvalid'); return;
      }
      error.textContent = '';
      if (address === state.solAddress) return;
      state.solAddress = address;
      store(KEY_SOL_ADDRESS,address);
      state.history = (load(historyKey(),[]) || []).filter(p=>Number.isFinite(p?.t)&&Number.isFinite(p?.v)&&p.v>=0).slice(-1800);
      state.amounts = null; state.usd = null; state.lastSync = 0;
      state.error = false; state.errorDetail = '';
      render(); void sync();
    });
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
