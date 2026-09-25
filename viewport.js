/* INJ Node v15.99.91 — viewport + global trackpad routing for full-page surfaces. */
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
    if (scroll !== lastScroll) { root.style.setProperty('--inj-document-top', scroll + 'px'); lastScroll = scroll; }
    if (!probe && document.body) {
      probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100dvh;visibility:hidden;pointer-events:none;contain:strict;';
      document.body.appendChild(probe);
    }
    const visual = window.visualViewport;
    // A software keyboard reduces the usable area; pinch zoom must remain native.
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

  // Only reject an outward gesture at a real boundary. Never move scrollTop:
  // rewriting the position here causes the visible one-pixel snap on release.
  let gesture = null;
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) { gesture = null; return; }
    const touch = event.touches[0];
    gesture = { target: event.target, x: touch.clientX, y: touch.clientY, lastY: touch.clientY };
  }, { passive: true });
  document.addEventListener('touchmove', (event) => {
    if (!gesture || event.touches.length !== 1 || event.defaultPrevented) return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    const step = touch.clientY - gesture.lastY;
    gesture.lastY = touch.clientY;
    if (Math.abs(dx) >= Math.abs(dy) || Math.abs(dy) < 4 || Math.abs(step) < 0.2) return;
    if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > 0.02) return;
    const documentScroller = document.scrollingElement || root;
    let node = gesture.target instanceof Element ? gesture.target : gesture.target?.parentElement;
    while (node && node !== documentScroller) {
      const css = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(css.overflowY) && node.scrollHeight > node.clientHeight + 1) {
        const end = node.scrollHeight - node.clientHeight;
        if ((step > 0 && node.scrollTop > 1) || (step < 0 && node.scrollTop < end - 1)) return;
        // A nested panel owns its scroll: don't hand the gesture to Home behind it.
        if (event.cancelable) event.preventDefault();
        return;
      }
      node = node.parentElement;
    }
    if (getComputedStyle(root).overflowY === 'hidden') {
      if (event.cancelable) event.preventDefault();
      return;
    }
    const end = Math.max(0, documentScroller.scrollHeight - documentScroller.clientHeight);
    if ((step > 0 && documentScroller.scrollTop <= 1) ||
        (step < 0 && documentScroller.scrollTop >= end - 1)) {
      if (event.cancelable) event.preventDefault();
    }
  }, { passive: false });


  // Desktop/trackpad scroll router.
  // A vertical gesture works from anywhere inside the active section; users
  // never need to grab the thin scrollbar at the far right of the viewport.
  // Horizontal gestures and pinch-to-zoom remain completely native.
  const wheelBlockedTarget = (node) => {
    if (!(node instanceof Element)) return false;
    return !!node.closest('input, textarea, select, [contenteditable="true"], [role="slider"]');
  };

  const canScrollY = (node, delta) => {
    if (!node) return false;
    const top = node === document.scrollingElement
      ? (window.scrollY || document.documentElement.scrollTop || 0)
      : node.scrollTop;
    const client = node === document.scrollingElement
      ? Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
      : node.clientHeight;
    const height = node === document.scrollingElement
      ? Math.max(document.documentElement.scrollHeight || 0, document.body?.scrollHeight || 0)
      : node.scrollHeight;
    const end = Math.max(0, height - client);
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

  const activePageScroller = () => {
    // Dedicated views hosted inside index.html.
    const performance = document.querySelector('#performanceTimelineView.open');
    if (performance && performance.scrollHeight > performance.clientHeight + 1) return performance;

    const converter = document.querySelector('#converterView.open .converter-view-main');
    if (converter && converter.scrollHeight > converter.clientHeight + 1) return converter;

    // Home and standalone pages use the document itself whenever their content
    // is taller than the viewport.
    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollHeight > doc.clientHeight + 1) return doc;
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

    const dy = wheelPixels(event);
    let scroller = nearestScrollableY(event.target);
    const primary = activePageScroller();

    // When a nested panel reaches its edge, continue naturally with the page.
    if (!canScrollY(scroller, dy)) scroller = primary;
    if (!scroller || !canScrollY(scroller, dy)) return;

    event.preventDefault();
    // Direct scrollTop writes preserve the trackpad's own momentum without
    // inheriting any CSS smooth-scroll animation.
    const target = (scroller === document.documentElement || scroller === document.body)
      ? (document.scrollingElement || document.documentElement)
      : scroller;
    target.scrollTop += dy;
  }, { passive: false, capture: true });


  const releaseGesture = () => { gesture = null; };
  document.addEventListener('touchend', releaseGesture, { passive: true });
  document.addEventListener('touchcancel', releaseGesture, { passive: true });

  root.dataset.injViewport = '89';
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', () => { schedule(); syncTheme(); });
  window.addEventListener('orientationchange', () => { schedule(); setTimeout(schedule, 250); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  document.addEventListener('focusout', () => setTimeout(schedule, 250));
  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { measure(); syncTheme(); }, { once: true });
  else { measure(); syncTheme(); }
})();
