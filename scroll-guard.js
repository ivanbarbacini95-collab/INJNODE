/* INJ Node v16.00.72 — Safari PWA scroll state. */
(() => {
  'use strict';
  const root = document.documentElement;
  if (root.dataset.injPage !== 'index') return;
  const $ = id => document.getElementById(id);
  let queued = false;
  function open(id) {
    const node = $(id);
    return !!node && !node.hidden && !node.classList.contains('mode-parked');
  }
  function hasOverlay() {
    return !!document.querySelector('dialog[open],.inj-content-frame') ||
      open('injMarketPortal') ||
      !!$('converterView')?.classList.contains('open') ||
      !!$('performanceTimelineView')?.classList.contains('open') ||
      open('focusDisplayDialog') || open('liveChartsDialog') || open('pulseViewDialog');
  }
  function reconcile() {
    queued = false;
    const body = document.body;
    if (!body) return;
    const gate = $('entryGate');
    const menu = $('headerMenu');
    const homeVisible = !!gate?.classList.contains('visible') && gate.getAttribute('aria-hidden') === 'false';
    const dashboard = body.classList.contains('dashboard-scroll-ready');
    const menuOpen = !!menu?.classList.contains('open');
    if (!menuOpen) body.classList.remove('menu-overlay-open');
    if (dashboard && !homeVisible) body.classList.remove('entry-gate-open');
    let mode = '';
    if (!menuOpen && !hasOverlay()) {
      if (dashboard) mode = 'dashboard';
      else if (homeVisible && body.classList.contains('entry-gate-open')) mode = 'home';
    }
    if (root.dataset.injScroll !== mode) {
      if (mode) root.dataset.injScroll = mode;
      else root.removeAttribute('data-inj-scroll');
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(reconcile);
  }
  function start() {
    const body = document.body;
    if (!body) return;
    const observer = new MutationObserver(schedule);
    observer.observe(body, { attributes:true, attributeFilter:['class'], childList:true });
    for (const node of [$('entryGate'), $('headerMenu'), $('injMarketPortal')]) {
      if (node) observer.observe(node, { attributes:true, attributeFilter:['class','aria-hidden','hidden'] });
    }
    document.addEventListener('click', schedule, { passive:true, capture:true });
    window.addEventListener('pageshow', schedule, { passive:true });
    window.addEventListener('popstate', schedule, { passive:true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
