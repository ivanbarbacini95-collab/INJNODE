/* INJ Node v15.99.99 — native scroll stability + viewport coordination. */
(() => {
  'use strict';
  const root = document.documentElement;
  let frame = 0;
  let probe;
  let lastHeight = 0;
  let lastScroll = -1;
  const editable = () => document.activeElement?.matches('input,textarea,[contenteditable="true"]');

  function measure() {
    frame = 0;
    const scroll = Math.max(0, window.scrollY || 0);
    if (scroll !== lastScroll) {
      root.style.setProperty('--inj-document-top', scroll + 'px');
      lastScroll = scroll;
    }
    if (!probe && document.body) {
      probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100dvh;visibility:hidden;pointer-events:none;contain:strict;';
      document.body.appendChild(probe);
    }
    const visual = window.visualViewport;
    if (visual && Math.abs(visual.scale - 1) > 0.02) return;
    const keyboard = editable() && visual && visual.height < window.innerHeight * 0.8;
    const cssHeight = probe?.getBoundingClientRect().height || 0;
    const height = Math.ceil(keyboard ? visual.height : Math.max(window.innerHeight || 0, cssHeight, visual?.height || 0));
    if (height > 0 && height !== lastHeight) {
      root.style.setProperty('--inj-viewport-height', height + 'px');
      lastHeight = height;
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure);
  }

  function syncTheme() {
    const css = getComputedStyle(root);
    const color = (css.getPropertyValue('--canvas') || css.getPropertyValue('--theme-canvas') || css.getPropertyValue('--bg')).trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }

  function indexSurfaceOwnsViewport() {
    if (root.dataset.injPage !== 'index') return false;
    if (document.querySelector('#entryGate.visible')) return true;
    if (document.querySelector('#performanceTimelineView.open')) return true;
    if (document.querySelector('#converterView.open')) return true;
    if (document.querySelector('#focusDisplayDialog:not([hidden])')) return true;
    if (document.querySelector('#pulseViewDialog:not([hidden])')) return true;
    if (document.querySelector('#liveChartsDialog:not([hidden])')) return true;
    if (document.querySelector('#headerMenu.open')) return true;
    return false;
  }

  function reconcileDocumentScroll() {
    if (root.dataset.injPage !== 'index' || !document.body) return;
    if (indexSurfaceOwnsViewport()) return;

    // Any lock that survived a closed overlay must never strand Dashboard.
    document.body.classList.remove('entry-gate-open', 'menu-overlay-open', 'focus-display-open', 'pulse-view-open');
    root.classList.remove('drawer-open');
    root.style.removeProperty('overflow');
    root.style.removeProperty('height');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('height');
  }

  // Native touch scrolling is intentionally left untouched. Previous global
  // touchmove interception could mis-detect a boundary after Safari/PWA resize
  // and make Dashboard feel locked. overscroll-behavior in CSS handles edges.

  const wheelBlockedTarget = (node) => {
    if (!(node instanceof Element)) return false;
    return !!node.closest('input, textarea, select, [contenteditable="true"], [role="slider"]');
  };

  const canScrollY = (node, delta) => {
    if (!node) return false;
    const top = node.scrollTop || 0;
    const end = Math.max(0, node.scrollHeight - node.clientHeight);
    return delta < 0 ? top > 0.5 : top < end - 0.5;
  };

  const nearestScrollableY = (start) => {
    let node = start instanceof Element ? start : start?.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const css = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(css.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
      node = node.parentElement;
    }
    return null;
  };

  const dedicatedScroller = () => {
    const performance = document.querySelector('#performanceTimelineView.open');
    if (performance && performance.scrollHeight > performance.clientHeight + 1) return performance;
    const converter = document.querySelector('#converterView.open .converter-view-main');
    if (converter && converter.scrollHeight > converter.clientHeight + 1) return converter;
    return null;
  };

  const wheelPixels = (event) => {
    let dy = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 16;
    else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= Math.max(1, window.innerHeight * 0.9);
    return dy;
  };

  document.addEventListener('wheel', (event) => {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || Math.abs(event.deltaY) < 0.01) return;
    if (wheelBlockedTarget(event.target)) return;

    // Dashboard, Home, Treasury and other normal pages use the browser's own
    // document scrolling. Never preventDefault there: this preserves momentum
    // and removes intermittent trackpad dead-zones.
    const dedicated = dedicatedScroller();
    if (!dedicated) return;

    const dy = wheelPixels(event);
    let scroller = nearestScrollableY(event.target);
    if (!canScrollY(scroller, dy)) scroller = dedicated;
    if (!scroller || !canScrollY(scroller, dy)) return;

    event.preventDefault();
    scroller.scrollTop += dy;
  }, { passive: false, capture: true });

  const resync = () => {
    reconcileDocumentScroll();
    schedule();
    syncTheme();
  };

  root.dataset.injViewport = '99';
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', resync);
  window.addEventListener('orientationchange', () => { resync(); setTimeout(resync, 250); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
  document.addEventListener('focusout', () => setTimeout(resync, 250));
  document.addEventListener('transitionend', reconcileDocumentScroll, { passive: true });
  document.addEventListener('animationend', reconcileDocumentScroll, { passive: true });
  new MutationObserver(() => { syncTheme(); reconcileDocumentScroll(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  new MutationObserver(reconcileDocumentScroll).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', resync, { once: true });
  } else {
    resync();
  }
})();
