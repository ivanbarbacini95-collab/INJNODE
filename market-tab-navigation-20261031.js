/* INJ Node · Market direct tab with a horizontally scrollable destination rail.
   The existing Market, Events, Live Charts, Order Book and Performance engines
   remain authoritative. No new market feed, chart engine or wallet state. */
(()=>{
  'use strict';
  const root=document.documentElement;
  const gate=document.getElementById('entryGate');
  const dock=document.getElementById('injPrimaryBottomNav');
  if(!gate||!dock||document.getElementById('injMarketTabPanel'))return;

  const destinations=[
    {id:'world',it:'Global Market',en:'Global Market',entry:'world'},
    {id:'crypto',it:'Global Crypto',en:'Global Crypto',entry:'crypto'},
    {id:'events',it:'Market Event',en:'Market Events',launcher:'entryMacroCalendarButton'},
    {id:'charts',it:'Live Charts',en:'Live Charts',launcher:'entryLiveChartsButton'},
    {id:'book',it:'Order Book',en:'Order Book',launcher:'entryOrderBookButton'},
    {id:'performance',it:'Performance',en:'Performance',launcher:'entryPerformanceButton'}
  ];
  const panel=document.createElement('section');
  panel.id='injMarketTabPanel';
  panel.className='inj-market-tab-panel';
  panel.hidden=true;
  panel.setAttribute('aria-label','Market');
  const head=document.createElement('header');
  head.className='inj-market-tab-head';
  const kicker=document.createElement('span');
  kicker.className='inj-market-tab-kicker';
  kicker.textContent='INJ NODE / MARKET';
  const rail=document.createElement('nav');
  rail.className='inj-market-tab-rail';
  rail.setAttribute('aria-label','Sezioni Market');
  const buttons=new Map();
  const english=()=>root.lang==='en'||localStorage.getItem('inj_node_language_v1')==='en';
  for(const item of destinations){
    const button=document.createElement('button');
    button.type='button';
    button.className='inj-market-tab-link';
    button.dataset.marketDestination=item.id;
    button.setAttribute('aria-controls','injMarketTabFrame');
    button.textContent=english()?item.en:item.it;
    button.addEventListener('click',()=>navigate(item.id,true));
    rail.appendChild(button);
    buttons.set(item.id,button);
  }
  head.append(kicker,rail);
  const content=document.createElement('div');
  content.className='inj-market-tab-content';
  const loading=document.createElement('div');
  loading.className='inj-market-tab-loading';
  loading.textContent='INJ NODE';
  const frame=document.createElement('iframe');
  frame.id='injMarketTabFrame';
  frame.className='inj-market-tab-frame';
  frame.title='Global Market';
  frame.setAttribute('loading','eager');
  frame.setAttribute('referrerpolicy','same-origin');
  content.append(loading,frame);
  panel.append(head,content);
  document.body.appendChild(panel);

  let selected='world',lastMarketEntry='world',currentUrl='',wasMarket=false;
  let modalPending=false,modalWasOpened=false;
  const isMarket=()=>root.dataset.injHomeTab==='mercato';
  const modalOpen=()=>document.body.classList.contains('inj-section-open')||
    !document.getElementById('injMarketEventsOverlay')?.hidden||
    !document.getElementById('performanceTimelineView')?.hidden;
  function refreshLanguage(){
    const en=english();
    rail.setAttribute('aria-label',en?'Market sections':'Sezioni Market');
    panel.setAttribute('aria-label',en?'Market':'Mercato');
    for(const item of destinations)buttons.get(item.id).textContent=en?item.en:item.it;
    if(currentUrl && frame.contentWindow){
      try{frame.contentWindow.postMessage({type:'injnode:market:language',language:en?'en':'it'},location.origin)}catch(_){}
    }
  }
  function updateSelection(id,scrollButton){
    selected=id;
    for(const [key,button] of buttons){
      const active=key===id;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
    if(scrollButton){
      buttons.get(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest',inline:'center'});
    }
  }
  function showMarket(entry){
    lastMarketEntry=entry;
    const en=english();
    const url=new URL('./market.html',document.baseURI);
    url.searchParams.set('entry',entry);
    url.searchParams.set('lang',en?'en':'it');
    url.searchParams.set('v','20261031marketnav1');
    const source=url.href;
    if(source!==currentUrl){
      currentUrl=source;
      content.classList.remove('is-ready');
      frame.title=entry==='crypto'?'Global Crypto':'Global Market';
      frame.src=source;
    }
  }
  function navigate(id,scrollButton=false){
    if(!isMarket())return;
    const item=destinations.find(x=>x.id===id);
    if(!item)return;
    if(modalPending&&modalOpen())return;
    updateSelection(id,scrollButton);
    if(item.entry){
      modalPending=false;
      content.hidden=false;
      showMarket(item.entry);
      return;
    }
    // Use the original launchers, keeping all wallet, market and event logic.
    // After closing their immersive view, the Market rail restores the
    // previously displayed Global Market or Global Crypto without reloading.
    modalPending=true;
    modalWasOpened=false;
    const launcher=document.getElementById(item.launcher);
    if(launcher)launcher.click();
    requestAnimationFrame(()=>{
      if(!modalPending)return;
      if(modalOpen())modalWasOpened=true;
      else{
        modalPending=false;
        updateSelection(lastMarketEntry,false);
      }
    });
  }
  frame.addEventListener('load',()=>{
    if(!currentUrl)return;
    try{
      if(!frame.contentWindow.location.pathname.endsWith('/market.html'))return;
      if(frame.contentWindow.location.href!==currentUrl)return;
    }catch(_){return}
    content.classList.add('is-ready');
    refreshLanguage();
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    if(event.data?.type==='injnode:market:home')window.INJ_BOTTOM_NAV?.select('home');
  });
  function syncTab(){
    const now=isMarket();
    panel.hidden=!now;
    panel.setAttribute('aria-hidden',String(!now));
    if(now&&!wasMarket){
      lastMarketEntry='world';
      modalPending=false;
      updateSelection('world',false);
      showMarket('world');
    }else if(!now&&wasMarket){
      modalPending=false;
      content.classList.remove('is-ready');
      currentUrl='';
      frame.removeAttribute('src'); // release market polling while outside Market
    }
    wasMarket=now;
  }
  // Switching bottom destinations changes only the tab and not browser
  // history. Re-entering Market opens the first destination every time.
  const rootObserver=new MutationObserver(syncTab);
  rootObserver.observe(root,{attributes:true,attributeFilter:['data-inj-home-tab']});
  const modalObserver=new MutationObserver(()=>{
    if(!modalPending)return;
    if(modalOpen()){modalWasOpened=true;return}
    if(modalWasOpened){
      modalPending=false;
      modalWasOpened=false;
      updateSelection(lastMarketEntry,false);
    }
  });
  modalObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  for(const id of ['injMarketEventsOverlay','performanceTimelineView']){
    const element=document.getElementById(id);
    if(element)modalObserver.observe(element,{attributes:true,attributeFilter:['hidden','class']});
  }
  dock.querySelector('[data-inj-tab="mercato"]')?.addEventListener('click',()=>{
    if(isMarket())navigate('world',false);
  });
  window.addEventListener('injnode:languagechange',refreshLanguage);
  window.addEventListener('storage',event=>{if(event.key==='inj_node_language_v1')refreshLanguage()});
  window.addEventListener('pageshow',()=>{refreshLanguage();syncTab()});
  window.INJ_MARKET_TAB={select:navigate,active:()=>selected};
  refreshLanguage();
  syncTab();
})();