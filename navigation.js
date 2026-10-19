/* Keep Home mounted; use only the original page controls. */
(() => {
'use strict';
const main=!!document.getElementById('entryGate');
// Reuse the selected palette in every standalone/embedded section.
const themeKeys=['--bg','--surface','--surface-strong','--surface-soft','--line','--line-strong','--text','--muted','--muted-strong','--accent','--accent-soft','--up','--up-soft','--down','--down-soft','--page-gradient','--theme-canvas','--theme-canvas-soft','--theme-backdrop'];
function syncSectionTheme(){
 if(main)return;
 let theme='navy';
 try{theme=localStorage.getItem('inj_monitor_theme')||theme;}catch(_){}
 if(!['navy','black','light','amber'].includes(theme))theme='navy';
 const root=document.documentElement;root.dataset.theme=theme;
 try{
  if(parent!==window && parent.location.origin===location.origin){
   const css=parent.getComputedStyle(parent.document.documentElement);
   for(const key of themeKeys){const value=css.getPropertyValue(key).trim();if(value)root.style.setProperty(key,value);}
  }
 }catch(_){}
 root.style.colorScheme=theme==='light'?'light':'dark';
 const color=getComputedStyle(root).getPropertyValue('--bg').trim();
 if(color)document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);
}
syncSectionTheme();
window.addEventListener('storage',event=>{if(event.key==='inj_monitor_theme')syncSectionTheme();});
window.addEventListener('pageshow',syncSectionTheme);

function home(){
 if(parent===window)return;
 parent.postMessage({type:location.pathname.endsWith('market.html')?'injnode:market:home':'injnode:section:home'},location.origin);
}
// Retain the parent app while isolated sections run in their own document.
let section=null,sectionLauncher=null,sectionCover=null;
function closeSection(fromHistory=false){
 if(!section)return;
 section.remove();section=null;
 sectionCover?.remove();sectionCover=null;
 document.body.classList.remove('inj-section-open');
 if(!fromHistory && history.state?.injSection)history.back();
 sectionLauncher?.focus({preventScroll:true});
 // Section iframe is gone: hand the native scroll surface back to Home.
 window.INJ_SCROLL_GUARD?.refresh();
}
window.INJ_OPEN_SECTION=function(url){
 if(!main || section)return;
 setHeaderMenuOpen(false);
 sectionLauncher=document.activeElement;
 sectionCover=document.createElement('div');
 sectionCover.className='inj-section-cover';
 sectionCover.setAttribute('aria-hidden','true');
 sectionCover.innerHTML='<span class="inj-section-loading-mark">INJ NODE</span>';
 section=document.createElement('iframe');section.className='inj-content-frame';
 section.title='INJ Node';
 const currentSection=section;
 const targetPath=new URL(url,location.href).pathname;
 section.addEventListener('load',()=>{
   if(section!==currentSection)return;
   try {
     if(currentSection.contentWindow?.location.pathname!==targetPath)return;
   }catch(_){return;}
   // CSS, scripts and document load have completed: never expose Safari's
   // temporary white about:blank document before this point.
   requestAnimationFrame(()=>{
     if(section===currentSection)currentSection.dataset.ready='true';
   });
 });
 document.body.append(sectionCover,section);
 document.body.classList.add('inj-section-open');
 section.src=url;
 history.pushState({...history.state,injSection:true},'', '#section');
};
if(main){
 document.addEventListener('click',event=>{
  const link=event.target.closest('#entryTreasuryButton,#entryLiveRewardsButton,#entryAtlasButton');
  if(!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
  event.preventDefault();event.stopImmediatePropagation();window.INJ_OPEN_SECTION(link.href);
 },true);
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  const fromSection=event.source===section?.contentWindow;
  if(fromSection && event.data?.type==='injnode:section:home')closeSection();
 });
 window.addEventListener('popstate',()=>{if(section && !history.state?.injSection)closeSection(true);});
 window.addEventListener('keydown',event=>{if(section && event.key==='Escape')closeSection();});
}else if(parent!==window){
 document.addEventListener('click',event=>{
  if(!event.target.closest('#treasuryClose,#rewardsClose,#liveChartsBack,#ccBack,#bookBack,#atlasBack'))return;
  event.preventDefault();event.stopImmediatePropagation();home();
 },true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape' && !document.querySelector('dialog[open]'))home();});
}
function language(){const en=localStorage.getItem('inj_node_language_v1')==='en';const el=document.querySelector('#entryMarketButton strong');if(el)el.textContent=en?'Market':'Mercato';}
window.addEventListener('injnode:languagechange',language);window.addEventListener('storage',language);language();
// The common i18n observer owns live text translation (no competing observer).
})();
