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
  let chartPrice=null;
  const english=()=>{try{return root.lang==='en'||localStorage.getItem('inj_node_language_v1')==='en'}catch(_){return root.lang==='en'}};
  for(const item of destinations){
    const button=document.createElement('button');
    button.type='button';
    button.className='inj-market-tab-link';
    button.dataset.marketDestination=item.id;
    if(item.entry||item.page)button.setAttribute('aria-controls','injMarketTabFrame');
    const label=document.createElement('span');
    label.className='inj-market-tab-label';
    label.textContent=english()?item.en:item.it;
    button.appendChild(label);
    if(item.id==='charts'){
      chartPrice=document.createElement('span');
      chartPrice.className='inj-market-tab-price';
      chartPrice.textContent='—';
      chartPrice.setAttribute('aria-hidden','true');
      button.appendChild(chartPrice);
    }
    button.addEventListener('click',()=>navigate(item.id,true));
    rail.appendChild(button);
    buttons.set(item.id,button);
  }
  // The only route back to Home while Market is open. Keep it pinned
  // beside the horizontal destination rail, not inside its scroll surface.
  const homeLink=document.createElement('button');
  homeLink.type='button';
  homeLink.id='injMarketHomeLink';
  homeLink.className='inj-market-home-link';
  homeLink.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 10 8.5-7 8.5 7v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10"/><path d="M9 21v-8h6v8"/></svg>';
  homeLink.addEventListener('click',()=>{
    if(!isMarket())return;
    if(modalOpen())dismissNativeView();
    window.INJ_BOTTOM_NAV?.select('home');
  });
  const topRow=document.createElement('div');
  topRow.className='inj-market-tab-row';
  topRow.append(homeLink,rail);
  head.append(kicker,topRow);
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

  /* Market's upper rail remains permanently visible; no idle hide. */
  let resizeTimer=0;
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
  function registerActivity(){
    if(!isMarket()||root.dataset.injMarketChrome==='shown')return;
    root.dataset.injMarketChrome='shown';
    scheduleLayoutUpdate();
  }

  const isMarket=()=>root.dataset.injHomeTab==='mercato';
  const modalOpen=()=>document.body.classList.contains('inj-section-open')||
    !document.getElementById('injMarketEventsOverlay')?.hidden||
    !document.getElementById('performanceTimelineView')?.hidden;
  function refreshLanguage(){
    const en=english();
    rail.setAttribute('aria-label',en?'Market sections':'Sezioni Market');
    homeLink.setAttribute('aria-label',en?'Return to Home':'Torna alla Home');
    homeLink.setAttribute('title',en?'Home':'Home');
    panel.setAttribute('aria-label',en?'Market':'Mercato');
    for(const item of destinations){
      const label=buttons.get(item.id)?.querySelector('.inj-market-tab-label');
      if(label)label.textContent=en?item.en:item.it;
    }
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
    url.searchParams.set('embed','market');
    if(item.entry){
      url.searchParams.set('entry',item.entry);
      url.searchParams.set('lang',en?'en':'it');
      url.searchParams.set('v','20261031marketcompact2');
    }else url.searchParams.set('v','20261031marketcompact2');
    const source=url.href;
    if(source!==currentUrl){
      currentUrl=source;
      content.classList.remove('is-ready');
      frame.title=en?item.en:item.it;
      if(item.id==='charts'&&chartPrice)chartPrice.textContent='—';
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
    // These are embedded destinations inside Market, not independent
    // standalone screens: remove only their legacy Home/Back button.
    try{
      const inner=frame.contentDocument;
      if(inner&&!inner.getElementById('injMarketEmbeddedNoBack')){
        const style=inner.createElement('style');
        style.id='injMarketEmbeddedNoBack';
        style.textContent='#marketBack,#liveChartsBack,#bookBack{display:none!important;visibility:hidden!important;pointer-events:none!important}';
        (inner.head||inner.documentElement).appendChild(style);
      }
    }catch(_){}
    content.classList.add('is-ready');
    // Embedded charts keep the indicator/focus actions inside the timeframe rail.
    try{
      const inner=frame.contentDocument;
      if(inner?.documentElement.dataset.injPage==='live-charts'){
        const bar=inner.getElementById('timeframeBar');
        if(bar&&!bar.querySelector('.market-embedded-chart-actions')){
          const actions=inner.createElement('span');
          actions.className='market-embedded-chart-actions';
          for(const id of ['indicatorToggle','focusToggle']){
            const control=inner.getElementById(id);
            if(control)actions.appendChild(control);
          }
          bar.appendChild(actions);
        }
      }
    }catch(_){}
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
    if(event.data?.type==='injnode:market:chart-price'&&selected==='charts'){
      const value=Number(event.data.value);
      if(chartPrice&&Number.isFinite(value)&&value>0){
        const digits=value<10?4:value<100?3:2;
        chartPrice.textContent='$'+value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
      }
      return;
    }
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

      lastMarketEntry='world';
      modalPending=false;
      updateSelection('world',false);
      showPage(destinations[0]);
    }else if(!now&&wasMarket){

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

    }else if(!modalOpen())navigate('world',false);
  },true);
  window.addEventListener('injnode:languagechange',refreshLanguage);
  window.addEventListener('storage',event=>{if(event.key==='inj_node_language_v1')refreshLanguage()});
  window.addEventListener('pageshow',()=>{refreshLanguage();syncTab()});
  window.INJ_MARKET_TAB={select:navigate,active:()=>selected};
  refreshLanguage();
  syncTab();
})();