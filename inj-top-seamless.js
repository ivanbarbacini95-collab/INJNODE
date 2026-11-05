/* INJ Node · theme-aware browser/status color.
   The content canvas and meta theme-color use the same selected palette.
   iOS Home Screen native status chrome may remain installation-controlled;
   do not create a fake bar or change safe-area dimensions. */
(()=>{
  'use strict';
  const root=document.documentElement;
  let queued=false;
  function sync(){
    queued=false;
    const computed=getComputedStyle(root);
    const color=computed.getPropertyValue('--theme-canvas').trim() ||
      computed.getPropertyValue('--bg').trim() ||
      computed.getPropertyValue('--canvas').trim();
    // Read exactly the same tone as the theme canvas. Mixing a separate
    // accent here made the native top strip visibly different after switching.
    const tag=document.querySelector('meta[name="theme-color"]');
    if(tag && color && tag.content!==color)tag.content=color;
  }
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(sync);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});
  else sync();
  window.addEventListener('pageshow',sync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue();});
  window.addEventListener('injnode:themechange',queue);
  new MutationObserver(queue).observe(root,{attributes:true,attributeFilter:['data-theme']});
})();
