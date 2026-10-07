'use strict';

const $ = (id) => document.getElementById(id);
const INJ_DECIMALS = 1e18;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const REWARD_REFRESH_MS = 2600;
const STATUS_REFRESH_MS = 8500;
const APR_REFRESH_MS = 120000;
const MARKET_REFRESH_MS = 60000;
const CLAIM_EPSILON = 2e-8;
const PARTICLE_QUANTUM_INJ = 0.000005;
const PARTICLE_ENGINE_MS = 120;
const OFFICIAL_APR_ENDPOINT = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
const LCD_ENDPOINTS = [
  'https://sentry.lcd.injective.network:443',
  'https://lcd.injective.network',
  'https://1rpc.io/inj-lcd'
];
const validatorCommissionCache = new Map();

const state = {
  wallets: [],
  networkApr: 0,
  price: 0,
  change24h: 0,
  eurRate: 0.86,
  currency: 'USD',
  lastSync: 0,
  socket: null,
  reconnectTimer: 0,
  statusLoading: false,
  rewardLoading: false,
  selectedAddress: '',
  selectedLoading: false,
  claimTimer: 0,
  fastLoading: false,
  aprLoading: false,
  fastCompleted: 0,
  fastTotal: 0,
  particleTimer: 0
};

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
function fromWei(value) {
  const raw = String(value ?? '0').trim();
  if (!/^-?\d+$/.test(raw)) return number(value) / INJ_DECIMALS;
  const neg = raw.startsWith('-');
  const digits = neg ? raw.slice(1) : raw;
  const padded = digits.padStart(19, '0');
  const whole = padded.slice(0, -18) || '0';
  const frac = padded.slice(-18, -6); // 12 decimals are ample for UI without unsafe integer conversion
  const out = Number(whole) + Number(frac || '0') / 1e12;
  return neg ? -out : out;
}
const lang = () => { try { return localStorage.getItem('inj_node_language_v1') === 'en' ? 'en' : 'it'; } catch (_) { return 'it'; } };
const locale = () => lang() === 'en' ? 'en-US' : 'it-IT';
const copy = (it, en) => lang() === 'en' ? en : it;
const validAddress = (value) => /^inj1[0-9a-z]{20,80}$/i.test(String(value || '').trim());
const shortAddress = (address) => address ? `${address.slice(0,10)}…${address.slice(-6)}` : '—';

function formatInj(value, digits = 2) {
  return number(value).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: true });
}
function formatReward(value, digits = 6) {
  return number(value).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: true });
}
function smartMoney(usd) {
  const base = Math.max(0, number(usd));
  const currency = state.currency === 'EUR' ? 'EUR' : 'USD';
  const value = currency === 'EUR' ? base * Math.max(0, number(state.eurRate)) : base;
  const digits = Math.abs(value) >= 1 ? 2 : 4;
  return value.toLocaleString(locale(), { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fiatFromInj(inj) {
  return state.price > 0 ? smartMoney(number(inj) * state.price) : '—';
}
function findInj(coins = []) {
  const coin = (Array.isArray(coins) ? coins : []).find((item) => item?.denom === 'inj');
  return coin ? fromWei(coin.amount) : 0;
}
function rewardTotal(data) {
  return (data?.total || []).filter((coin) => coin?.denom === 'inj').reduce((sum, coin) => sum + fromWei(coin.amount), 0);
}
function delegationRows(data) {
  return (data?.delegation_responses || []).map((row) => ({
    validator: String(row?.delegation?.validator_address || ''),
    amount: fromWei(row?.balance?.amount)
  })).filter((row) => row.validator && row.amount > 0);
}
function aprPercent(value) {
  const n = number(value);
  return n <= 0 ? 0 : (n <= 1 ? n * 100 : n);
}

async function fetchJson(url, timeout = 4200) {
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
    try {
      return await fetchJson(base + path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Injective unavailable');
}

function readCachedSummaries() {
  try {
    const cached = JSON.parse(localStorage.getItem('inj_monitor_summaries_v1') || '{}');
    return cached && typeof cached === 'object' ? cached : {};
  } catch (_) {
    return {};
  }
}
function persistSnapshots() {
  try {
    const cached = readCachedSummaries();
    for (const row of state.wallets) {
      cached[row.address] = {
        ...(cached[row.address] || {}),
        available: Math.max(0, number(row.available)),
        staked: Math.max(0, number(row.staked)),
        rewards: Math.max(0, number(row.confirmedReward)),
        total: Math.max(0, number(row.available)) + Math.max(0, number(row.staked)) + Math.max(0, number(row.confirmedReward)),
        personalApr: Math.max(0, number(row.apr)),
        updated: Math.max(0, number(row.lastNetworkAt)) || Date.now()
      };
    }
    localStorage.setItem('inj_monitor_summaries_v1', JSON.stringify(cached));
  } catch (_) {}
}
function readWallets() {
  const rows = [];
  const seen = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem('inj_monitor_wallets_v1') || '[]');
    for (const item of Array.isArray(saved) ? saved : []) {
      const address = String(item?.address || '').trim().toLowerCase();
      if (!validAddress(address) || seen.has(address)) continue;
      seen.add(address);
      rows.push({ address, label: String(item?.label || '').trim().slice(0, 28) || `Wallet ${rows.length + 1}` });
    }
  } catch (_) {}
  if (!rows.length) {
    try {
      const address = String(localStorage.getItem('inj_monitor_address') || '').trim().toLowerCase();
      if (validAddress(address)) rows.push({ address, label: 'Wallet 1' });
    } catch (_) {}
  }

  const cached = readCachedSummaries();
  state.wallets = rows.map((wallet, index) => {
    const snap = cached[wallet.address] || {};
    const reward = Math.max(0, number(snap.rewards));
    const staked = Math.max(0, number(snap.staked));
    const available = Math.max(0, number(snap.available));
    const apr = Math.max(0, number(snap.personalApr));
    return {
      ...wallet,
      index,
      staked,
      available,
      confirmedReward: reward,
      lastNetworkAt: number(snap.updated) || 0,
      apr,
      aprSource: apr > 0 ? 'cache' : 'none',
      ratePerMs: staked > 0 && apr > 0 ? staked * apr / 100 / YEAR_MS : 0,
      validatorCount: Array.isArray(snap.validators) ? snap.validators.length : 0,
      online: false,
      synced: Boolean(snap.updated),
      networkFresh: false
    };
  });

  let preferred = '';
  try { preferred = String(localStorage.getItem('inj_monitor_address') || '').trim().toLowerCase(); } catch (_) {}
  state.selectedAddress = state.wallets.some((row) => row.address === preferred) ? preferred : (state.wallets[0]?.address || '');
}

async function loadNetworkApr() {
  try {
    const data = await fetchJson(OFFICIAL_APR_ENDPOINT, 6500);
    const next = aprPercent(data?.apr);
    if (next > 0) state.networkApr = next;
  } catch (_) {}
  return state.networkApr;
}
async function validatorCommissionPercent(address) {
  const cached = validatorCommissionCache.get(address);
  const now = Date.now();
  if (cached && now - cached.at < 120000) return cached.value;
  const data = await lcd(`/cosmos/staking/v1beta1/validators/${address}`);
  const raw = number(data?.validator?.commission?.commission_rates?.rate);
  if (raw < 0 || !Number.isFinite(raw)) throw new Error('commission');
  const value = Math.min(100, raw <= 1 ? raw * 100 : raw);
  validatorCommissionCache.set(address, { value, at: now });
  return value;
}
async function effectiveApr(rows) {
  if (!rows.length) return { value: 0, source: 'none' };
  const networkApr = state.networkApr > 0 ? state.networkApr : await loadNetworkApr();
  if (!(networkApr > 0)) return { value: 0, source: 'none' };
  try {
    const details = await Promise.all(rows.map(async (row) => ({ ...row, commission: await validatorCommissionPercent(row.validator) })));
    const total = details.reduce((sum, row) => sum + row.amount, 0);
    if (!(total > 0)) return { value: 0, source: 'none' };
    const value = details.reduce((sum, row) => sum + row.amount * networkApr * Math.max(0, 1 - row.commission / 100), 0) / total;
    return { value, source: 'validator' };
  } catch (_) {
    return { value: networkApr, source: 'network' };
  }
}

function applyBaseSnapshot(row, bank, delegations, rewards, detectClaim = true) {
  const delegationList = delegationRows(delegations);
  const nextReward = Math.max(0, rewardTotal(rewards));
  const previousReward = Math.max(0, number(row.confirmedReward));
  row.available = Math.max(0, findInj(bank?.balances || []));
  row.staked = delegationList.reduce((sum, item) => sum + item.amount, 0);
  row.confirmedReward = nextReward;
  row.validatorCount = delegationList.length;
  row.validatorRows = delegationList;
  row.lastNetworkAt = Date.now();
  row.online = true;
  row.synced = true;
  row.networkFresh = true;
  if (detectClaim && previousReward > 0 && nextReward + CLAIM_EPSILON < previousReward) triggerClaim(row, previousReward, nextReward);
  return delegationList;
}

async function fetchBaseSnapshot(row, detectClaim = true) {
  const [bank, delegations, rewards] = await Promise.all([
    lcd(`/cosmos/bank/v1beta1/balances/${row.address}`),
    lcd(`/cosmos/staking/v1beta1/delegations/${row.address}`),
    lcd(`/cosmos/distribution/v1beta1/delegators/${row.address}/rewards`)
  ]);
  return applyBaseSnapshot(row, bank, delegations, rewards, detectClaim);
}

function updateFastProgress() {
  const done = state.wallets.filter((row) => row.networkFresh).length;
  state.fastCompleted = done;
  state.fastTotal = state.wallets.length;
  const count = $('flowWalletCount');
  const updated = $('flowUpdated');
  const kicker = $('flowCoreKicker');
  const liveText = $('flowLiveText');
  if (count) count.textContent = `${done}/${state.fastTotal} LIVE`;
  if (updated && done < state.fastTotal) updated.textContent = `${copy('Saldi on-chain','On-chain balances')} ${done}/${state.fastTotal}`;
  if (kicker) kicker.textContent = done >= state.fastTotal && state.fastTotal > 0 ? 'TOTAL ON-CHAIN' : `SYNC ON-CHAIN ${done}/${state.fastTotal}`;
  if (liveText) liveText.textContent = done >= state.fastTotal && state.fastTotal > 0 ? 'LIVE' : `SYNC ${done}/${state.fastTotal}`;
}

async function syncAprForRow(row) {
  const rows = Array.isArray(row.validatorRows) ? row.validatorRows : [];
  if (!rows.length) {
    row.apr = 0;
    row.aprSource = 'none';
    row.ratePerMs = 0;
    return;
  }
  const aprInfo = await effectiveApr(rows);
  if (aprInfo.value > 0) {
    row.apr = aprInfo.value;
    row.aprSource = aprInfo.source;
    row.ratePerMs = row.staked > 0 ? row.staked * row.apr / 100 / YEAR_MS : 0;
  }
}

async function syncAprBackground() {
  if (state.aprLoading || !state.wallets.length || navigator.onLine === false) return;
  state.aprLoading = true;
  try {
    await loadNetworkApr();
    await Promise.allSettled(state.wallets.map((row) => syncAprForRow(row)));
    persistSnapshots();
    refreshFlowDynamics();
  } finally {
    state.aprLoading = false;
  }
}

async function syncAllFast() {
  if (state.fastLoading || !state.wallets.length || navigator.onLine === false) return;
  state.fastLoading = true;
  state.fastTotal = state.wallets.length;
  $('flowLiveBadge')?.classList.add('sync');
  updateFastProgress();
  const tasks = state.wallets.map(async (row) => {
    try {
      await fetchBaseSnapshot(row, true);
      renderNode(row);
      updateFastProgress();
      render();
    } catch (_) {
      row.online = false;
      row.networkFresh = false;
      updateFastProgress();
    }
  });
  await Promise.allSettled(tasks);
  state.lastSync = Date.now();
  persistSnapshots();
  refreshFlowDynamics();
  state.fastLoading = false;
  $('flowLiveBadge')?.classList.remove('sync');
  if (state.wallets.some((row) => !row.networkFresh)) $('flowLiveBadge')?.classList.add('error');
  else $('flowLiveBadge')?.classList.remove('error');
  render();
  void syncAprBackground();
}

function totals() {
  return state.wallets.reduce((acc, row) => {
    const reward = Math.max(0, number(row.confirmedReward));
    acc.staked += Math.max(0, number(row.staked));
    acc.available += Math.max(0, number(row.available));
    acc.reward += reward;
    acc.daily += Math.max(0, number(row.ratePerMs)) * 86400000;
    if (row.staked > 0 && row.apr > 0) acc.aprNumerator += row.staked * row.apr;
    return acc;
  }, { staked: 0, available: 0, reward: 0, daily: 0, aprNumerator: 0 });
}
function selectedWallet() {
  return state.wallets.find((row) => row.address === state.selectedAddress) || null;
}
function nodeAngle(index, count) {
  if (count <= 1) return -90;
  return -90 + (360 / count) * index;
}
function particleSpeed(row, maxDaily) {
  const daily = Math.max(0, row.ratePerMs) * 86400000;
  const ratio = maxDaily > 0 ? daily / maxDaily : 0;
  return Math.max(1.8, 4.6 - ratio * 2.35);
}

const FLOW_TIERS = [
  { key:'low', label:'LOW', min:0, max:0.025, color:'#8ad7ff', travel:4.6 },
  { key:'normal', label:'NORMAL', min:0.025, max:0.075, color:'#22d3ee', travel:3.9 },
  { key:'high', label:'HIGH', min:0.075, max:0.150, color:'#a78bfa', travel:3.15 },
  { key:'very-high', label:'VERY HIGH', min:0.150, max:0.300, color:'#ffb347', travel:2.5 },
  { key:'extreme', label:'EXTREME', min:0.300, max:Infinity, color:'#ffe8a3', travel:1.9 }
];
function dailyProduction(row) { return Math.max(0, number(row?.ratePerMs)) * 86400000; }
function productionTier(dailyValue) {
  const daily = Math.max(0, number(dailyValue));
  return FLOW_TIERS.find((tier) => daily < tier.max) || FLOW_TIERS[FLOW_TIERS.length - 1];
}
function particleIntervalMs(dailyValue) {
  const daily = Math.max(0, number(dailyValue));
  return daily > 0 ? (PARTICLE_QUANTUM_INJ * 86400000) / daily : Infinity;
}
function particleRateLabel(dailyValue) {
  const interval = particleIntervalMs(dailyValue);
  if (!Number.isFinite(interval)) return copy('Nessuna emissione', 'No emission');
  const seconds = interval / 1000;
  if (seconds < 1) return `${copy('1 particella ogni','1 particle every')} ${seconds.toFixed(2)}s`;
  if (seconds < 60) return `${copy('1 particella ogni','1 particle every')} ${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `${copy('1 particella ogni','1 particle every')} ${(seconds / 60).toFixed(1)}m`;
}
function tierMarkerPercent(dailyValue) {
  const daily = Math.max(0, number(dailyValue));
  if (daily <= 0) return 1;
  if (daily < 0.025) return Math.min(19, daily / 0.025 * 20);
  if (daily < 0.075) return 20 + (daily - 0.025) / 0.05 * 20;
  if (daily < 0.150) return 40 + (daily - 0.075) / 0.075 * 20;
  if (daily < 0.300) return 60 + (daily - 0.150) / 0.150 * 20;
  return Math.min(99, 80 + Math.min(1, (daily - 0.300) / 0.300) * 19);
}
function applyTierVisual(element, dailyValue) {
  if (!element) return productionTier(dailyValue);
  const tier = productionTier(dailyValue);
  element.dataset.tier = tier.key;
  element.style.setProperty('--flow-color', tier.color);
  element.style.setProperty('--travel', `${tier.travel}s`);
  return tier;
}
function spawnParticle(row) {
  if (!row || document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const beam = document.querySelector(`.flow-beam[data-address="${row.address}"]`);
  if (!beam || !row.online) return;
  const daily = dailyProduction(row);
  if (!(daily > 0)) return;
  const tier = applyTierVisual(beam, daily);
  const particle = document.createElement('i');
  particle.className = 'flow-particle flow-particle-live';
  particle.style.setProperty('--travel', `${tier.travel}s`);
  beam.appendChild(particle);
  const cleanup = () => particle.remove();
  particle.addEventListener('animationend', cleanup, { once:true });
  setTimeout(cleanup, (tier.travel + 1) * 1000);
}
function startParticleEngine() {
  clearInterval(state.particleTimer);
  const now = performance.now();
  state.wallets.forEach((row, index) => {
    const interval = particleIntervalMs(dailyProduction(row));
    row.nextParticleAt = Number.isFinite(interval) ? now + Math.min(interval, 900 + index * 120) : Infinity;
    row.particleInterval = interval;
  });
  state.particleTimer = setInterval(() => {
    if (document.hidden) return;
    const tick = performance.now();
    for (const row of state.wallets) {
      const daily = dailyProduction(row);
      const interval = particleIntervalMs(daily);
      if (!Number.isFinite(interval)) { row.nextParticleAt = Infinity; row.particleInterval = interval; continue; }
      const changed = !Number.isFinite(row.particleInterval) || Math.abs(interval - row.particleInterval) / Math.max(interval, 1) > .16;
      if (changed) {
        row.particleInterval = interval;
        row.nextParticleAt = tick + Math.min(interval, 1200);
      }
      if (!Number.isFinite(row.nextParticleAt)) row.nextParticleAt = tick + interval;
      if (tick >= row.nextParticleAt) {
        spawnParticle(row);
        row.nextParticleAt = tick + interval;
      }
    }
  }, PARTICLE_ENGINE_MS);
}

function buildFlowScene() {
  const walletHost = $('flowWallets');
  const beamHost = $('flowBeams');
  if (!walletHost || !beamHost) return;
  walletHost.replaceChildren();
  beamHost.replaceChildren();
  const count = state.wallets.length;
  document.body.classList.toggle('flow-dense', count > 6);
  $('flowEmpty').hidden = count > 0;
  const maxStaked = Math.max(1, ...state.wallets.map((row) => row.staked));
  const maxDaily = Math.max(1e-12, ...state.wallets.map((row) => row.ratePerMs * 86400000));

  state.wallets.forEach((row, index) => {
    const angle = nodeAngle(index, count);
    const speed = particleSpeed(row, maxDaily);
    const beam = document.createElement('div');
    beam.className = `flow-beam${row.address === state.selectedAddress ? ' selected' : ''}`;
    beam.dataset.address = row.address;
    beam.style.setProperty('--angle', `${angle}deg`);
    beam.style.setProperty('--speed', `${speed.toFixed(2)}s`);
    applyTierVisual(beam, dailyProduction(row));
    beamHost.appendChild(beam);

    const node = document.createElement('button');
    node.type = 'button';
    node.className = `flow-wallet-node${row.online ? '' : ' offline'}${row.address === state.selectedAddress ? ' selected' : ''}`;
    node.dataset.address = row.address;
    node.style.setProperty('--angle', `${angle}deg`);
    node.style.setProperty('--counter-angle', `${-angle}deg`);
    node.style.setProperty('--node-delay', `${(-index * 0.38).toFixed(2)}s`);
    node.style.setProperty('--node-pulse', String(1.012 + Math.min(0.03, row.staked / maxStaked * 0.03)));
    node.innerHTML = `
      <div class="flow-node-head"><i class="flow-node-live"></i><strong class="flow-node-name"></strong><span class="flow-tier-badge" data-node-tier>—</span><span class="flow-node-arrow">›</span></div>
      <strong class="flow-node-staked private">—</strong>
      <div class="flow-node-meta"><span>REWARD</span><b class="private" data-node-reward>—</b></div>
      <div class="flow-node-velocity"><span>FLOW</span><b class="private" data-node-daily>—</b></div>`;
    node.querySelector('.flow-node-name').textContent = row.label;
    node.title = `${row.label} · ${shortAddress(row.address)}`;
    node.addEventListener('click', () => selectWallet(row.address, true));
    walletHost.appendChild(node);
  });
  layoutOrbit();
  render(true);
}

function refreshFlowDynamics() {
  const nodes = Array.from(document.querySelectorAll('.flow-wallet-node'));
  const beams = Array.from(document.querySelectorAll('.flow-beam'));
  const current = nodes.map((node) => node.dataset.address);
  const expected = state.wallets.map((row) => row.address);
  if (current.length !== expected.length || current.some((address, index) => address !== expected[index])) {
    buildFlowScene();
    return;
  }
  const maxStaked = Math.max(1, ...state.wallets.map((row) => row.staked));
  const maxDaily = Math.max(1e-12, ...state.wallets.map((row) => row.ratePerMs * 86400000));
  state.wallets.forEach((row, index) => {
    const node = nodes[index];
    const beam = beams[index];
    node?.style.setProperty('--node-pulse', String(1.012 + Math.min(0.03, row.staked / maxStaked * 0.03)));
    node?.classList.toggle('offline', !row.online);
    node?.classList.toggle('selected', row.address === state.selectedAddress);
    beam?.style.setProperty('--speed', `${particleSpeed(row, maxDaily).toFixed(2)}s`);
    if (beam) {
      applyTierVisual(beam, dailyProduction(row));
      beam.classList.toggle('selected', row.address === state.selectedAddress);
    }
  });
  render();
}

function layoutOrbit() {
  const stage = $('flowStage');
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const mobile = window.innerWidth <= 800;
  if (mobile) {
    stage.style.setProperty('--orbit-radius', `${Math.max(104, Math.min(132, rect.width * .31))}px`);
    return;
  }
  const radius = Math.max(170, Math.min(rect.width * .36, rect.height * .34, 350) - 7);
  stage.style.setProperty('--orbit-radius', `${Math.round(radius)}px`);
}

function renderNode(row) {
  const node = document.querySelector(`.flow-wallet-node[data-address="${row.address}"]`);
  if (!node) return;
  node.classList.toggle('offline', !row.online);
  node.classList.toggle('selected', row.address === state.selectedAddress);
  const staked = node.querySelector('.flow-node-staked');
  const reward = node.querySelector('[data-node-reward]');
  const tierBadge = node.querySelector('[data-node-tier]');
  const dailyNode = node.querySelector('[data-node-daily]');
  const daily = dailyProduction(row);
  const tier = applyTierVisual(node, daily);
  if (staked) staked.textContent = `${formatInj(row.staked, row.staked >= 100 ? 1 : 2)} INJ`;
  if (reward) reward.textContent = `${formatReward(row.confirmedReward, 5)}`;
  if (tierBadge) tierBadge.textContent = tier.label;
  if (dailyNode) dailyNode.textContent = daily > 0 ? `${formatReward(daily, 5)}/g` : '—';
}

function renderDetail() {
  const panel = $('flowWalletDetail');
  const row = selectedWallet();
  if (!panel || !row) {
    if (panel) panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $('flowDetailName').textContent = row.label;
  $('flowDetailAddress').textContent = shortAddress(row.address);
  $('flowDetailAvailable').textContent = `${formatInj(row.available, 5)} INJ`;
  $('flowDetailAvailableFiat').textContent = fiatFromInj(row.available);
  $('flowDetailStaked').textContent = `${formatInj(row.staked, 5)} INJ`;
  $('flowDetailValidators').textContent = `${row.validatorCount || 0} ${row.validatorCount === 1 ? 'validator' : 'validator'}`;
  $('flowDetailReward').textContent = `${formatReward(row.confirmedReward, 7)} INJ`;
  $('flowDetailRewardFiat').textContent = fiatFromInj(row.confirmedReward);
  const total = Math.max(0, row.available) + Math.max(0, row.staked) + Math.max(0, row.confirmedReward);
  $('flowDetailTotal').textContent = `${formatInj(total, 5)} INJ`;
  $('flowDetailTotalFiat').textContent = fiatFromInj(total);
  $('flowDetailApr').textContent = row.apr > 0 ? `${row.apr.toFixed(3)}%` : '—';
  $('flowDetailAprSource').textContent = row.aprSource === 'validator'
    ? copy('APR rete netto commissioni validator', 'Network APR net of validator commissions')
    : row.aprSource === 'network'
      ? copy('APR rete · commissione non disponibile', 'Network APR · commission unavailable')
      : row.aprSource === 'cache'
        ? copy('Cache · aggiornamento APR in corso', 'Cache · APR refresh in progress')
        : copy('Dati validator', 'Validator data');
  const daily = Math.max(0, row.ratePerMs) * 86400000;
  const tier = productionTier(daily);
  $('flowDetailDaily').textContent = daily > 0 ? `${formatReward(daily, 7)} INJ` : '—';
  $('flowDetailVelocity').textContent = daily > 0 ? `${formatReward(daily, 7)} INJ / ${copy('giorno','day')}` : '—';
  $('flowDetailTier').textContent = tier.label;
  $('flowDetailVelocityMinute').textContent = daily > 0 ? `${formatReward(daily / 1440, 9)} INJ/min` : '— INJ/min';
  $('flowDetailParticleRate').textContent = `${particleRateLabel(daily)} · 1 = ${formatReward(PARTICLE_QUANTUM_INJ, 6)} INJ`;
  const velocityPanel = $('flowDetailVelocityPanel');
  if (velocityPanel) { applyTierVisual(velocityPanel, daily); velocityPanel.dataset.tier = tier.key; }
  const marker = $('flowDetailVelocityMarker');
  if (marker) marker.style.left = `${tierMarkerPercent(daily)}%`;
  $('flowDetailSync').textContent = state.selectedLoading
    ? copy('Aggiornamento rete…', 'Refreshing network…')
    : row.lastNetworkAt > 0
      ? `${copy('Rete','Network')} ${new Date(row.lastNetworkAt).toLocaleTimeString(locale(), {hour:'2-digit', minute:'2-digit', second:'2-digit'})}`
      : copy('In attesa della rete', 'Waiting for network');
  panel.classList.toggle('is-loading', state.selectedLoading);
}

function render(force = false) {
  if (!state.wallets.length) {
    $('flowWalletCount').textContent = '0';
    $('flowUpdated').textContent = copy('Nessun wallet salvato', 'No saved wallets');
    renderDetail();
    return;
  }
  const t = totals();
  const total = t.staked + t.available + t.reward;
  const ratio = total > 0 ? t.staked / total * 100 : 0;
  const weightedApr = t.staked > 0 ? t.aprNumerator / t.staked : 0;

  $('flowTotalInj').textContent = `${formatInj(total, 2)} INJ`;
  $('flowTotalFiat').textContent = fiatFromInj(total);
  $('flowDailyReward').textContent = `+${formatReward(t.daily, 6)} INJ / ${copy('giorno','day')}`;
  $('claimRewardValue').textContent = `${formatReward(t.reward, 6)} INJ`;
  $('claimAvailableValue').textContent = `${formatInj(t.available, 3)} INJ`;
  $('flowStaked').textContent = `${formatInj(t.staked, 2)} INJ`;
  $('flowStakingRatio').textContent = `${ratio.toFixed(2)}% ${copy('del totale','of total')}`;
  $('flowRewardLive').textContent = `${formatReward(t.reward, 7)} INJ`;
  $('flowRewardFiat').textContent = fiatFromInj(t.reward);
  $('flowProduction').textContent = `+${formatReward(t.daily, 6)} INJ / ${copy('giorno','day')}`;
  $('flowApr').textContent = `${copy('APR ponderato','Weighted APR')} ${weightedApr > 0 ? `${weightedApr.toFixed(3)}%` : '—'}`;
  const treasuryTier = productionTier(t.daily);
  const core = $('flowCore');
  if (core) applyTierVisual(core, t.daily);
  $('flowScaleCurrent').textContent = `${formatReward(t.daily, 6)} INJ / ${copy('giorno','day')}`;
  $('flowScaleTier').textContent = treasuryTier.label;
  const scaleTrack = $('flowScaleTrack');
  if (scaleTrack) {
    scaleTrack.dataset.activeTier = treasuryTier.key;
    scaleTrack.querySelectorAll('[data-tier]').forEach((item) => item.classList.toggle('active', item.dataset.tier === treasuryTier.key));
  }
  const freshCount = state.wallets.filter((row) => row.networkFresh).length;
  $('flowWalletCount').textContent = `${freshCount}/${state.wallets.length} LIVE`;
  $('flowUpdated').textContent = freshCount < state.wallets.length
    ? `${copy('Saldi on-chain','On-chain balances')} ${freshCount}/${state.wallets.length}`
    : state.lastSync
      ? `${copy('Aggiornato','Updated')} ${new Date(state.lastSync).toLocaleTimeString(locale(), { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`
      : copy('Sincronizzazione…','Syncing…');
  const coreKicker = $('flowCoreKicker');
  if (coreKicker) coreKicker.textContent = freshCount >= state.wallets.length ? `TREASURY FLOW · ${treasuryTier.label}` : `SYNC ON-CHAIN ${freshCount}/${state.wallets.length}`;
  const liveText = $('flowLiveText');
  if (liveText) liveText.textContent = freshCount >= state.wallets.length ? 'LIVE' : `SYNC ${freshCount}/${state.wallets.length}`;

  state.wallets.forEach(renderNode);
  renderDetail();
  updateMarketHeader();

  if (force && window.INJ_I18N?.translate) window.INJ_I18N.translate(document.body);
}

function selectWallet(address, requestNetwork = false) {
  if (!state.wallets.some((row) => row.address === address)) return;
  state.selectedAddress = address;
  document.querySelectorAll('.flow-wallet-node').forEach((node) => node.classList.toggle('selected', node.dataset.address === address));
  document.querySelectorAll('.flow-beam').forEach((beam) => beam.classList.toggle('selected', beam.dataset.address === address));
  renderDetail();
  if (requestNetwork) void syncSelectedWallet(address);
}

function triggerClaim(row, previousReward, nextReward) {
  const channel = $('claimChannel');
  if (!channel) return;
  clearTimeout(state.claimTimer);
  channel.classList.remove('claim-active');
  void channel.offsetWidth;
  channel.classList.add('claim-active');
  const amount = Math.max(0, previousReward - nextReward);
  $('claimStatus').textContent = `${copy('Claim rilevato','Claim detected')} · ${row.label} · ${formatReward(amount, 6)} INJ → ${copy('Disponibile','Available')}`;
  state.claimTimer = setTimeout(() => {
    channel.classList.remove('claim-active');
    $('claimStatus').textContent = copy('Monitoraggio claim attivo','Claim monitoring active');
  }, 4800);
}

async function syncRewards() {
  if (state.rewardLoading || state.fastLoading || !state.wallets.length || navigator.onLine === false) return;
  state.rewardLoading = true;
  $('flowLiveBadge')?.classList.add('sync');
  try {
    await Promise.allSettled(state.wallets.map(async (row) => {
      try {
        const data = await lcd(`/cosmos/distribution/v1beta1/delegators/${row.address}/rewards`);
        const next = Math.max(0, rewardTotal(data));
        const previous = Math.max(0, number(row.confirmedReward));
        if (row.synced && previous > 0 && next + CLAIM_EPSILON < previous) triggerClaim(row, previous, next);
        row.confirmedReward = next;
        row.lastNetworkAt = Date.now();
        row.online = true;
        row.networkFresh = true;
        row.synced = true;
        renderNode(row);
      } catch (_) {
        row.online = false;
      }
    }));
    state.lastSync = Date.now();
    persistSnapshots();
    $('flowLiveBadge')?.classList.remove('error');
  } finally {
    $('flowLiveBadge')?.classList.remove('sync');
    state.rewardLoading = false;
    render();
  }
}

async function syncStatus() {
  if (state.statusLoading || state.fastLoading || !state.wallets.length || navigator.onLine === false) return;
  state.statusLoading = true;
  try {
    await Promise.allSettled(state.wallets.map(async (row) => {
      try {
        const [bank, delegations] = await Promise.all([
          lcd(`/cosmos/bank/v1beta1/balances/${row.address}`),
          lcd(`/cosmos/staking/v1beta1/delegations/${row.address}`)
        ]);
        const rows = delegationRows(delegations);
        row.available = Math.max(0, findInj(bank?.balances || []));
        row.staked = rows.reduce((sum, item) => sum + item.amount, 0);
        row.validatorCount = rows.length;
        row.validatorRows = rows;
        row.lastNetworkAt = Date.now();
        row.online = true;
        row.networkFresh = true;
        row.synced = true;
        if (row.apr > 0) row.ratePerMs = row.staked * row.apr / 100 / YEAR_MS;
        renderNode(row);
      } catch (_) {
        row.online = false;
      }
    }));
    state.lastSync = Date.now();
    persistSnapshots();
    refreshFlowDynamics();
  } finally {
    state.statusLoading = false;
  }
}

async function syncSelectedWallet(address) {
  const row = state.wallets.find((item) => item.address === address);
  if (!row || state.selectedLoading || navigator.onLine === false) return;
  state.selectedLoading = true;
  renderDetail();
  try {
    const rows = await fetchBaseSnapshot(row, true);
    state.lastSync = Date.now();
    persistSnapshots();
    refreshFlowDynamics();
    render();
    // APR/commissioni non bloccano mai la visualizzazione dei saldi reali.
    void (async () => {
      try {
        if (!state.networkApr) await loadNetworkApr();
        row.validatorRows = rows;
        await syncAprForRow(row);
        persistSnapshots();
        render();
      } catch (_) {}
    })();
  } catch (_) {
    row.online = false;
    $('flowLiveBadge')?.classList.add('error');
  } finally {
    state.selectedLoading = false;
    render();
  }
}

async function loadMarket24h() {
  try {
    const data = await fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT', 5500);
    const price = number(data?.lastPrice);
    const change = number(data?.priceChangePercent);
    if (price > 0) state.price = price;
    if (Number.isFinite(change)) state.change24h = change;
    updateMarketHeader();
  } catch (_) {}
}
async function loadEurRate() {
  try {
    const cached = number(localStorage.getItem('inj_monitor_eur_rate'));
    if (cached > 0) state.eurRate = cached;
    const data = await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR', 6000);
    const next = number(data?.rates?.EUR);
    if (next > 0) {
      state.eurRate = next;
      localStorage.setItem('inj_monitor_eur_rate', String(next));
      updateMarketHeader();
    }
  } catch (_) {}
}
function updateMarketHeader() {
  const next = state.price;
  if (next > 0) {
    const shown = state.currency === 'EUR' ? next * Math.max(0, state.eurRate) : next;
    const symbol = state.currency === 'EUR' ? '€' : '$';
    $('flowPrice').textContent = `INJ ${symbol}${shown.toFixed(shown < 10 ? 4 : 3)}`;
  }
  const trend = $('flowTrend');
  const change = number(state.change24h);
  const hasChange = Number.isFinite(change) && state.price > 0;
  trend.textContent = hasChange ? `24H ${change > 0 ? '+' : ''}${change.toFixed(2)}%` : '24H —';
  trend.classList.toggle('up', hasChange && change > 0);
  trend.classList.toggle('down', hasChange && change < 0);
  trend.classList.toggle('neutral', !hasChange || change === 0);
  document.body.classList.toggle('market-up', hasChange && change > 0);
  document.body.classList.toggle('market-down', hasChange && change < 0);
  document.body.classList.toggle('market-flat', !hasChange || change === 0);
  renderDetail();
}
function schedulePriceReconnect(delay = 1200) {
  clearTimeout(state.reconnectTimer);
  if (navigator.onLine === false) return;
  state.reconnectTimer = setTimeout(connectPriceSocket, delay);
}
function connectPriceSocket() {
  if (navigator.onLine === false) return;
  if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) return;
  try {
    const socket = new WebSocket('wss://stream.binance.com:9443/ws/injusdt@ticker');
    state.socket = socket;
    socket.addEventListener('message', (event) => {
      try {
        const tick = JSON.parse(event.data);
        const price = number(tick?.c);
        const change = number(tick?.P);
        if (price > 0) state.price = price;
        if (Number.isFinite(change)) state.change24h = change;
        updateMarketHeader();
      } catch (_) {}
    });
    socket.addEventListener('close', () => {
      if (state.socket === socket) state.socket = null;
      schedulePriceReconnect();
    });
    socket.addEventListener('error', () => { try { socket.close(); } catch (_) {} });
  } catch (_) {
    schedulePriceReconnect(1600);
  }
}

function requestHomeReturn() {
  // v16.00.22 — When INJ Flow is hosted by the Home overlay, close only the
  // overlay. The Home document stays mounted, live and at the exact same scroll
  // position: no navigation and therefore no INJ Node reload on iPhone/PWA.
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'inj-flow-close' }, location.origin);
      return true;
    } catch (_) {}
  }
  return false;
}

function bindHomeReturn() {
  $('flowClose')?.addEventListener('click', (event) => {
    event.preventDefault();
    if (requestHomeReturn()) return;

    // Direct-open fallback (bookmark/external link): preserve the previous
    // behaviour only when Flow is not embedded by INJ Node Home.
    try { sessionStorage.setItem('inj_node_return_home', '1'); } catch (_) {}
    let canBack = false;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      canBack = Boolean(ref && ref.origin === location.origin && (ref.pathname.endsWith('/index.html') || ref.pathname.endsWith('/')) && history.length > 1);
    } catch (_) {}
    if (canBack) history.back(); else location.replace('./index.html');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!requestHomeReturn()) return;
    event.preventDefault();
  });
}
function bindDetailClose() {
  $('flowDetailClose')?.addEventListener('click', () => {
    const panel = $('flowWalletDetail');
    if (panel) panel.hidden = true;
    state.selectedAddress = '';
    document.querySelectorAll('.flow-wallet-node').forEach((node) => node.classList.remove('selected'));
    document.querySelectorAll('.flow-beam').forEach((beam) => beam.classList.remove('selected'));
  });
}
function applyPrivacy() {
  let hidden = false;
  try { hidden = localStorage.getItem('inj_monitor_privacy') === '1'; } catch (_) {}
  document.body.classList.toggle('privacy-active', hidden);
  document.querySelectorAll('.private').forEach((node) => node.classList.toggle('privacy-hidden', hidden));
}
function resume() {
  if (navigator.onLine === false) return;
  void loadMarket24h();
  connectPriceSocket();
  if (state.wallets.some((row) => !row.networkFresh)) void syncAllFast();
  else { void syncRewards(); void syncStatus(); }
}

function boot() {
  try { state.currency = localStorage.getItem('inj_monitor_currency') === 'EUR' ? 'EUR' : 'USD'; } catch (_) {}
  readWallets();
  buildFlowScene();
  startParticleEngine();
  bindHomeReturn();
  bindDetailClose();
  applyPrivacy();
  // Percorso critico: i 5 saldi on-chain partono subito e tutti in parallelo.
  void Promise.allSettled([loadEurRate(), loadMarket24h()]).then(() => render(true));
  void syncAllFast();
  connectPriceSocket();
  setInterval(() => { if (!document.hidden) void syncRewards(); }, REWARD_REFRESH_MS);
  setInterval(() => { if (!document.hidden) void syncStatus(); }, STATUS_REFRESH_MS);
  setInterval(() => { if (!document.hidden) void syncAprBackground(); }, APR_REFRESH_MS);
  setInterval(() => { if (!document.hidden) void loadMarket24h(); }, MARKET_REFRESH_MS);
  window.addEventListener('resize', layoutOrbit, { passive: true });
  window.addEventListener('online', resume);
  window.addEventListener('focus', () => { if (!document.hidden) resume(); }, { passive: true });
  window.addEventListener('pageshow', () => { if (!document.hidden) resume(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  window.addEventListener('storage', (event) => {
    if (['inj_monitor_wallets_v1','inj_monitor_currency','inj_monitor_theme','inj_monitor_privacy','inj_node_language_v1'].includes(event.key)) {
      if (event.key === 'inj_monitor_currency') {
        try { state.currency = localStorage.getItem('inj_monitor_currency') === 'EUR' ? 'EUR' : 'USD'; } catch (_) {}
      }
      if (event.key === 'inj_monitor_theme') {
        try { document.documentElement.dataset.theme = localStorage.getItem('inj_monitor_theme') || 'navy'; } catch (_) {}
      }
      if (event.key === 'inj_monitor_privacy') applyPrivacy();
      if (event.key === 'inj_monitor_wallets_v1') {
        readWallets();
        buildFlowScene();
        startParticleEngine();
        resume();
      }
      render(true);
    }
  });
  window.addEventListener('injnode:languagechange', () => render(true));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
