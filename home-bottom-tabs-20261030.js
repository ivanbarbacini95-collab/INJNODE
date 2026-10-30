/* INJ Node · Native-style five-destination Home navigation, 30 Oct 2026.
   Existing launchers, IDs, listeners and wallet/chart DOM remain untouched.
   Switch only their presentation; never clone wallet/trading components. */
(()=>{
 'use strict';
 const root=document.documentElement;
 const gate=document.getElementById('entryGate');
 const actions=gate?.querySelector('.entry-actions.entry-flat-v44');
 if(!gate||!actions||document.getElementById('injPrimaryBottomNav'))return;
 const sections=[
  {id:'home',it:'Home',en:'Home',titleIt:'',titleEn:'',subIt:'',subEn:'',ids:['entryDashboardButton','entryLiveButton'],icon:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'},
  {id:'patrimonio',it:'Patrimonio',en:'Wealth',titleIt:'PATRIMONIO',titleEn:'WEALTH',subIt:'Wallet, dashboard e valore del portafoglio',subEn:'Wallets, dashboard and portfolio value',ids:['entryTreasuryButton','entryVisualizeWealthButton'],icon:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M7 6V4h10v2M7 15h5"/>'},
  {id:'mercato',it:'Mercato',en:'Market',titleIt:'MERCATO',titleEn:'MARKET',subIt:'Prezzi, analisi e calendario macro',subEn:'Prices, research and macro calendar',ids:['entryMarketButton','entryLiveChartsButton','entryOrderBookButton','entryPerformanceButton','entryComparisonButton','entryMacroCalendarButton'],icon:'<path d="M3 20h18M5 17V6M7 15l4-4 3 2 5-7M16 6h3v3"/>'},
  {id:'reward',it:'Reward',en:'Reward',titleIt:'REWARD',titleEn:'REWARD',subIt:'Staking, ricompense e obiettivi',subEn:'Staking, rewards and milestones',ids:['entryLiveRewardsButton','entryRewardLadderButton','entryFreedomButton'],icon:'<path d="M12 2v20M16 6H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H7"/>'},
  {id:'altro',it:'Altro',en:'More',titleIt:'ALTRO',titleEn:'MORE',subIt:'Strumenti e funzionalità aggiuntive',subEn:'Additional tools and features',ids:['entryInjcEtfButton','entryWorkspaceButton','entryConverterButton','entryCommandCenterButton'],icon:'<circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.25" fill="currentColor" stroke="none"/>'}
 ];
 const originalDisplay=new WeakMap();
 const heading=document.createElement('header');
 heading.id='injTabHeading';heading.className='inj-tab-heading';heading.hidden=true;
 heading.innerHTML='<div><span class="inj-tab-eyebrow">INJ NODE / EXPLORE</span><h2 id="injTabHeadingTitle"></h2><p id="injTabHeadingSubtitle"></p></div>';
 actions.before(heading);

 const nav=document.createElement('nav');
 nav.id='injPrimaryBottomNav';
 nav.className='inj-primary-bottom-nav';
 nav.setAttribute('aria-label','Navigazione principale');
 const buttons=new Map();
 sections.forEach(section=>{
  const button=document.createElement('button');
  button.type='button';button.className='inj-bottom-tab';button.dataset.injTab=section.id;
  button.innerHTML='<span class="inj-bottom-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+section.icon+'</svg></span><span class="inj-bottom-tab-label"></span>';
  nav.append(button);buttons.set(section.id,button);
  button.addEventListener('click',()=>{
   if(root.dataset.injHomeTab!==section.id){activate(section.id,true);}
   else if(section.id==='home')scrollHomeTop();
  });
 });
 document.body.append(nav);
 const getEnglish=()=>{
  try{return localStorage.getItem('inj_node_language_v1')==='en'||root.lang==='en';}
  catch(_){return root.lang==='en';}
 };
 function refreshLanguage(){
  const en=getEnglish();
  for(const section of sections){
   const button=buttons.get(section.id);
   button.querySelector('.inj-bottom-tab-label').textContent=en?section.en:section.it;
   button.setAttribute('aria-label',en?section.en:section.it);
  }
  nav.setAttribute('aria-label',en?'Main navigation':'Navigazione principale');
  const section=sections.find(item=>item.id===root.dataset.injHomeTab)||sections[0];
  document.getElementById('injTabHeadingTitle').textContent=en?section.titleEn:section.titleIt;
  document.getElementById('injTabHeadingSubtitle').textContent=en?section.subEn:section.subIt;
 }
 let tabScrollRevision=0;
 function resetTabScroll(){
  const s=document.scrollingElement||document.documentElement;
  for(const el of [s,document.documentElement,document.body,gate]){
   if(el && el.scrollTop>0)el.scrollTop=0;
  }
  if(window.scrollY>0)window.scrollTo(0,0);
 }
 function scrollHomeTop(){
  const current=++tabScrollRevision;
  resetTabScroll();
  requestAnimationFrame(()=>{
   if(current!==tabScrollRevision)return;
   resetTabScroll();
   requestAnimationFrame(()=>{
    if(current===tabScrollRevision)resetTabScroll();
   });
  });
 }
 function applyVisibility(section){
  const shown=new Set(section.ids);
  for(const element of actions.querySelectorAll(':scope > .entry-action')){
   if(!originalDisplay.has(element))originalDisplay.set(element,{
    value:element.style.getPropertyValue('display'),priority:element.style.getPropertyPriority('display')
   });
   if(shown.has(element.id)){
    const old=originalDisplay.get(element);
    if(old.value)element.style.setProperty('display',old.value,old.priority);
    else element.style.removeProperty('display');
   }else element.style.setProperty('display','none','important');
  }
 }
 function activate(id,scroll){
  const section=sections.find(item=>item.id===id)||sections[0];
  root.dataset.injHomeTab=section.id;
  // The original launcher elements remain direct children in their original order.
  applyVisibility(section);
  heading.hidden=section.id==='home';
  for(const [key,button] of buttons){
   const selected=key===section.id;
   button.classList.toggle('is-active',selected);
   if(selected)button.setAttribute('aria-current','page');
   else button.removeAttribute('aria-current');
  }
  refreshLanguage();
  if(scroll)scrollHomeTop();
 }
 // Only re-check direct launchers if other startup scripts append one.
 // Child text mutations from streaming prices do not trigger this observer.
 let pending=false;
 const observer=new MutationObserver(()=>{
  if(pending)return;
  pending=true;
  requestAnimationFrame(()=>{
   pending=false;
   const selected=sections.find(x=>x.id===root.dataset.injHomeTab)||sections[0];
   applyVisibility(selected);
  });
 });
 observer.observe(actions,{childList:true});
 activate('home',false);
 window.addEventListener('injnode:languagechange',refreshLanguage);
 window.addEventListener('storage',event=>{if(event.key==='inj_node_language_v1')refreshLanguage();});
 window.addEventListener('pageshow',refreshLanguage);
 window.INJ_BOTTOM_NAV={select:id=>activate(id,true),active:()=>root.dataset.injHomeTab};
})();
