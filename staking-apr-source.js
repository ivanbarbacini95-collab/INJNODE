/* INJ Node — verified staking APR source (2026-11-09)
 * Only protocol data, measured block cadence and validator commissions.
 * No hard-coded APR floor, smoothing or fabricated "live" precision.
 */
(function (global) {
  'use strict';
  const STORE = 'inj_node_verified_staking_apr_v1';
  const OFFICIAL = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
  const LCDS = ['https://sentry.lcd.injective.network:443', 'https://lcd.injective.network', 'https://1rpc.io/inj-lcd'];
  const REFRESH_MS = 5 * 60_000;
  const MAX_CACHE_MS = 30 * 60_000;
  const ASSUMED_MINT_BLOCK_SECONDS = 0.5;
  let pending = null;
  let current = null;
  const positive = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : NaN; };
  const percent = (value) => { const n = positive(value); return Number.isFinite(n) ? (n <= 1 ? n * 100 : n) : NaN; };
  const bounded = (value) => Number.isFinite(value) && value > 0 && value < 80;
  const close = (a, b, tolerance) => Math.abs(a - b) / Math.max(a, b) <= tolerance;

  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && bounded(Number(saved.apr)) && Number.isFinite(Number(saved.at)) &&
        Date.now() - Number(saved.at) >= 0 && Date.now() - Number(saved.at) < MAX_CACHE_MS) {
      current = saved;
    }
  } catch (_) {}

  async function json(url, timeoutMs = 4800) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function lcd(path) {
    let error;
    for (const base of LCDS) {
      try { return await json(base + path, 3600); }
      catch (e) { error = e; }
    }
    throw error || new Error('Injective LCD unavailable');
  }
  function header(data) {
    return data?.block?.header || data?.sdk_block?.header || null;
  }
  async function measuredBlockSeconds() {
    const latest = header(await lcd('/cosmos/base/tendermint/v1beta1/blocks/latest'));
    const height = Number(latest?.height);
    const newest = Date.parse(latest?.time);
    if (!(height > 600) || !Number.isFinite(newest)) throw new Error('Latest block unavailable');
    const old = header(await lcd('/cosmos/base/tendermint/v1beta1/blocks/' + (height - 480)));
    const oldest = Date.parse(old?.time);
    const deltaHeight = height - Number(old?.height);
    const seconds = (newest - oldest) / 1000 / deltaHeight;
    if (!(deltaHeight > 0 && seconds > 0.35 && seconds < 3)) throw new Error('Block cadence not verified');
    return seconds;
  }
  async function retrieve() {
    const [mint, pool, distribution, official, cadence] = await Promise.allSettled([
      lcd('/cosmos/mint/v1beta1/annual_provisions'),
      lcd('/cosmos/staking/v1beta1/pool'),
      lcd('/cosmos/distribution/v1beta1/params'),
      json(OFFICIAL, 5000),
      measuredBlockSeconds()
    ]);
    const annual = positive(mint.status === 'fulfilled' ? mint.value?.annual_provisions : null);
    const bonded = positive(pool.status === 'fulfilled' ? pool.value?.pool?.bonded_tokens : null);
    const taxRaw = distribution.status === 'fulfilled' ? distribution.value?.params?.community_tax : null;
    const tax = taxRaw === null || taxRaw === undefined ? NaN : Number(taxRaw);
    const gross = Number.isFinite(annual) && Number.isFinite(bonded) &&
      Number.isFinite(tax) && tax >= 0 && tax < 1 ? annual / bonded * 100 * (1 - tax) : NaN;
    const seconds = cadence.status === 'fulfilled' ? cadence.value : NaN;
    const derived = bounded(gross) && Number.isFinite(seconds)
      ? gross * ASSUMED_MINT_BLOCK_SECONDS / seconds : NaN;
    const quoted = official.status === 'fulfilled' ? percent(official.value?.apr) : NaN;
    let apr = NaN;
    let source = '';
    let conflict = false;
    if (bounded(derived)) {
      // The official UI quote is used only if consistent with independently
      // measured mint emissions, community tax, bonded stake and block cadence.
      conflict = bounded(quoted) && !close(quoted, derived, 0.30);
      apr = bounded(quoted) && !conflict ? quoted : derived;
      source = bounded(quoted) && !conflict ? 'Injective UI + on-chain' : 'On-chain · blocchi misurati';
    } else if (bounded(quoted) && bounded(gross) && close(quoted, gross, 0.36)) {
      // If block sampling is temporarily unavailable, a nominal mint cross-check
      // is sufficient only to accept a consistent official quote (not a 1.34% spike).
      apr = quoted;
      source = 'Injective UI · verifica emissioni';
    }
    if (!bounded(apr)) throw new Error('APR cannot be independently verified');
    const result = {
      apr, at: Date.now(), source, conflict,
      derivedApr: bounded(derived) ? derived : null,
      quotedApr: bounded(quoted) ? quoted : null,
      blockSeconds: Number.isFinite(seconds) ? seconds : null
    };
    current = result;
    try { localStorage.setItem(STORE, JSON.stringify(result)); } catch (_) {}
    return result;
  }
  async function load(force = false) {
    const now = Date.now();
    if (!force && current && now - current.at < REFRESH_MS) return { ...current, stale: false };
    if (!pending) pending = retrieve().finally(() => { pending = null; });
    try { return { ...(await pending), stale: false }; }
    catch (_) {
      if (current && now - current.at < MAX_CACHE_MS) return { ...current, stale: true };
      return null;
    }
  }
  function snapshot() {
    return current && Date.now() - current.at < MAX_CACHE_MS
      ? { ...current, stale: Date.now() - current.at >= REFRESH_MS } : null;
  }
  function validatorNetApr(baseApr, commission, status, jailed) {
    const fee = Number(commission);
    const validStatus = status === 'BOND_STATUS_BONDED' || status === '3';
    if (!bounded(Number(baseApr)) || !Number.isFinite(fee) || fee < 0 || fee > 1 ||
        typeof status !== 'string' || !status) return NaN;
    return jailed || !validStatus ? 0 : Number(baseApr) * (1 - fee);
  }
  global.INJ_STAKING_APR = Object.freeze({ load, snapshot, validatorNetApr, maxCacheMs: MAX_CACHE_MS });
})(window);
