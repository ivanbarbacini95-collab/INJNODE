/* Shared section navigation and native scroll, v16.00.60. */
(() => {
'use strict';
const main = !!document.getElementById('entryGate');
const routes = [
 ['Dashboard','entryDashboardButton','dashboard'],['Live View','entryLiveButton','live'],
 ['Live Chart','entryLiveChartsButton','charts'],['Order Book','entryOrderBookButton','orderbook','order-book.html'],
 ['Performance Timeline','entryPerformanceButton','performance'],['INJ Converter','entryConverterButton','converter'],
 ['Command Center','entryCommandCenterButton','command','command-center.html'],
 ['Market','entryMarketButton','market','market.html'],['Live Rewards','entryLiveRewardsButton','rewards','live-rewards.html'],
 ['INJ Treasury','entryTreasuryButton','treasury','treasury.html']];
const bar=document.createElement('nav');bar.className='inj-section-nav';
bar.innerHTML='<button class="inj-nav-menu" aria-expanded="false" aria-controls="inj-section-links">☰ Menu</button><button class="inj-nav-home" aria-label="Home">×</button><div id="inj-section-links" hidden></div>';
document.body.append(bar);
const toggle=bar.querySelector('.inj-nav-menu'), panel=bar.querySelector('#inj-section-links');
function home(){
 panel.hidden=true;toggle.setAttribute('aria-expanded','false');
 if(window.parent!==window && location.pathname.endsWith('market.html')) {parent.postMessage({type:'injnode:market:home'},location.origin);return;}
 if(main){
  if(!document.getElementById('injMarketPortal')?.hidden){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));}
  if(typeof isConverterActive==='function' && isConverterActive()) closeConverterToHome();
  else if(typeof isPerformanceTimelineActive==='function' && isPerformanceTimelineActive()) closePerformanceTimelineToHome();
  else if(typeof goHome==='function') goHome('navigation');
 }else location.href='./index.html';
}
function launch(r){
 if(main){home();setTimeout(()=>document.getElementById(r[1])?.click(),1750);}
 else location.href=r[3]?'./'+r[3]:'./index.html#section='+r[2];
 panel.hidden=true;toggle.setAttribute('aria-expanded','false');
}
for(const r of routes){const b=document.createElement('button');b.type='button';b.dataset.route=r[2];b.textContent=r[0];b.onclick=()=>launch(r);panel.append(b);}
function language(){
 const en=(localStorage.getItem('inj_node_language_v1')||document.documentElement.lang)==='en';
 for(const el of [panel.querySelector('[data-route="market"]'),document.querySelector('#entryMarketButton strong')]) if(el)el.textContent=en?'Market':'Mercato';
 const link=document.getElementById('entryMarketButton');if(link)link.setAttribute('aria-label',en?'Open Market':'Apri Mercato');
 bar.querySelector('.inj-nav-home').setAttribute('aria-label',en?'Close section and return Home':'Chiudi sezione e torna alla Home');
}
toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));};
bar.querySelector('.inj-nav-home').onclick=home;
document.addEventListener('click',e=>{if(!bar.contains(e.target)){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}});
window.addEventListener('injnode:languagechange',language);window.addEventListener('storage',language);language();
// Keep exact labels after legacy translation passes.
new MutationObserver(()=>{const e=document.querySelector('#entryMarketButton strong');const v=localStorage.getItem('inj_node_language_v1')==='en'?'Market':'Mercato';if(e&&e.textContent!==v)e.textContent=v;}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
if(main && location.hash.startsWith('#section=')){const key=location.hash.slice(9);history.replaceState(null,'',location.pathname+location.search);setTimeout(()=>document.getElementById(routes.find(r=>r[2]===key)?.[1])?.click(),900);}
})();
