/* Original settings menu, shared across section surfaces. */
(() => {
'use strict';
const main=!!document.getElementById('entryGate');
const embedded=main && location.hash==='#settings-embed';
const bar=document.createElement('nav');bar.className='inj-section-nav';
bar.innerHTML='<button class="inj-nav-menu" aria-label="Menu" aria-expanded="false">☰ Menu</button><button class="inj-nav-home" aria-label="Home">×</button>';
document.body.append(bar);
let frame=null;
function settings(){
 if(main){
  if(typeof setHeaderMenuOpen==='function'){
   renderMenuWalletContext();renderAveragePriceControl();
   const open=!document.getElementById('headerMenu').classList.contains('open');
   setHeaderMenuOpen(open);bar.querySelector('.inj-nav-menu').setAttribute('aria-expanded',String(open));
  }
 }else{
  if(frame){frame.remove();frame=null;return;}
  frame=document.createElement('iframe');frame.className='inj-settings-frame';frame.title='Menu · INJ Node';frame.src='./index.html#settings-embed';document.body.append(frame);
 }
}
function home(){
 if(frame){frame.remove();frame=null;return;}
 if(embedded){parent.postMessage({type:'injnode:settings:close'},location.origin);return;}
 if(!main){if(parent!==window && location.pathname.endsWith('market.html'))parent.postMessage({type:'injnode:market:home'},location.origin);else location.href='./index.html';return;}
 setHeaderMenuOpen(false);
 if(typeof isConverterActive==='function' && isConverterActive())closeConverterToHome();
 else if(typeof isPerformanceTimelineActive==='function' && isPerformanceTimelineActive())closePerformanceTimelineToHome();
 else if(typeof goHome==='function')goHome('navigation');
}
bar.querySelector('.inj-nav-menu').onclick=settings;bar.querySelector('.inj-nav-home').onclick=home;
if(main){
 const original=document.getElementById('headerMenu');
 original.classList.add('inj-original-settings','app-shell');document.body.append(original);
 if(embedded){document.documentElement.classList.add('inj-settings-embedded');window.addEventListener('load',()=>setTimeout(()=>{settings();},100));}
}
window.addEventListener('message',e=>{if(e.origin===location.origin && e.source===frame?.contentWindow && e.data?.type==='injnode:settings:close'){frame.remove();frame=null;}});
function language(){const en=localStorage.getItem('inj_node_language_v1')==='en';const el=document.querySelector('#entryMarketButton strong');if(el)el.textContent=en?'Market':'Mercato';}
window.addEventListener('injnode:languagechange',language);window.addEventListener('storage',language);language();
new MutationObserver(()=>{const el=document.querySelector('#entryMarketButton strong');const v=localStorage.getItem('inj_node_language_v1')==='en'?'Market':'Mercato';if(el&&el.textContent!==v)el.textContent=v;}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
})();
