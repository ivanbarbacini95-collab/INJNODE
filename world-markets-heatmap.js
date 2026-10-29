/* INJ Node · Global Markets Heatmap — official, lazily loaded TradingView widgets.
   No synthetic quotes, no undocumented scraping, no polling in INJ Node. */
(()=>{
 'use strict';
 const root=document.getElementById('injWorldMarket');
 const categories=document.getElementById('injWorldCategories');
 const stage=document.getElementById('injWorldStage');
 const title=document.getElementById('injWorldStageTitle');
 const detail=document.getElementById('injWorldStageDetail');
 const status=document.getElementById('injWorldStatus');
 if(!root||!categories||!stage||!title||!detail||!status)return;
 const en=()=>document.documentElement.lang==='en';
 const tr=(it,eng)=>en()?eng:it;
 const base='https://widgets.tradingview-widget.com/w/en/';
 const catalogs=[
  {id:'world',name:['Panoramica mondiale','World overview'],desc:['Indici principali per Paese · mappa interattiva','Leading indices by country · interactive map'],tag:'tv-world-market-summary',script:'tv-world-market-summary.js',attrs:{},height:580,link:'https://www.tradingview.com/markets/indices/'},
  {id:'equity',name:['Azioni e settori','Stocks & sectors'],desc:['S&P 500 · tecnologia, energia, salute e altri settori','S&P 500 · technology, energy, healthcare and more'],tag:'tv-heatmap',script:'tv-heatmap.js',attrs:{'heatmap-type':'stock','data-source':'SPX500','grouping':'sector','block-size':'market_cap_basic','block-color':'change'},height:620,link:'https://www.tradingview.com/heatmap/stock/'},
  {id:'etf',name:['ETF e asset class','ETFs & asset classes'],desc:['Azioni, obbligazioni, immobili e commodity tramite ETF','Equities, bonds, real estate and commodities via ETFs'],tag:'tv-heatmap',script:'tv-heatmap.js',attrs:{'heatmap-type':'etf','data-source':'AllUSEtf','grouping':'asset_class','block-size':'volume','block-color':'change'},height:620,link:'https://www.tradingview.com/heatmap/etf/'},
  {id:'forex',name:['Valute globali','Global currencies'],desc:['Forza relativa delle principali valute · heatmap giornaliera','Major currency relative strength · daily heatmap'],tag:'tv-forex-table',script:'tv-forex-table.js',attrs:{'displayed-value':'dailyChange','heatmap':''},height:530,link:'https://www.tradingview.com/markets/currencies/'},
  {id:'commodities',name:['Materie prime','Commodities'],desc:['Oro, petrolio, argento, gas e agricole · tabella quotazioni','Gold, oil, silver, gas and agriculture · quotes table'],tag:'tv-market-data',script:'tv-market-data.js',attrs:{'symbol-sectors':JSON.stringify([{sectionName:'Commodities',symbols:['CMCMARKETS:GOLD','TVC:SILVER','TVC:USOIL','TVC:UKOIL','NYMEX:NG1!','BMFBOVESPA:CCM1!']}])},height:580,link:'https://www.tradingview.com/markets/futures/'},
  {id:'bonds',name:['Obbligazioni e tassi','Bonds & rates'],desc:['Bund, BTP e scadenze governative · quotazioni','Bund, BTP and government bond benchmarks · quotes'],tag:'tv-market-data',script:'tv-market-data.js',attrs:{'symbol-sectors':JSON.stringify([{sectionName:'Bond futures',symbols:['EUREX:FGBL1!','EUREX:FBTP1!','EUREX:FGBM1!']},{sectionName:'Government yields',symbols:['TVC:US10Y','TVC:DE10Y']}])},height:560,link:'https://www.tradingview.com/markets/bonds/'},
  {id:'crypto',name:['Criptovalute','Cryptocurrencies'],desc:['Mercato crypto mondiale · Heatmap per capitalizzazione','Global crypto market · market-cap heatmap'],tag:'tv-heatmap',script:'tv-heatmap.js',attrs:{'heatmap-type':'crypto-coins','data-source':'Crypto','block-size':'market_cap_calc','block-color':'24h_close_change|5'},height:620,link:'https://www.tradingview.com/heatmap/crypto/'}
 ];
 const loaders=new Map();
 let active=false,selected='world',mounted=null;
 const load=script=>{
  if(loaders.has(script))return loaders.get(script);
  const p=new Promise((resolve,reject)=>{
   const el=document.createElement('script');
   el.type='module';el.src=base+script;
   el.onload=resolve;
   el.onerror=()=>reject(new Error('Widget unavailable'));
   document.head.appendChild(el);
  });
  loaders.set(script,p);return p;
 };
 function drawCategories(){
  categories.replaceChildren();
  catalogs.forEach(c=>{
   const b=document.createElement('button');
   b.type='button';b.className='inj-world-category';
   b.dataset.worldCategory=c.id;
   b.setAttribute('aria-pressed',String(c.id===selected));
   const name=document.createElement('strong');name.textContent=c.name[en()?1:0];
   const sub=document.createElement('small');sub.textContent=c.desc[en()?1:0];
   b.append(name,sub);
   b.addEventListener('click',()=>show(c.id));
   categories.append(b);
  });
 }
 function show(id){
  const c=catalogs.find(item=>item.id===id)||catalogs[0];selected=c.id;
  for(const b of categories.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.worldCategory===selected));
  title.textContent=c.name[en()?1:0];
  detail.textContent=c.desc[en()?1:0];
  status.textContent=tr('Fonte: TradingView · frequenza e ritardo dipendono dalla borsa','Source: TradingView · update rate and delay depend on the exchange');
  document.getElementById('injWorldProviderLink').href=c.link;
  stage.replaceChildren();
  const widget=document.createElement(c.tag);
  for(const [name,value] of Object.entries(c.attrs))widget.setAttribute(name,value);
  widget.setAttribute('locale',en()?'en':'it');
  widget.style.width='100%';widget.style.display='block';
  widget.style.minHeight=c.height+'px';
  stage.append(widget);
  mounted=c.id;
  load(c.script).catch(()=>{
   if(mounted!==c.id)return;
   stage.replaceChildren();
   const warning=document.createElement('p');
   warning.className='inj-world-error';
   warning.textContent=tr('Widget non disponibile. Apri la fonte per consultare i mercati.','Widget unavailable. Open the source to check the markets.');
   stage.append(warning);
  });
 }
 function languageChange(){
  document.getElementById('injWorldEyebrow').textContent='INJ NODE / WORLD MARKET TERMINAL';
  document.getElementById('injWorldHeading').textContent='Global Markets Heatmap';
  document.getElementById('injWorldIntro').textContent=tr('Un punto di osservazione sui mercati mondiali, diviso per categorie.','One observation point for worldwide financial markets, organised by category.');
  document.getElementById('injWorldDisclosure').textContent=tr('Quotazioni di terze parti: possono essere ritardate e non includere tutte le borse. Le categorie obbligazioni e materie prime mostrano strumenti rappresentativi, non il mercato completo.','Third-party quotes may be delayed and do not cover every exchange. Bonds and commodities show representative instruments, not the entire market.');
  document.getElementById('injWorldProviderLink').textContent=tr('Visualizza su TradingView ↗','View on TradingView ↗');
  drawCategories();
  if(active&&mounted!==null)show(selected);
 }
 function activate(next){
  active=!!next;root.hidden=!active;
  if(!active)return;
  languageChange();
  if(mounted===null)show(selected);
 }
 languageChange();
 window.addEventListener('storage',e=>{if(e.key==='inj_node_language_v1'&&active)languageChange()});
 window.INJ_WORLD_MARKETS={activate,languageChange};
})();