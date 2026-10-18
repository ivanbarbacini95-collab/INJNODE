/* Original settings menu, shared across section surfaces. */
(() => {
'use strict';
const main=!!document.getElementById('entryGate');
const embedded=main && location.hash==='#settings-embed';
const hamburger=main ? document.getElementById('entryMenuButton') : document.createElement('button');
if(!main){
 hamburger.type='button';
 hamburger.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
 hamburger.setAttribute('aria-label','Impostazioni');
 hamburger.setAttribute('aria-expanded','false');
}
hamburger.classList.add('inj-nav-menu');
let frame=null;
function settings(){
 if(main){
  if(typeof setHeaderMenuOpen==='function'){
   renderMenuWalletContext();renderAveragePriceControl();
   const open=!document.getElementById('headerMenu').classList.contains('open');
   setHeaderMenuOpen(open);hamburger.setAttribute('aria-expanded',String(open));
  }
 }else{
  if(parent!==window){parent.postMessage({type:'injnode:settings:open'},location.origin);return;}
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
if(main){
 const original=document.getElementById('headerMenu');
 original.classList.add('inj-original-settings','app-shell');document.body.append(original);
 function placeHamburger(){
  let host=document.querySelector('.entry-home-top');
  if(!embedded){
   const active=(id)=>{const el=document.getElementById(id);return el && !el.hidden && el.classList.contains('open');};
   if(document.body.classList.contains('focus-display-open'))host=document.getElementById('focusDisplayControls');
   else if(active('converterView'))host=document.querySelector('.converter-view-header');
   else if(active('performanceTimelineView'))host=document.querySelector('.performance-timeline-header');
   else if(!document.body.classList.contains('entry-gate-open'))host=document.getElementById('dashboardHeaderActions');
  }
  if(host && hamburger.parentElement!==host)host.append(hamburger);
 }
 placeHamburger();
 new MutationObserver(placeHamburger).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class','hidden']});
 if(embedded){document.documentElement.classList.add('inj-settings-embedded');window.addEventListener('load',()=>setTimeout(()=>{settings();},100));}
}else{
 const host=document.querySelector('.header-actions,.cc-live-head,.rewards-head-status,.treasury-market-reference,.book-topbar,.header');
 if(host)host.append(hamburger);
 hamburger.onclick=settings;
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
 if(!main || section)return;
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
  if(event.origin!==location.origin)return;
  const fromSection=event.source===section?.contentWindow;
  const fromMarket=event.source===document.getElementById('injMarketFrame')?.contentWindow;
  if(fromSection && event.data?.type==='injnode:section:home')closeSection();
  if((fromSection || fromMarket) && event.data?.type==='injnode:settings:open'){
   renderMenuWalletContext();renderAveragePriceControl();setHeaderMenuOpen(true);
  }
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
