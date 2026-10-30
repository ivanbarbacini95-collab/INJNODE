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
 // Each entry is a standalone screen, including INJ Intelligence.
 // Keep nonselected data modules mounted but hidden so handlers remain safe.
 if(type){
  document.getElementById('injIntelRoot')?.remove();
  const panels={intel:'injIntelligenceMain',world:'injWorldMarket',crypto:'injGlobalMarket'};
  for(const [kind,id] of Object.entries(panels)){
   if(kind===type)continue;
   const panel=document.getElementById(id);
   if(panel){panel.hidden=true;panel.inert=true;panel.setAttribute('aria-hidden','true')}
  }
  const suffix=document.getElementById('injIntelHeaderSuffix');
  if(suffix)suffix.hidden=true;
 }
 const KEY='inj_node_crypto_layout_v1';
 const readMode=()=>{try{return localStorage.getItem(KEY)==='heatmap'?'heatmap':'list'}catch(_){return 'list'}};
 const switcher=document.getElementById('injGlobalCryptoLayoutSwitch');
 if(switcher)switcher.hidden=type!=='crypto';
 const selectedMode=()=>root.dataset.marketSection==='heatmap'?'heatmap':'list';
 function sync(){
  const mode=selectedMode(),en=root.lang==='en';
  if(switcher){
   const next=mode==='heatmap'?'list':'heatmap',label=next==='list'?(en?'List':'Lista'):'Heatmap';
   const text=switcher.querySelector('[data-next-view]');
   if(text&&text.textContent!==label)text.textContent=label;
   switcher.setAttribute('aria-label',next==='list'?(en?'Switch to List':'Passa alla Lista'):(en?'Switch to Heatmap':'Passa alla Heatmap'));
   switcher.setAttribute('aria-pressed',String(mode==='heatmap'));
  }
  const title=document.getElementById('marketTitle');
  if(type==='intel'&&title)title.textContent='INJ Intelligence';
  if(type==='world'&&title)title.textContent='Global Market';
  if(type==='crypto'){
   const meta=document.getElementById('mpMetaTitle');
   if(meta)meta.innerHTML=(en?'CRYPTO MARKET':'MERCATO CRYPTO')+' <span>· 1D LIVE</span>';
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
 switcher?.addEventListener('click',()=>cryptoMode(selectedMode()==='heatmap'?'list':'heatmap'));
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
