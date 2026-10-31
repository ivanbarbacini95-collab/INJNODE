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
    {id:'charts',it:'Live Charts',en:'Live Charts',page:'./live-charts.html'},
    {id:'book',it:'Order Book',en:'Order Book',page:'./order-book.html'},
    {id:'performance',it:'Performance',en:'Performance',launcher:'entryPerformanceButton'}
  ];
  const panel=document.createElement('section');
  panel.id='injMarketTabPanel';
  panel.className='inj-market-tab-panel';
  panel.hidden=true;
  panel.setAttribute('aria-label','Market');
  const head=document.createElement('header');
  head.className='inj-market-tab-head';
  head.id='injMarketTabHead';
  head.hidden=true;
  const kicker=document.createElement('span');
  kicker.className='inj-market-tab-kicker';
  kicker.textContent='INJ NODE / MARKET';
  const rail=document.createElement('nav');
  rail.className='inj-market-tab-rail';
  rail.setAttribute('aria-label','Sezioni Market');
  const buttons=new Map();
  const english=()=>{try{return root.lang==='en'||localStorage.getItem('inj_node_language_v1')==='en'}catch(_){return root.lang==='en'}};
  for(const item of destinations){
    const button=document.createElement('button');
    button.type='button';
    button.className='inj-market-tab-link';
    button.dataset.marketDestination=item.id;
    if(item.entry||item.page)button.setAttribute('aria-controls','injMarketTabFrame');
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
  panel.append(content);
  document.body.append(head,panel);

  let selected='world',lastMarketEntry='world',currentUrl='',wasMarket=false;
  let modalPending=false,modalWasOpened=false;

  /* Immersive Market chrome: shared across World, Crypto, Events, Charts,
     Order Book and Performance. Real taps only; live price ticks never reset
     the timer. Both bars return together after the first interaction. */
  const IDLE_HIDE_MS=5500;
  let idleTimer=0,resizeTimer=0;
  let lastWheelReveal=0;
  const scheduleLayoutUpdate=()=>{
    const update=()=>{
      if(!isMarket())return;
      window.dispatchEvent(new Event('resize'));
      try{frame.contentWindow?.dispatchEvent(new Event('resize'))}catch(_){}
    };
    requestAnimationFrame(update);
    clearTimeout(resizeTimer);
    resizeTimer=window.setTimeout(update,390);
  };
  function setChrome(visible){
    if(!isMarket())return;
    const desired=visible?'shown':'hidden';
    if(root.dataset.injMarketChrome===desired)return;
    root.dataset.injMarketChrome=desired;
    scheduleLayoutUpdate();
  }
  function armIdle(){
    clearTimeout(idleTimer);
    if(!isMarket()||document.hidden)return;
    idleTimer=window.setTimeout(()=>{
      if(!isMarket()||document.hidden)return;
      // Keep navigation available while the user is selecting a tab, or when
      // any modal panel/input is active. Idle otherwise means hands-free view.
      if(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')){
        armIdle();
        return;
      }
      setChrome(false);
    },IDLE_HIDE_MS);
  }
  function registerActivity(){
    if(!isMarket())return;
    setChrome(true);
    armIdle();
  }
  function wheelActivity(){
    const now=Date.now();
    if(now-lastWheelReveal<90)return;
    lastWheelReveal=now;
    registerActivity();
  }
  // The Market panel and native Performance live in this document; standalone
  // charts/book live in same-origin frames, so attach inside those as well.
  document.addEventListener('pointerdown',registerActivity,{capture:true,passive:true});
  document.addEventListener('touchstart',registerActivity,{capture:true,passive:true});
  document.addEventListener('keydown',registerActivity,{capture:true});
  document.addEventListener('wheel',wheelActivity,{capture:true,passive:true});
  function frameActivity(){
    try{
      const doc=frame.contentDocument;
      if(!doc)return;
      doc.addEventListener('pointerdown',registerActivity,{capture:true,passive:true});
      doc.addEventListener('touchstart',registerActivity,{capture:true,passive:true});
      doc.addEventListener('keydown',registerActivity,{capture:true});
      doc.addEventListener('wheel',wheelActivity,{capture:true,passive:true});
    }catch(_){}
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)clearTimeout(idleTimer);
    else if(isMarket())registerActivity();
  });
  window.addEventListener('focus',()=>{if(isMarket())registerActivity()});

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
      try{
        frame.contentWindow.postMessage({type:'injnode:market:language',language:en?'en':'it'},location.origin);
        frame.contentWindow.postMessage({type:'injnode:languagechange',language:en?'en':'it'},location.origin);
      }catch(_){}
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
  function showPage(item){
    lastMarketEntry=item.id;
    const en=english();
    const url=new URL(item.entry?'./market.html':item.page,document.baseURI);
    if(item.entry){
      url.searchParams.set('entry',item.entry);
      url.searchParams.set('lang',en?'en':'it');
      url.searchParams.set('v','20261031marketnav2');
    }else url.searchParams.set('v','16.00.14');
    const source=url.href;
    if(source!==currentUrl){
      currentUrl=source;
      content.classList.remove('is-ready');
      frame.title=en?item.en:item.it;
      frame.src=source;
    }
  }
  function dismissNativeView(){
    const events=document.getElementById('injMarketEventsOverlay');
    if(events&&!events.hidden){
      if(!document.getElementById('injEventsResultBackdrop')?.hidden)
        document.getElementById('injEventsResultClose')?.click();
      document.getElementById('injEventsClose')?.click();
    }
    const performance=document.getElementById('performanceTimelineView');
    if(performance&&!performance.hidden)
      document.getElementById('closePerformanceTimelineButton')?.click();
  }
  function navigate(id,scrollButton=false){
    if(!isMarket())return;
    const item=destinations.find(x=>x.id===id);
    if(!item)return;
    if(modalPending&&modalOpen()){
      if(id!==selected){
        dismissNativeView();
        window.setTimeout(()=>{if(isMarket())navigate(id,scrollButton)},240);
      }
      return;
    }
    updateSelection(id,scrollButton);
    registerActivity();
    if(item.entry||item.page){
      modalPending=false;
      content.hidden=false;
      showPage(item);
      return;
    }
    // Use the original launchers, keeping all wallet, market and event logic.
    // After closing their immersive view, the Market rail restores the
    // previously displayed Global Market or Global Crypto without reloading.
    modalPending=true;
    modalWasOpened=false;
    const launcher=document.getElementById(item.launcher);
    if(item.id==='events')launcher?.click();
    else window.INJ_MARKET_OPEN_NATIVE?.(item.id);
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
      if(frame.contentWindow.location.pathname!==new URL(currentUrl).pathname)return;
      if(frame.src!==currentUrl)return;
    }catch(_){return}
    content.classList.add('is-ready');
    frameActivity();
    scheduleLayoutUpdate();
    // Standalone charts and book already have a Home control; keep its click
    // inside the parent tab instead of following iframe history/back.
    for(const id of ['liveChartsBack','bookBack']){
      frame.contentDocument?.getElementById(id)?.addEventListener('click',event=>{
        event.preventDefault();event.stopImmediatePropagation();
        window.INJ_BOTTOM_NAV?.select('home');
      },true);
    }
    refreshLanguage();
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    if(['injnode:market:home','injnode:section:home'].includes(event.data?.type))
      window.INJ_BOTTOM_NAV?.select('home');
  });
  function syncTab(){
    const now=isMarket();
    panel.hidden=!now;
    head.hidden=!now;
    panel.setAttribute('aria-hidden',String(!now));
    if(now&&!wasMarket){
      root.dataset.injMarketChrome='shown';
      armIdle();
      lastMarketEntry='world';
      modalPending=false;
      updateSelection('world',false);
      showPage(destinations[0]);
    }else if(!now&&wasMarket){
      clearTimeout(idleTimer);
      root.removeAttribute('data-inj-market-chrome');
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
  // Changing one of the five primary destinations must also close native
  // Market overlays, otherwise Performance could remain painted above Home.
  dock.addEventListener('click',event=>{
    const tab=event.target.closest('[data-inj-tab]');
    if(!tab||!isMarket())return;
    if(tab.dataset.injTab!=='mercato'){
      if(modalOpen())dismissNativeView();
      clearTimeout(idleTimer);
    }else if(!modalOpen())navigate('world',false);
  },true);
  window.addEventListener('injnode:languagechange',refreshLanguage);
  window.addEventListener('storage',event=>{if(event.key==='inj_node_language_v1')refreshLanguage()});
  window.addEventListener('pageshow',()=>{refreshLanguage();syncTab()});
  window.INJ_MARKET_TAB={select:navigate,active:()=>selected};
  refreshLanguage();
  syncTab();
})();