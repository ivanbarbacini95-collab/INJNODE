/* INJ Node · resilient LCD read transport — only verified chain responses are displayed.
 * The first healthy endpoint is reused across same-origin pages via sessionStorage.
 * One backup starts only if the current endpoint is slow, and losers are cancelled.
 */
(() => {
  'use strict';
  if (window.INJNodeLCD) return;
  const DEFAULT_ENDPOINTS = [
    'https://sentry.lcd.injective.network:443',
    'https://lcd.injective.network',
    'https://1rpc.io/inj-lcd'
  ];
  const KEY = 'inj_node_healthy_lcd_v1';
  const unhealthyUntil = new Map();
  let preferred = '';
  try { preferred = sessionStorage.getItem(KEY) || ''; } catch (_) {}

  function candidates(endpoints) {
    const source = Array.isArray(endpoints) && endpoints.length ? endpoints : DEFAULT_ENDPOINTS;
    const unique = [...new Set(source.filter(item => /^https:\/\//.test(String(item))))];
    const now = Date.now();
    unique.sort((a, b) => {
      const ar = (unhealthyUntil.get(a) || 0) > now ? 1 : 0;
      const br = (unhealthyUntil.get(b) || 0) > now ? 1 : 0;
      return (ar - br) || (Number(b === preferred) - Number(a === preferred));
    });
    return unique;
  }

  function read(path, endpoints = DEFAULT_ENDPOINTS, opts = {}) {
    if (!/^\//.test(path)) return Promise.reject(new Error('Invalid LCD path'));
    const nodes = candidates(endpoints);
    if (!nodes.length) return Promise.reject(new Error('No LCD endpoints'));
    const timeout = Math.max(2200, Math.min(9000, opts.timeout || 5300));
    const hedgeAfter = Math.max(350, Math.min(2200, opts.hedgeAfter || 1050));

    return new Promise((resolve, reject) => {
      const active = new Map();
      let next = 0;
      let finished = false;
      let stagger = 0;
      let lastError = new Error('Injective LCD unavailable');

      function cleanup() {
        clearTimeout(stagger);
        for (const controller of active.values()) controller.abort();
        active.clear();
      }
      function queueFallback() {
        if (finished || next >= nodes.length || stagger) return;
        stagger = setTimeout(() => { stagger = 0; startNext(); }, hedgeAfter);
      }
      function startNext() {
        if (finished || next >= nodes.length) return;
        const base = nodes[next++];
        const controller = new AbortController();
        active.set(base, controller);
        const timer = setTimeout(() => controller.abort(), timeout);
        queueFallback();
        fetch(base + path, { signal: controller.signal, cache: 'no-store' })
          .then(response => {
            if (!response.ok) throw new Error(`LCD ${response.status}`);
            return response.json();
          })
          .then(data => {
            if (finished) return;
            finished = true;
            preferred = base;
            unhealthyUntil.delete(base);
            try { sessionStorage.setItem(KEY, base); } catch (_) {}
            cleanup();
            resolve({ data, base });
          })
          .catch(error => {
            if (finished) return;
            lastError = error;
            unhealthyUntil.set(base, Date.now() + 20000);
            active.delete(base);
            if (stagger) { clearTimeout(stagger); stagger = 0; }
            if (next < nodes.length) startNext();
            else if (active.size === 0) {
              finished = true;
              cleanup();
              reject(lastError);
            }
          })
          .finally(() => clearTimeout(timer));
      }
      startNext();
    });
  }
  window.INJNodeLCD = Object.freeze({ read });
})();
