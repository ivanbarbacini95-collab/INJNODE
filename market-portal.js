/* INJ NODE Market: isolated live iframe over the retained Home, no index reload. */
(() => {
  'use strict';
  const launcher = document.getElementById('entryMarketButton');
  const portal = document.getElementById('injMarketPortal');
  const frame = document.getElementById('injMarketFrame');
  if (!launcher || !portal || !frame) return;
  frame.addEventListener('load', () => { if (frame.contentWindow) frame.contentWindow.postMessage({type:'injnode:market:language',language:window.INJ_I18N?.getLanguage?.() || localStorage.getItem('inj_node_language_v1') || 'it'},insideOrigin); });
  let open = false;
  let entryScroll = 0;
  const originalTitle = document.title;
  const titleFor = () => { try { return localStorage.getItem('inj_node_language_v1') === 'en' ? 'Market' : 'Mercato'; } catch (_) { return 'Mercato'; } };
  const insideOrigin = (location.origin && location.origin !== 'null') ? location.origin : '*';
  function reveal() {
    if (open) return;
    open = true;
    entryScroll = window.scrollY;
    portal.hidden = false;
    portal.setAttribute('aria-label', titleFor());
    frame.title = titleFor();
    // The primary app, wallet selection and Home are untouched underneath.
    frame.src = './market.html?v=160062&lang=' + (window.INJ_I18N?.getLanguage?.() || localStorage.getItem('inj_node_language_v1') || 'it');
    document.title = 'INJ NODE | ' + titleFor();
    if (!history.state?.injMarketPortal) {
      history.pushState({ ...(history.state || {}), injMarketPortal: true }, '', '#market');
    }
  }
  function conceal(fromBrowserBack = false) {
    if (!open) return;
    open = false;
    portal.hidden = true;
    frame.src = 'about:blank'; // shuts down the old iframe streams/timers
    document.title = originalTitle;
    if (!fromBrowserBack && history.state?.injMarketPortal) history.back();
    try { launcher.focus({ preventScroll: true }); } catch (_) {}
    // Unlock the document first; then restore the exact Home offset.
    window.INJ_SCROLL_GUARD?.refresh();
    requestAnimationFrame(() => {
      if (!open && Math.abs(window.scrollY - entryScroll) > 8) window.scrollTo(0, entryScroll);
    });
  }
  launcher.addEventListener('click', (event) => {
    // Ordinary keyboard/touch interaction stays in INJ Node. Modified clicks
    // still allow the standalone URL to be opened in another tab.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
    event.preventDefault();
    reveal();
  });
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    if (insideOrigin !== '*' && event.origin !== location.origin) return;
    if (event.data?.type === 'injnode:market:home') conceal();
  });
  window.addEventListener('popstate', () => {
    if (open && !history.state?.injMarketPortal) conceal(true);
  });
  window.addEventListener('keydown', (event) => {
    if (open && event.key === 'Escape') conceal();
  });
  window.addEventListener('injnode:languagechange', () => {
    if (open && frame.contentWindow) {
      frame.contentWindow.postMessage({type:'injnode:market:language', language:window.INJ_I18N?.getLanguage?.() || 'it'}, insideOrigin);
      portal.setAttribute('aria-label', titleFor());
      document.title = 'INJ NODE | ' + titleFor();
    }
  });
})();
