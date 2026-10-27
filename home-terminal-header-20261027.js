/* INJ Node · Home terminal header structure, 2026-10-27.
 * Reuse the existing live metrics and Control Center menu, with no duplicate
 * button or listener. A common grid keeps the hamburger aligned to the brand.
 */
(() => {
  'use strict';
  function arrange() {
    const gate = document.getElementById('entryGate');
    const heading = gate?.querySelector('.entry-wallet-section > .home-safe-heading');
    const menu = document.getElementById('headerMenu');
    if (!gate || !heading || !menu || menu.parentElement === heading) return;
    // Menu panel and backdrop remain descendants of #headerMenu so existing
    // Control Center and closing actions continue to work without re-binding.
    heading.insertBefore(menu, heading.firstChild);
    heading.classList.add('inj-terminal-hero-arranged');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrange, {once:true});
  } else arrange();
})();
