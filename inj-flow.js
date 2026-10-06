'use strict';

const $ = (id) => document.getElementById(id);
const INJ_DECIMALS = 1e18;
const LCD_ENDPOINTS = [
  'https://sentry.lcd.injective.network:443',
  'https://lcd.injective.network',
  'https://1rpc.io/inj-lcd'
];
const SAVED_WALLETS_KEY = 'inj_monitor_wallets_v1';
const ACTIVE_WALLET_KEY = 'inj_monitor_address';
const OFFICIAL_APR_ENDPOINT = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
const REFRESH_MS = 15000;
const PRICE_POLL_MS = 30000;
const FX_POLL_MS = 3600000;

const state = {
  wallets: [],
  rows: [],
  activeAddress: '',
  currency: 'USD',
  eurRate: 0.86,
  apr: 0,
  price: 0,
  priceChange24h: 0,
  lastPrice: 0,
  lastSync: 0,
  socket: null,
  socketTimer: 0,
  refreshTimer: 0,
  pricePollTimer: 0,
  fxPollTimer: 0,
  particles: [],
  animationFrame: 0,
  syncInFlight: false,
  layoutWidth: 1000,
  layoutHeight: 700,
  pathsReady: false,
  nodePositions: new Map(),
  claimBursts: [],
  pendingClaims: [],
  nightWatch: false,
  wakeLock: null,
};

function lang() {
  try { return localStorage.getItem('inj_node_language_v1') === 'en' ? 'en' : 'it'; }
  catch (_) { return 'it'; }
}
function copy(it, en) { return lang() === 'en' ? en : it; }
function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function fromWei(value) { return number(value) / INJ_DECIMALS; }
function shortAddress(address) { return address ? `${address.slice(0,9)}…${address.slice(-7)}` : '—'; }
function formatInj(value, digits = 4) {
  return number(value).toLocaleString(lang() === 'en' ? 'en-US' : 'it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true
  });
}
function formatCompactInj(value, digits = 2) {
  return number(value).toLocaleString(lang() === 'en' ? 'en-US' : 'it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true
  });
}
function smartMoney(value, currency = state.currency) {
  const valid = number(value);
  const abs = Math.abs(valid);
  const digits = abs === 0 ? 2 : abs >= 100 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return valid.toLocaleString(lang() === 'en' ? 'en-US' : 'it-IT', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}
function moneyFromUsd(usd) {
  if (state.currency === 'EUR') {
    return smartMoney(number(usd) * Math.max(0, number(state.eurRate) || 0), 'EUR');
  }
  return smartMoney(usd, 'USD');
}
function fiatFromInj(inj) {
  if (!(state.price > 0)) return '—';
  return moneyFromUsd(number(inj) * state.price);
}
function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function nextRewardMilestone(daily) {
  const levels = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50];
  const current = Math.max(0, number(daily));
  let previous = 0;
  for (const target of levels) {
    if (current < target - 1e-12) {
      const progress = target > previous ? ((current - previous) / (target - previous)) * 100 : 0;
      return { target, previous, progress: Math.max(0, Math.min(100, progress)) };
    }
    previous = target;
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, current))));
  const target = Math.ceil(current / magnitude + 1) * magnitude;
  return { target, previous: current, progress: 0 };
}
function detectClaims(previousRows, nextRows) {
  if (!Array.isArray(previousRows) || !previousRows.length) return [];
  const previous = new Map(previousRows.map((row) => [row.address, row]));
  const events = [];
  for (const row of nextRows) {
    const before = previous.get(row.address);
    if (!before?.synced || !row?.synced) continue;
    const drop = number(before.reward) - number(row.reward);
    const availableGain = number(row.available) - number(before.available);
    const expectedAccrual = Math.max(0, number(before.daily)) * (REFRESH_MS / 86400000);
    const threshold = Math.max(0.00002, expectedAccrual * 6);
    const strongReset = number(before.reward) > 0.00005 && number(row.reward) <= number(before.reward) * 0.35;
    if (drop > threshold && (availableGain > Math.min(drop * 0.12, 0.00002) || strongReset)) {
      events.push({ address: row.address, label: row.label, amount: drop, availableGain: Math.max(0, availableGain) });
    }
  }
  return events;
}
async function requestWakeLock() {
  if (!state.nightWatch || !('wakeLock' in navigator) || state.wakeLock) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => { state.wakeLock = null; }, { once: true });
  } catch (_) {}
}
async function releaseWakeLock() {
  try { await state.wakeLock?.release(); } catch (_) {}
  state.wakeLock = null;
}
function setNightWatch(enabled) {
  state.nightWatch = Boolean(enabled);
  document.body.classList.toggle('night-watch', state.nightWatch);
  const button = $('flowNightButton');
  if (button) {
    button.classList.toggle('active', state.nightWatch);
    button.setAttribute('aria-pressed', state.nightWatch ? 'true' : 'false');
    button.setAttribute('aria-label', state.nightWatch ? copy('Disattiva Night Watch', 'Disable Night Watch') : copy('Attiva Night Watch', 'Enable Night Watch'));
  }
  if (state.nightWatch) requestWakeLock(); else releaseWakeLock();
  setTimeout(buildScene, 80);
}
async function fetchJson(url, timeout = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
async function lcd(path) {
  let lastError;
  for (const base of LCD_ENDPOINTS) {
    try { return await fetchJson(base + path, 7000); }
    catch (error) { lastError = error; }
  }
  throw lastError || new Error('LCD unavailable');
}
function readWallets() {
  let wallets = [];
  try { wallets = JSON.parse(localStorage.getItem(SAVED_WALLETS_KEY) || '[]'); } catch (_) { wallets = []; }
  wallets = Array.isArray(wallets) ? wallets : [];
  const seen = new Set();
  const normalized = wallets
    .map((item, index) => {
      const address = String(item?.address || '').trim().toLowerCase();
      const label = String(item?.label || item?.name || `Wallet ${index + 1}`).trim().slice(0, 28) || `Wallet ${index + 1}`;
      return { address, label, index };
    })
    .filter((item) => item.address && item.address.startsWith('inj1') && !seen.has(item.address) && seen.add(item.address))
    .slice(0, 5);
  state.wallets = normalized;
  try { state.activeAddress = String(localStorage.getItem(ACTIVE_WALLET_KEY) || '').trim().toLowerCase(); }
  catch (_) { state.activeAddress = ''; }
  if (!state.activeAddress && normalized[0]?.address) state.activeAddress = normalized[0].address;
}
function findInj(coins = []) {
  if (!Array.isArray(coins)) return 0;
  const coin = coins.find((item) => item?.denom === 'inj');
  return coin ? fromWei(coin.amount) : 0;
}
function delegationTotal(data) {
  return (data?.delegation_responses || []).reduce((sum, row) => sum + fromWei(row?.balance?.amount), 0);
}
function rewardTotal(data) {
  return (data?.total || []).filter((coin) => coin?.denom === 'inj').reduce((sum, coin) => sum + fromWei(coin.amount), 0);
}
async function loadApr() {
  try {
    const data = await fetchJson(OFFICIAL_APR_ENDPOINT, 7000);
    const candidates = [data?.apr, data?.data?.apr, data?.net_apr, data?.validator_apr];
    const apr = candidates.map(number).find((v) => v > 0);
    if (apr > 0) state.apr = apr;
  } catch (_) {}
}
async function loadFx() {
  try {
    const data = await fetchJson('https://api.exchangerate.host/latest?base=USD&symbols=EUR', 7000);
    const rate = number(data?.rates?.EUR);
    if (rate > 0) state.eurRate = rate;
  } catch (_) {}
}
async function loadPrice() {
  try {
    const ticker = await fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT', 7000);
    const price = number(ticker?.lastPrice || ticker?.price);
    const pct = number(ticker?.priceChangePercent);
    if (price > 0) {
      state.lastPrice = state.price || price;
      state.price = price;
      state.priceChange24h = pct;
      updateMarketMood(state.price - state.lastPrice, pct);
      renderTotals();
    }
  } catch (_) {}
}
function connectPriceSocket() {
  try { if (state.socket) state.socket.close(); } catch (_) {}
  clearTimeout(state.socketTimer);
  try {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/injusdt@miniTicker');
    state.socket = ws;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const next = number(data?.c);
        const pct = number(data?.P);
        if (next > 0) {
          const previous = state.price || next;
          state.lastPrice = previous;
          state.price = next;
          if (Number.isFinite(pct)) state.priceChange24h = pct;
          updateMarketMood(next - previous, state.priceChange24h);
          renderTotals();
        }
      } catch (_) {}
    };
    const rearm = () => {
      clearTimeout(state.socketTimer);
      state.socketTimer = setTimeout(connectPriceSocket, 2200);
    };
    ws.onerror = rearm;
    ws.onclose = rearm;
  } catch (_) {
    clearTimeout(state.socketTimer);
    state.socketTimer = setTimeout(connectPriceSocket, 3500);
  }
}
function updateMarketMood(tickDelta = 0, pct = state.priceChange24h) {
  const body = document.body;
  const biasNode = $('flowBias');
  const pill = $('flowMarketStatus');
  const isUp = pct > 0.05 || tickDelta > 0;
  const isDown = pct < -0.05 || tickDelta < 0;
  body.dataset.market = isUp ? 'up' : isDown ? 'down' : 'flat';
  const status = isUp
    ? copy(`INJ +${pct.toFixed(2)}%`, `INJ +${pct.toFixed(2)}%`)
    : isDown
      ? copy(`INJ ${pct.toFixed(2)}%`, `INJ ${pct.toFixed(2)}%`)
      : copy('INJ stabile', 'INJ stable');
  if (pill) pill.textContent = status;
  if (biasNode) {
    biasNode.textContent = isUp ? copy('Rialzista', 'Bullish') : isDown ? copy('Ribassista', 'Bearish') : copy('Neutro', 'Neutral');
    biasNode.style.color = isUp ? 'var(--up)' : isDown ? 'var(--down)' : '';
  }
}
async function fetchWalletSnapshot(wallet) {
  const address = wallet.address;
  const [delegations, rewards, balances] = await Promise.all([
    lcd(`/cosmos/staking/v1beta1/delegations/${address}`),
    lcd(`/cosmos/distribution/v1beta1/delegators/${address}/rewards`),
    lcd(`/cosmos/bank/v1beta1/balances/${address}`)
  ]);
  const staked = delegationTotal(delegations);
  const reward = rewardTotal(rewards);
  const available = findInj(balances?.balances || balances?.result || []);
  const daily = state.apr > 0 ? staked * (state.apr / 100) / 365.25 : 0;
  return {
    ...wallet,
    staked, reward, available, daily,
    total: staked + reward + available,
    synced: true
  };
}
async function syncWallets(force = false) {
  if (state.syncInFlight && !force) return;
  state.syncInFlight = true;
  readWallets();
  if (!state.wallets.length) {
    state.rows = [];
    renderAll();
    state.syncInFlight = false;
    return;
  }
  try {
    await Promise.all([loadApr(), loadPrice()]);
    const rows = await Promise.all(state.wallets.map(async (wallet) => {
      try { return await fetchWalletSnapshot(wallet); }
      catch (_) {
        return {
          ...wallet,
          staked: 0, reward: 0, available: 0, daily: 0, total: 0,
          synced: false
        };
      }
    }));
    const claims = detectClaims(state.rows, rows);
    state.rows = rows;
    state.lastSync = Date.now();
    renderAll();
    if (claims.length) setTimeout(() => claims.forEach((event, index) => setTimeout(() => triggerClaimAnimation(event), index * 280)), 120);
  } finally {
    state.syncInFlight = false;
  }
}
function aggregate() {
  const totals = state.rows.reduce((acc, row) => {
    acc.staked += number(row.staked);
    acc.reward += number(row.reward);
    acc.available += number(row.available);
    acc.daily += number(row.daily);
    acc.total += number(row.total);
    return acc;
  }, { staked: 0, reward: 0, available: 0, daily: 0, total: 0 });
  totals.engineLoad = Math.max(12, Math.min(100, totals.total > 0 ? ((totals.staked + totals.reward * 2) / totals.total) * 100 : 18));
  return totals;
}
function updateHeaderCopy() {
  setText('flowBrandSubline', copy('Capitale in movimento · reward in tempo reale', 'Capital in motion · real-time rewards'));
  setText('flowSceneTitle', copy('Rete attiva', 'Active network'));
  setText('flowSceneMeta', copy('I nodi wallet alimentano il nucleo e i reward scorrono verso il collettore.', 'Wallet nodes feed the core and rewards stream into the collector.'));
}
function renderTotals() {
  updateHeaderCopy();
  const totals = aggregate();
  setText('flowTotalInj', `${formatCompactInj(totals.total, 2)} INJ`);
  setText('flowTotalFiat', fiatFromInj(totals.total));
  setText('flowDailyReward', `${formatInj(totals.daily, 4)} INJ / ${copy('giorno', 'day')}`);
  setText('flowDailyRewardFiat', fiatFromInj(totals.daily));
  setText('flowRewardTotal', `${formatInj(totals.reward, 6)} INJ`);
  setText('flowVelocity', `${formatInj(totals.daily / 24, 5)} INJ / h`);
  setText('flowStaked', `${formatInj(totals.staked, 4)} INJ`);
  setText('flowAvailable', `${formatInj(totals.available, 4)} INJ`);
  setText('flowRewardPanel', `${formatInj(totals.reward, 6)} INJ`);
  setText('flowStakedFiat', fiatFromInj(totals.staked));
  setText('flowAvailableFiat', fiatFromInj(totals.available));
  setText('flowRewardPanelFiat', fiatFromInj(totals.reward));
  setText('flowCoreValue', `${formatCompactInj(totals.staked, 2)} INJ`);
  setText('flowCoreSubValue', copy('Capitale in staking', 'Capital staked'));
  const milestone = nextRewardMilestone(totals.daily);
  setText('flowCoreMilestone', `${copy('NEXT', 'NEXT')} ${formatCompactInj(milestone.target, milestone.target < 0.1 ? 3 : 2)} INJ/D · ${milestone.progress.toFixed(0)}%`);
  const coreProgress = $('flowCoreProgress');
  if (coreProgress) coreProgress.style.setProperty('--milestone-progress', `${milestone.progress.toFixed(2)}%`);
  setText('flowRewardOrbitValue', `${formatInj(totals.reward, 4)} INJ`);
  setText('flowRewardOrbitFiat', fiatFromInj(totals.reward));
  setText('flowWalletCount', `${state.rows.length} ${copy(state.rows.length === 1 ? 'wallet' : 'wallet', state.rows.length === 1 ? 'wallet' : 'wallets')}`);
  setText('flowApr', state.apr > 0 ? `APR ${state.apr.toFixed(2)}%` : 'APR —');
  setText('flowPrice', state.price > 0 ? `INJ ${state.currency === 'EUR' ? '€' + formatCompactInj(state.price * state.eurRate, state.price < 10 ? 4 : 3) : '$' + formatCompactInj(state.price, state.price < 10 ? 4 : 3)}` : 'INJ $—');
  const active = state.rows.find((row) => row.address === state.activeAddress) || state.rows[0];
  setText('flowActiveWallet', active?.label || '—');
  setText('flowActiveWalletHint', active ? shortAddress(active.address) : copy('Nessun wallet selezionato', 'No selected wallet'));
  setText('flowPulse', totals.daily > 0 ? `${formatInj(totals.daily / Math.max(1, state.rows.length), 5)} INJ` : '—');
  setText('flowEngineLoad', `${totals.engineLoad.toFixed(0)}%`);
  const engineFill = $('flowEngineFill');
  if (engineFill) engineFill.style.width = `${totals.engineLoad.toFixed(0)}%`;
  setText('flowUpdatedAt', state.lastSync ? copy(`Sync ${new Date(state.lastSync).toLocaleTimeString(lang() === 'en' ? 'en-US' : 'it-IT', {hour: '2-digit', minute: '2-digit', second:'2-digit'})}`, `Sync ${new Date(state.lastSync).toLocaleTimeString(lang() === 'en' ? 'en-US' : 'it-IT', {hour: '2-digit', minute: '2-digit', second:'2-digit'})}`) : copy('In attesa di sincronizzazione…', 'Waiting for sync…'));
}
function ensureNode(id, html, host) {
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div');
    node.id = id;
    node.innerHTML = html;
    host.appendChild(node);
  }
  return node;
}
function walletPositions(count) {
  const desktop = window.innerWidth > 640;
  const cx = 500;
  const cy = desktop ? 380 : 405;
  const radiusX = desktop ? 310 : 210;
  const radiusY = desktop ? 195 : 220;
  const start = -Math.PI * 0.95;
  const end = Math.PI * 0.1;
  if (count <= 1) {
    return [{ x: cx - (desktop ? 0 : 0), y: cy + radiusY * 0.9 }];
  }
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const angle = start + (end - start) * t;
    return {
      x: cx + Math.cos(angle) * radiusX,
      y: cy + Math.sin(angle) * radiusY
    };
  });
}
function createPathElement(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}
function buildScene() {
  const walletLayer = $('flowWalletLayer');
  const walletList = $('flowWalletList');
  const pathsHost = $('flowPaths');
  const particlesHost = $('flowParticles');
  const claimHost = $('flowClaimParticles');
  if (!walletLayer || !walletList || !pathsHost || !particlesHost || !claimHost) return;

  walletLayer.innerHTML = '';
  walletList.innerHTML = '';
  pathsHost.innerHTML = '';
  particlesHost.innerHTML = '';
  claimHost.innerHTML = '';
  state.particles = [];
  state.claimBursts = [];
  state.nodePositions = new Map();
  state.pathsReady = false;

  if (!state.rows.length) {
    walletList.innerHTML = `<div class="flow-empty">${copy('Salva almeno un wallet in Home per attivare INJ Flow.', 'Save at least one wallet from Home to activate INJ Flow.')}</div>`;
    setText('flowSceneTitle', copy('In attesa di wallet', 'Waiting for wallets'));
    setText('flowSceneMeta', copy('Aggiungi o seleziona un wallet e qui vedrai il flusso live del capitale.', 'Add or select a wallet and you will see the live capital flow here.'));
    return;
  }

  const positions = walletPositions(state.rows.length);
  const totalDaily = Math.max(1e-9, state.rows.reduce((sum, row) => sum + Math.max(0, number(row.daily)), 0));
  const rewardAnchor = { x: 500, y: 104 };
  const coreAnchor = { x: 500, y: 380 };

  const coreLink = createPathElement('path', {
    d: `M ${coreAnchor.x} ${coreAnchor.y - 116} C ${coreAnchor.x} ${coreAnchor.y - 210}, ${rewardAnchor.x} ${rewardAnchor.y + 164}, ${rewardAnchor.x} ${rewardAnchor.y + 84}`,
    class: 'flow-link-core'
  });
  pathsHost.appendChild(coreLink);

  state.rows.forEach((row, index) => {
    const pos = positions[index] || positions[0];
    state.nodePositions.set(row.address, pos);
    const active = row.address === state.activeAddress;
    const node = document.createElement('article');
    node.className = `flow-wallet-node${active ? ' active' : ''}`;
    node.style.left = `${(pos.x / 1000) * 100}%`;
    node.style.top = `${(pos.y / 700) * 100}%`;
    node.innerHTML = `
      <div class="flow-wallet-node-header">
        <div class="flow-wallet-node-index">${String(index + 1).padStart(2, '0')}</div>
        <div class="flow-wallet-node-title">
          <strong>${escapeHtml(row.label)}</strong>
          <small>${shortAddress(row.address)}</small>
        </div>
      </div>
      <div class="flow-wallet-node-metrics">
        <div><span>STAKE</span><b>${formatCompactInj(row.staked, 2)} INJ</b></div>
        <div><span>REWARD</span><b>${formatInj(row.reward, 4)} INJ</b></div>
      </div>`;
    walletLayer.appendChild(node);

    const card = document.createElement('article');
    card.className = `flow-wallet-item${active ? ' active' : ''}`;
    card.innerHTML = `
      <div class="flow-wallet-item-head">
        <div>
          <strong>${escapeHtml(row.label)}</strong>
          <small>${shortAddress(row.address)}</small>
        </div>
        <small>${row.synced ? copy('ON-CHAIN', 'ON-CHAIN') : copy('OFFLINE', 'OFFLINE')}</small>
      </div>
      <div class="flow-wallet-item-grid">
        <div><span>Staking</span><b>${formatCompactInj(row.staked, 2)} INJ</b></div>
        <div><span>Disponibile</span><b>${formatInj(row.available, 4)} INJ</b></div>
        <div><span>Reward</span><b>${formatInj(row.reward, 6)} INJ</b></div>
        <div><span>Produzione 24H</span><b>${formatInj(row.daily, 5)} INJ</b></div>
      </div>`;
    walletList.appendChild(card);

    const startX = pos.x;
    const startY = pos.y;
    const bendX = pos.x < coreAnchor.x ? startX + 110 : startX - 110;
    const bendY = (startY + coreAnchor.y) / 2 - 28;
    const d = `M ${startX} ${startY} C ${bendX} ${bendY}, ${coreAnchor.x + (startX < coreAnchor.x ? -108 : 108)} ${coreAnchor.y + 55}, ${coreAnchor.x} ${coreAnchor.y}`;
    const base = createPathElement('path', { d, class: 'flow-path-base' });
    const glow = createPathElement('path', { d, class: 'flow-path-glow' });
    pathsHost.appendChild(base);
    pathsHost.appendChild(glow);

    const particleCount = Math.max(2, Math.min(5, Math.round((row.daily / totalDaily) * 8) || 2));
    for (let i = 0; i < particleCount; i += 1) {
      const dot = createPathElement('circle', { r: 7.2, class: 'flow-particle' });
      const trail = createPathElement('circle', { r: 2.1, class: 'flow-particle-trail' });
      particlesHost.appendChild(trail);
      particlesHost.appendChild(dot);
      state.particles.push({
        path: glow,
        node: dot,
        trail,
        phase: Math.random(),
        speed: 0.04 + ((row.daily / totalDaily) * 0.12),
        loop: 0.78 + Math.random() * 0.25,
        delay: Math.random() * 0.55
      });
    }
  });
  state.pathsReady = true;
}
function triggerClaimAnimation(event) {
  const host = $('flowClaimParticles');
  if (!host || !event || !(event.amount > 0)) return;
  const pos = state.nodePositions.get(event.address) || { x: 500, y: 560 };
  const start = { x: 500, y: 104 };
  const controlY = Math.max(150, (start.y + pos.y) * 0.5);
  const d = `M ${start.x} ${start.y} C ${start.x + (pos.x < 500 ? -120 : 120)} ${controlY}, ${pos.x + (pos.x < 500 ? 90 : -90)} ${controlY}, ${pos.x} ${pos.y}`;
  const path = createPathElement('path', { d, class: 'flow-claim-path' });
  host.appendChild(path);
  const particles = Array.from({ length: 7 }, (_, index) => {
    const node = createPathElement('circle', { r: index === 0 ? 9 : 6.2, class: 'flow-claim-particle' });
    host.appendChild(node);
    return { node, delay: index * 95 };
  });
  state.claimBursts.push({ path, particles, startedAt: performance.now(), duration: 1500, event });
  const toast = $('flowClaimToast');
  if (toast) {
    setText('flowClaimValue', `+${formatInj(event.amount, 5)} INJ`);
    setText('flowClaimWallet', `${event.label || shortAddress(event.address)} · ${copy('Reward → Disponibile', 'Reward → Available')}`);
    toast.classList.remove('active');
    requestAnimationFrame(() => toast.classList.add('active'));
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('active'), 3200);
  }
  const orbit = $('flowRewardOrbit');
  orbit?.classList.add('claiming');
  setTimeout(() => orbit?.classList.remove('claiming'), 1800);
}
function animateClaimBursts(timestamp) {
  if (!state.claimBursts.length) return;
  state.claimBursts = state.claimBursts.filter((burst) => {
    const length = burst.path.getTotalLength();
    let alive = false;
    burst.particles.forEach((particle) => {
      const local = (timestamp - burst.startedAt - particle.delay) / burst.duration;
      if (local < 0) { particle.node.style.opacity = '0'; alive = true; return; }
      if (local >= 1) { particle.node.style.opacity = '0'; return; }
      alive = true;
      const eased = 1 - Math.pow(1 - local, 3);
      const point = burst.path.getPointAtLength(length * eased);
      particle.node.setAttribute('cx', point.x);
      particle.node.setAttribute('cy', point.y);
      particle.node.style.opacity = String(Math.min(1, local * 5, (1 - local) * 6));
    });
    if (!alive) {
      burst.particles.forEach((particle) => particle.node.remove());
      burst.path.remove();
    }
    return alive;
  });
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
}
function animateScene(timestamp = 0) {
  state.animationFrame = requestAnimationFrame(animateScene);
  animateClaimBursts(timestamp);
  if (!state.pathsReady || !state.particles.length) return;
  const time = timestamp / 1000;
  state.particles.forEach((particle) => {
    const path = particle.path;
    const length = path.getTotalLength();
    let progress = ((time * particle.speed) + particle.phase - particle.delay);
    progress = ((progress % particle.loop) + particle.loop) % particle.loop;
    const ratio = Math.min(1, progress / particle.loop);
    const eased = ratio < 0.12 ? 0 : ratio;
    const point = path.getPointAtLength(length * eased);
    const previous = path.getPointAtLength(Math.max(0, length * Math.max(0, eased - 0.025)));
    particle.node.setAttribute('cx', point.x);
    particle.node.setAttribute('cy', point.y);
    particle.trail.setAttribute('cx', previous.x);
    particle.trail.setAttribute('cy', previous.y);
    particle.node.style.opacity = ratio < 0.1 ? '0' : '0.95';
    particle.trail.style.opacity = ratio < 0.1 ? '0' : '0.45';
  });
}
function renderAll() {
  renderTotals();
  buildScene();
}
function scheduleTimers() {
  clearInterval(state.refreshTimer);
  clearInterval(state.pricePollTimer);
  clearInterval(state.fxPollTimer);
  state.refreshTimer = setInterval(() => { syncWallets(); }, REFRESH_MS);
  state.pricePollTimer = setInterval(() => { loadPrice(); }, PRICE_POLL_MS);
  state.fxPollTimer = setInterval(() => { loadFx(); renderTotals(); }, FX_POLL_MS);
}
function initEvents() {
  $('flowRefreshButton')?.addEventListener('click', () => syncWallets(true));
  $('flowNightButton')?.addEventListener('click', () => setNightWatch(!state.nightWatch));
  $('flowNightExit')?.addEventListener('click', () => setNightWatch(false));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.nightWatch) setNightWatch(false); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (state.nightWatch) requestWakeLock();
      loadPrice();
      syncWallets(true);
    }
  });
  window.addEventListener('resize', debounce(() => {
    buildScene();
  }, 120), { passive: true });
  window.addEventListener('beforeunload', () => releaseWakeLock(), { once: true });
  window.addEventListener('storage', (event) => {
    if ([SAVED_WALLETS_KEY, ACTIVE_WALLET_KEY, 'inj_monitor_theme', 'inj_monitor_currency', 'inj_node_language_v1'].includes(event.key)) {
      state.currency = readCurrency();
      if (event.key === 'inj_monitor_theme') {
        try {
          const savedTheme = localStorage.getItem('inj_monitor_theme');
          document.documentElement.dataset.theme = ['navy', 'black', 'light', 'amber'].includes(savedTheme) ? savedTheme : 'navy';
        } catch (_) {}
      }
      syncWallets(true);
    }
  });
}
function readCurrency() {
  try {
    const value = String(localStorage.getItem('inj_monitor_currency') || 'USD').toUpperCase();
    return value === 'EUR' ? 'EUR' : 'USD';
  } catch (_) {
    return 'USD';
  }
}
function debounce(fn, wait = 120) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
async function boot() {
  state.currency = readCurrency();
  await Promise.all([loadFx(), loadApr(), loadPrice()]);
  connectPriceSocket();
  initEvents();
  scheduleTimers();
  syncWallets(true);
  if (!state.animationFrame) animateScene();
}

boot();
