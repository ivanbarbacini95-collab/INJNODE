/* Original settings menu, shared across section surfaces. */
(() => {
'use strict';
const main=!!document.getElementById('entryGate');
const embedded=main && location.hash==='#settings-embed';
const bar=document.createElement('nav');bar.className='inj-section-nav';
bar.innerHTML='<button class="inj-nav-menu" aria-label="Menu" aria-expanded="false">☰</button><button class="inj-nav-home" aria-label="Home">×</button>';
document.body.append(bar);
let frame=null;
function settings(){
 if(main){
  if(typeof setHeaderMenuOpen==='function'){
   renderMenuWalletContext();renderAveragePriceControl();
   const open=!document.getElementById('headerMenu').classList.contains('open');
   setHeaderMenuOpen(open);bar.querySelector('.inj-nav-menu')?.setAttribute('aria-expanded',String(open));
  }
 }else{
  if(frame){frame.remove();frame=null;return;}
  frame=document.createElement('iframe');frame.className='inj-settings-frame';frame.title='Menu · INJ Node';frame.src='./index.html#settings-embed';document.body.append(frame);
 }
}
function home(){
 if(frame){frame.remove();frame=null;return;}
 if(embedded){parent.postMessage({type:'injnode:settings:close'},location.origin);return;}
 if(!main){if(parent!==window)parent.postMessage({type:location.pathname.endsWith('market.html')?'injnode:market:home':'injnode:section:home'},location.origin);else location.href='./index.html';return;}
 setHeaderMenuOpen(false);
 if(typeof isConverterActive==='function' && isConverterActive())closeConverterToHome();
 else if(typeof isPerformanceTimelineActive==='function' && isPerformanceTimelineActive())closePerformanceTimelineToHome();
 else if(typeof goHome==='function')goHome('navigation');
}
bar.querySelector('.inj-nav-menu').onclick=settings;bar.querySelector('.inj-nav-home').onclick=home;
if(main){
 const original=document.getElementById('headerMenu');
 original.classList.add('inj-original-settings','app-shell');document.body.append(original);
 const hamburger=document.getElementById('entryMenuButton');
 bar.querySelector('.inj-nav-menu').replaceWith(hamburger);
 hamburger.classList.add('inj-nav-menu');
 if(embedded){document.documentElement.classList.add('inj-settings-embedded');window.addEventListener('load',()=>setTimeout(()=>{settings();},100));}
}
window.addEventListener('message',e=>{if(e.origin===location.origin && e.source===frame?.contentWindow && e.data?.type==='injnode:settings:close'){frame.remove();frame=null;}});
// Retain the parent app while isolated sections run in their own document.
let section=null,sectionLauncher=null;
function closeSection(fromHistory=false){
 if(!section)return;
 section.remove();section=null;
 document.body.classList.remove('inj-section-open');
 if(!fromHistory && history.state?.injSection)history.back();
 sectionLauncher?.focus({preventScroll:true});
}
window.INJ_OPEN_SECTION=function(url){
 if(!main)return;
 setHeaderMenuOpen(false);
 sectionLauncher=document.activeElement;
 section=document.createElement('iframe');section.className='inj-content-frame';
 section.title='INJ Node';section.src=url;
 document.body.append(section);document.body.classList.add('inj-section-open');
 history.pushState({...history.state,injSection:true},'', '#section');
};
if(main){
 document.addEventListener('click',event=>{
  const link=event.target.closest('#entryTreasuryButton,#entryLiveRewardsButton');
  if(!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
  event.preventDefault();event.stopImmediatePropagation();window.INJ_OPEN_SECTION(link.href);
 },true);
 window.addEventListener('message',event=>{
  if(event.origin===location.origin && event.source===section?.contentWindow && event.data?.type==='injnode:section:home')closeSection();
 });
 window.addEventListener('popstate',()=>{if(section && !history.state?.injSection)closeSection(true);});
 window.addEventListener('keydown',event=>{if(section && event.key==='Escape')closeSection();});
}else if(parent!==window){
 document.addEventListener('click',event=>{
  if(!event.target.closest('#treasuryClose,#rewardsClose,#liveChartsBack,#ccBack,#bookBack,.inj-nav-home'))return;
  event.preventDefault();event.stopImmediatePropagation();home();
 },true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape' && !document.querySelector('dialog[open]'))home();});
}
function language(){const en=localStorage.getItem('inj_node_language_v1')==='en';const el=document.querySelector('#entryMarketButton strong');if(el)el.textContent=en?'Market':'Mercato';}
window.addEventListener('injnode:languagechange',language);window.addEventListener('storage',language);language();
new MutationObserver(()=>{const el=document.querySelector('#entryMarketButton strong');const v=localStorage.getItem('inj_node_language_v1')==='en'?'Market':'Mercato';if(el&&el.textContent!==v)el.textContent=v;}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
})();
