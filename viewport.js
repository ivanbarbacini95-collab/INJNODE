/* INJ Node v16.00.12 — native-scroll optimized viewport management. */
(() => {
  'use strict';
  const root = document.documentElement;
  let frame = 0;
  let probe;
  let lastHeight = 0;
  let lastScroll = -1;
  let scrollIdleTimer = 0;
  const editable = () => document.activeElement?.matches('input,textarea,[contenteditable="true"]');

  function syncDocumentTop() {
    const scroll = Math.max(0, window.scrollY || 0);
    if (scroll !== lastScroll) {
      root.style.setProperty('--inj-document-top', scroll + 'px');
      lastScroll = scroll;
    }
  }

  function measure() {
    frame = 0;
    syncDocumentTop();
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

  function markNativeScroll() {
    // Keep wheel/trackpad scrolling on the browser compositor. No geometry reads
    // or CSS variable writes are performed for every scroll frame.
    if (!root.classList.contains('inj-native-scrolling')) root.classList.add('inj-native-scrolling');
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => {
      root.classList.remove('inj-native-scrolling');
      syncDocumentTop();
    }, 140);
  }
  function syncTheme() {
    const css = getComputedStyle(root);
    const color = (css.getPropertyValue('--canvas') || css.getPropertyValue('--theme-canvas') || css.getPropertyValue('--bg')).trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }

  // Native scrolling: a global non-passive touchmove handler used to call
  // preventDefault() at assumed boundaries. On iOS this could trap gestures
  // over cards/charts and also force main-thread scrolling. Browser-native
  // overscroll containment now handles the edges without intercepting input.

  root.dataset.injViewport = '160013';
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', markNativeScroll, { passive: true });
  window.addEventListener('scrollend', syncDocumentTop, { passive: true });
  // Capture the current document offset immediately before a control can open
  // an absolute/fullscreen surface. This replaces the old per-frame scroll work.
  document.addEventListener('pointerdown', syncDocumentTop, { passive: true, capture: true });
  document.addEventListener('keydown', syncDocumentTop, { passive: true, capture: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', () => { schedule(); syncTheme(); });
  window.addEventListener('orientationchange', () => { schedule(); setTimeout(schedule, 250); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  document.addEventListener('focusout', () => setTimeout(schedule, 250));
  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { measure(); syncTheme(); }, { once: true });
  else { measure(); syncTheme(); }
})();
