/* INJ NODE · direct Global Market / Global Crypto navigation.
 * Uses the already-active market router and its shared CoinGecko data.
 * No duplicate charts, API requests, favorites or live subscriptions. */
(()=>{
 'use strict';
 const root=document.documentElement;
 const query=new URLSearchParams(location.search);
 const type=['world','crypto','intel'].includes(query.get('entry'))?query.get('entry'):null;
 if(type)root.dataset.injMarketEntry=type;
 const route=window.INJ_MARKET_NAVIGATE;
 if(typeof route!=='function')return;
 // The global views are autonomous destinations. Remove the obsolete
 // five-tab Market hub from the live DOM only on their direct routes;
 // keep the original nav intact for INJ Intelligence and standalone Market.
 if(type==='world'||type==='crypto'){
  document.getElementById('injIntelRoot')?.remove();
  const unused=type==='world'?'injGlobalMarket':'injWorldMarket';
  const oldContent=document.getElementById(unused);
  if(oldContent){
   oldContent.hidden=true;
   oldContent.setAttribute('inert','');
   oldContent.setAttribute('aria-hidden','true');
  }
  const intelligence=document.getElementById('injIntelligenceMain');
  if(intelligence){
   intelligence.hidden=true;
   intelligence.setAttribute('inert','');
   intelligence.setAttribute('aria-hidden','true');
  }
  const headingSuffix=document.getElementById('injIntelHeaderSuffix');
  if(headingSuffix)headingSuffix.hidden=true;
 }
 const KEY='inj_node_crypto_layout_v1';
 const readMode=()=>{try{return localStorage.getItem(KEY)==='heatmap'?'heatmap':'list'}catch(_){return 'list'}};
 const switcher=document.getElementById('injGlobalCryptoLayoutSwitch');
 if(switcher)switcher.hidden=type!=='crypto';
 const modes=switcher?.querySelectorAll('[data-global-crypto-mode]')||[];
 const selectedMode=()=>root.dataset.marketSection==='heatmap'?'heatmap':'list';
 function sync(){
  const mode=selectedMode();
  for(const button of modes){
   const on=button.dataset.globalCryptoMode===mode;
   button.setAttribute('aria-pressed',String(on));
   button.classList.toggle('is-selected',on);
  }
  const en=root.lang==='en';
  const listButton=switcher?.querySelector('[data-global-crypto-mode="list"]');
  if(listButton)listButton.textContent=en?'List':'Lista';
  switcher?.querySelector('[data-crypto-switch-label]')?.replaceChildren(document.createTextNode(en?'VIEW':'VISUALIZZAZIONE'));
  const title=document.getElementById('marketTitle');
  if(type==='intel'&&title)title.textContent='INJ Intelligence';
  if(type==='world'&&title)title.textContent='Global Market';
  if(type==='crypto'){
   document.getElementById('marketTitle')?.replaceChildren(document.createTextNode('Global Crypto'));
   const head=document.getElementById('marketHeading');
   if(head)head.textContent='Global Crypto';
  }
 }
 function cryptoMode(mode){
  if(type!=='crypto'||!['list','heatmap'].includes(mode))return;
  try{localStorage.setItem(KEY,mode)}catch(_){}
  route(mode==='heatmap'?'heatmap':'global');
  sync();
 }
 switcher?.addEventListener('click',event=>{
  const b=event.target.closest('[data-global-crypto-mode]');
  if(b)cryptoMode(b.dataset.globalCryptoMode);
 });
 if(type==='world')route('world');
 else if(type==='crypto')route(readMode()==='heatmap'?'heatmap':'global');
 else if(type==='intel')route('intel');
 sync();
 const observer=new MutationObserver(sync);
 observer.observe(root,{attributes:true,attributeFilter:['data-market-section','lang']});
 window.addEventListener('message',event=>{
  if(event.origin===location.origin&&event.data?.type==='injnode:market:language')
   requestAnimationFrame(sync);
 });
 window.addEventListener('pageshow',sync);
})();
