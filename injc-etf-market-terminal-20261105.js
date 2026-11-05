/* INJ Node · INJC market terminal · 2026-11-05
   No fabricated quotes or fund flows. All quote fields belong to ETF shares, not INJ spot.
   Yahoo v8 chart quotes can be delayed/limited; a GitHub Actions snapshot is fallback.
*/
(() => {
 'use strict';
 if(window.__injcMarketTerminal) return;
 window.__injcMarketTerminal=true;
 const $=id=>document.getElementById(id);
 const lang=()=>document.documentElement.lang==='en'?'en':'it';
 const tr=(it,en)=>lang()==='en'?en:it;
 const fmt=(v,d=2)=>{
   if(!Number.isFinite(v))return '—';
   return Number(v).toLocaleString(lang()==='en'?'en-US':'it-IT',{minimumFractionDigits:d,maximumFractionDigits:d});
 };
 const usd=v=>Number.isFinite(v)?'$'+fmt(v):'—';
 const count=v=>Number.isFinite(v)?fmt(v,0):'—';
 const shortUsd=v=>!Number.isFinite(v)?'—':Math.abs(v)>=1e9?'$'+fmt(v/1e9,2)+'B':Math.abs(v)>=1e6?'$'+fmt(v/1e6,2)+'M':Math.abs(v)>=1e3?'$'+fmt(v/1e3,1)+'K':usd(v);
 const numeric=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
 const tNY=date=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).reduce((a,p)=>(a[p.type]=p.value,a),{});
 const nyKey=date=>{const d=tNY(date);return d.year+'-'+d.month+'-'+d.day};
 const dayUTC=key=>new Date(key+'T12:00:00Z');
 const keyUTC=date=>date.toISOString().slice(0,10);
 function observed(year,month,day){
   const d=new Date(Date.UTC(year,month-1,day));
   if(d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()-1);
   if(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1);
   return keyUTC(d);
 }
 function nthWeekday(y,month,weekday,nth){
   const d=new Date(Date.UTC(y,month-1,1));
   d.setUTCDate(1+(weekday-d.getUTCDay()+7)%7+(nth-1)*7);
   return keyUTC(d);
 }
 function lastWeekday(y,month,weekday){
   const d=new Date(Date.UTC(y,month,0));
   d.setUTCDate(d.getUTCDate()-(d.getUTCDay()-weekday+7)%7);
   return keyUTC(d);
 }
 function easter(y){
   const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),
     g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,
     l=(32+2*e+2*i-h-k+49)%7,m=Math.floor((a+11*h+22*l)/451),
     month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
   return new Date(Date.UTC(y,month-1,day));
 }
 const holidayCache=new Map();
 function holidays(y){
   if(holidayCache.has(y))return holidayCache.get(y);
   const goodFriday=easter(y);goodFriday.setUTCDate(goodFriday.getUTCDate()-2);
   const dates=new Set([
     observed(y,1,1),observed(y+1,1,1),nthWeekday(y,1,1,3),nthWeekday(y,2,1,3),
     keyUTC(goodFriday),lastWeekday(y,5,1),observed(y,6,19),observed(y,7,4),
     nthWeekday(y,9,1,1),nthWeekday(y,11,4,4),observed(y,12,25)
   ]);
   holidayCache.set(y,dates);return dates;
 }
 function isTradingDay(key){
   const d=dayUTC(key),weekday=d.getUTCDay();
   return weekday!==0&&weekday!==6&&!holidays(d.getUTCFullYear()).has(key);
 }
 function dayCloseMinute(key){
   const d=dayUTC(key),y=d.getUTCFullYear();
   const thanksgiving=nthWeekday(y,11,4,4);
   const postThanksgiving=dayUTC(thanksgiving);postThanksgiving.setUTCDate(postThanksgiving.getUTCDate()+1);
   return key===keyUTC(postThanksgiving)||key===String(y)+'-12-24'?780:960;
 }
 function nyMinutes(date){
   const d=tNY(date);return (Number(d.hour)%24)*60+Number(d.minute);
 }
 function pointSession(timestamp){
   const d=new Date(timestamp),key=nyKey(d),minute=nyMinutes(d);
   if(!isTradingDay(key))return 'closed';
   if(minute>=240&&minute<570)return 'pre';
   if(minute>=570&&minute<dayCloseMinute(key))return 'regular';
   return 'post';
 }
 function marketState(){
   const now=new Date(),key=nyKey(now),minute=nyMinutes(now);
   if(!isTradingDay(key))return 'closed';
   if(minute>=570&&minute<dayCloseMinute(key))return 'open';
   if(minute>=240&&minute<570)return 'pre';
   return 'closed';
 }
 function nyOpenUtc(key){
   const [y,m,d]=key.split('-').map(Number),guess=new Date(Date.UTC(y,m-1,d,14,30));
   const tzPart=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(guess).find(p=>p.type==='timeZoneName')?.value||'GMT-5';
   const match=tzPart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
   const offset=match?(match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3]||0)):-300;
   return Date.UTC(y,m-1,d,9,30)-offset*60000;
 }
 function nextOpen(){
   const now=Date.now(),d=dayUTC(nyKey(new Date()));
   for(let i=0;i<16;i++){
     const key=keyUTC(d);
     if(isTradingDay(key)){
       const opening=nyOpenUtc(key);
       if(opening>now)return opening;
     }
     d.setUTCDate(d.getUTCDate()+1);
   }
   return null;
 }
 function countdownString(ms){
   if(ms===null||ms===undefined)return '—';
   const total=Math.max(0,Math.ceil(ms/1000)),days=Math.floor(total/86400),
     h=Math.floor(total%86400/3600),m=Math.floor(total%3600/60),sec=total%60;
   const time=[h,m,sec].map(x=>String(x).padStart(2,'0')).join(':');
   return days?days+tr('g ','d ')+time:time;
 }
 const fmtTime=ms=>new Date(ms).toLocaleTimeString(lang()==='en'?'en-US':'it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'America/New_York'});
 let timeframe='1d', busy=false, lastQuote=null, lastGoodAt=0, quoteSource='', graphPoints=[], refreshTimer=null, marketPulseTimer=null, flowsHistory=[], flowDayKey=null, plottedFlowsFirstTime=true;
 const ranges={ '1d':['1d','1m'],'5d':['5d','5m'],'1mo':['1mo','30m'],'3mo':['3mo','1d'],'1y':['1y','1d'] };
 function setText(id,value){const el=$(id);if(el)el.textContent=value;}
 function changeClass(id,value){const el=$(id);if(!el)return;el.classList.toggle('up',Number.isFinite(value)&&value>0);el.classList.toggle('down',Number.isFinite(value)&&value<0);}
 function status(value,extra){
   const pill=$('etfListingPill');
   if(pill){pill.dataset.state=value;pill.classList.toggle('is-live',value==='open'&&extra==='fresh');}
   let txt={open:tr('NASDAQ APERTO','NASDAQ OPEN'),pre:tr('PRE-MARKET','PRE-MARKET'),closed:tr('MERCATO CHIUSO','MARKET CLOSED')}[value];
   if(value==='open'&&extra==='pending')txt=tr('IN ATTESA DEI PRIMI SCAMBI','AWAITING FIRST TRADE');
   setText('etfListingBadge',txt);
   setText('etfMarketClock',tr('Nasdaq · 09:30–16:00 New York','Nasdaq · 9:30 AM–4:00 PM New York'));
 }
 function renderStatus(){
   const now=new Date(),state=marketState(),nowKey=nyKey(now);
   const current=Boolean(lastQuote?.quoteTime&&nyKey(new Date(lastQuote.quoteTime))===nowKey&&Date.now()-lastQuote.quoteTime<1200000);
   const fresh=Boolean(current&&Date.now()-lastGoodAt<180000);
   status(state,state==='open'&&lastQuote?.session!=='regular'?'pending':fresh?'fresh':'stale');
   if(!lastQuote)setText('etfQuoteFreshness',state==='pre'?tr('Pre-market · in attesa di scambi reali','Pre-market · awaiting actual trades'):tr('In attesa di una quotazione verificabile','Waiting for a verified market quote'));
   const count=$('etfOpenCountdown'),label=$('etfCountdownLabel');
   if(count&&label){
     const opening=nextOpen();
     count.textContent=opening?countdownString(opening-Date.now()):'—';
     label.textContent=tr('ALL’APERTURA DEL NASDAQ','UNTIL NASDAQ OPENS');
     const bar=$('etfCountdownBox');
     if(bar)bar.dataset.session=state;
     if(state==='open'){
       const minute=dayCloseMinute(nowKey);
       const closing=nyOpenUtc(nowKey)+(minute-570)*60000;
       count.textContent=countdownString(closing-Date.now());
       label.textContent=tr('ALLA CHIUSURA DEL NASDAQ','UNTIL NASDAQ CLOSE');
     }
   }
 }
 function yahooUrl(range,interval,host='query1.finance.yahoo.com'){
   const u='https://'+host+'/v8/finance/chart/INJC?range='+encodeURIComponent(range)+'&interval='+encodeURIComponent(interval)+'&includePrePost='+((range==='1d'||range==='5d')?'true':'false');
   return 'https://proxy.cors.dev/'+u;
 }
 async function getJson(url,timeout=12500){
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
   try {
     const res=await fetch(url,{signal:ctrl.signal,cache:'no-store',credentials:'omit',headers:{accept:'application/json'}});
     if(!res.ok)throw Error('HTTP '+res.status);
     return await res.json();
   }finally{clearTimeout(timer);}
 }
 function parseYahoo(json){
   const obj=json?.chart?.result?.[0];if(!obj||json?.chart?.error)throw Error('Quote not ready');
   const meta=obj.meta||{},q=obj.indicators?.quote?.[0]||{},ts=obj.timestamp||[];
   const raw=ts.map((time,i)=>({time:Number(time)*1000,close:numeric(q.close?.[i]),open:numeric(q.open?.[i]),high:numeric(q.high?.[i]),low:numeric(q.low?.[i]),volume:numeric(q.volume?.[i])}))
     .filter(p=>Number.isFinite(p.time)&&p.time>0&&Number.isFinite(p.close)&&p.close>0)
     .map(p=>({...p,session:pointSession(p.time)}));
   if(!raw.length)throw Error('No confirmed ETF trades');
   const nowKey=nyKey(new Date()),dayRaw=raw.filter(p=>nyKey(new Date(p.time))===nowKey);
   const dayRegular=dayRaw.filter(p=>p.session==='regular'),dayPre=dayRaw.filter(p=>p.session==='pre');
   const session=dayRegular.length?'regular':dayPre.length?'pre':'regular';
   const points=timeframe==='1d'?(dayRegular.length||dayPre.length?dayRaw.filter(p=>p.session==='regular'||p.session==='pre'):raw.filter(p=>p.session==='regular')):raw.filter(p=>p.session==='regular');
   const selected=(session==='pre'?dayPre.at(-1):dayRegular.at(-1))??raw.filter(p=>p.session==='regular').at(-1)??raw.at(-1);
   // A real extended-hours trade is required: never substitute a regular-market close for a fictitious pre-market quote.
   let price=selected?.close,quoteTime=selected?.time;
   if(session==='pre'&&dayPre.length){
     const prePrice=numeric(meta.preMarketPrice),preTime=Number(meta.preMarketTime)*1000;
     if(Number.isFinite(prePrice)&&prePrice>0&&Number.isFinite(preTime)&&preTime>quoteTime&&nyKey(new Date(preTime))===nowKey){
       price=prePrice;quoteTime=preTime;
       if(timeframe==='1d')points.push({...selected,time:preTime,close:prePrice,session:'pre'});
     }
   } else if(session==='regular'){
     const regularTime=Number(meta.regularMarketTime)*1000,regularPrice=numeric(meta.regularMarketPrice);
     if(Number.isFinite(regularTime)&&Number.isFinite(regularPrice)&&regularPrice>0&&regularTime>quoteTime&&pointSession(regularTime)==='regular'){
       price=regularPrice;quoteTime=regularTime;
       if(timeframe==='1d')points.push({...selected,time:regularTime,close:regularPrice,session:'regular'});
     }
   }
   if(!Number.isFinite(price)||price<=0||!Number.isFinite(quoteTime))throw Error('No valid ETF prints');
   const previous=numeric(meta.chartPreviousClose)??numeric(meta.previousClose);
   const volume=dayRegular.length?(numeric(meta.regularMarketVolume)??dayRegular.reduce((sum,p)=>sum+(p.volume??0),0)):null;
   const dayHigh=dayRegular.length?(numeric(meta.regularMarketDayHigh)??Math.max(...dayRegular.map(p=>p.high??p.close))):null;
   const dayLow=dayRegular.length?(numeric(meta.regularMarketDayLow)??Math.min(...dayRegular.map(p=>p.low??p.close))):null;
   return {price,previous,change:Number.isFinite(previous)&&previous>0?(price-previous)/previous*100:null,quoteTime,
     open:dayRegular[0]?.open??null,high:dayHigh,low:dayLow,volume,points,
     session:dayPre.length&&!dayRegular.length?'pre':'regular',currency:meta.currency||'USD',isDelayed:true,updatedAt:Date.now()};
 }
 function parseSnapshot(data){
   if(data?.schemaVersion!==1||data?.ticker!=='INJC'||!data?.quote)throw Error('No valid backup');
   const q=data.quote,price=numeric(q.price),quoteTime=Date.parse(q.quoteTime);
   if(!Number.isFinite(price)||price<=0||!Number.isFinite(quoteTime))throw Error('Backup not traded');
   const points=(data.points||[]).map(p=>({time:Date.parse(p.time),close:numeric(p.close),open:numeric(p.open),high:numeric(p.high),low:numeric(p.low),volume:numeric(p.volume)}))
     .filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.close)&&p.close>0).map(p=>({...p,session:pointSession(p.time)}));
   return {price,quoteTime,previous:numeric(q.previous),change:numeric(q.change),open:numeric(q.open),high:numeric(q.high),low:numeric(q.low),volume:numeric(q.volume),points,session:q.session||pointSession(quoteTime),isDelayed:true,updatedAt:Date.parse(data.generatedAt)||0};
 }
 async function getQuote(){
   const [range,interval]=ranges[timeframe];
   const urls=[yahooUrl(range,interval),yahooUrl(range,interval,'query2.finance.yahoo.com')];
   let lastError;
   for(const url of urls){
     try{return {data:parseYahoo(await getJson(url)),source:'Yahoo Finance · '+tr('dato potenzialmente ritardato','potentially delayed')}}catch(e){lastError=e}
   }
   try{
     // Static same-origin fallback, updated by GitHub Actions when the quote is available.
     const snap=await getJson('./market-data/injc-etf-quotes.json?t='+Date.now(),8000);
     return {data:parseSnapshot(snap),source:tr('Backup mercato · dato ritardato','Market backup · delayed')};
   }catch(e){throw lastError||e}
 }
 function drawGraph(){
   const wrap=$('etfSvgWrap');if(!wrap)return;
   if(!graphPoints.length){
     wrap.replaceChildren();
     $('etfChartWaiting')?.classList.remove('hidden');
     return;
   }
   $('etfChartWaiting')?.classList.add('hidden');
   const prices=graphPoints.map(p=>p.close),min=Math.min(...prices),max=Math.max(...prices),
        pad=Math.max((max-min)*.15,max*.0008,.00001),lo=min-pad,hi=max+pad;
   const w=1000,h=350,left=14,right=18,top=22,bottom=38;
   const x=i=>left+(w-left-right)*i/Math.max(graphPoints.length-1,1);
   const y=v=>top+(h-top-bottom)*(hi-v)/Math.max(hi-lo,.00001);
   const path=graphPoints.map((p,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(p.close).toFixed(2)).join(' ');
   const fill=path+' L '+x(graphPoints.length-1)+' '+(h-bottom)+' L '+x(0)+' '+(h-bottom)+' Z';
   const gain=graphPoints.at(-1).close>=graphPoints[0].close;
   const color=gain?'#45c996':'#f4777f';
   let grids='';
   for(let i=0;i<4;i++){const yy=top+(h-top-bottom)*i/3;grids+='<line x1="'+left+'" y1="'+yy+'" x2="'+(w-right)+'" y2="'+yy+'" stroke="currentColor" stroke-opacity=".12" stroke-dasharray="3 8"/><text x="'+(w-right)+'" y="'+(yy-5)+'" text-anchor="end" fill="currentColor" opacity=".57" font-size="12">'+fmt(hi-(hi-lo)*i/3,2)+'</text>';}
   const dates=[0,Math.round((graphPoints.length-1)/2),graphPoints.length-1].map(i=>'<text x="'+x(i)+'" y="'+(h-10)+'" fill="currentColor" opacity=".52" font-size="12" text-anchor="'+(i===0?'start':i===graphPoints.length-1?'end':'middle')+'">'+(timeframe==='1d'?fmtTime(graphPoints[i].time):new Date(graphPoints[i].time).toLocaleDateString(lang()==='en'?'en-US':'it-IT',{month:'short',day:'numeric'}))+'</text>').join('');
   wrap.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" role="img" aria-label="'+tr('Grafico storico della quotazione INJC','INJC market price history')+'"><defs><linearGradient id="injcGraphFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+color+'" stop-opacity=".23"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'+grids+'<path d="'+fill+'" fill="url(#injcGraphFill)"/><path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="'+x(graphPoints.length-1)+'" cy="'+y(prices.at(-1))+'" r="5" fill="'+color+'"/>'+dates+'</svg>';
   setText('etfChartDataLabel',tr('Dati di mercato · '+graphPoints.length+' punti','Market data · '+graphPoints.length+' points'));
 }
 function displayQuote(data,source){
   const prevTime=lastQuote?.quoteTime||0;
   if(prevTime&&data.quoteTime<prevTime&&timeframe==='1d')return;
   lastQuote=data;quoteSource=source;lastGoodAt=Date.now();
   setText('etfQuotePrice',usd(data.price));
   setText('etfQuoteChange',Number.isFinite(data.change)?(data.change>0?'+':'')+fmt(data.change,2)+'%':'—');
   changeClass('etfQuoteChange',data.change);
   setText('etfQuoteDelta',Number.isFinite(data.previous)?(data.price-data.previous>=0?'+':'')+usd(data.price-data.previous)+' '+tr('vs chiusura prec.','vs previous close'):'—');
   changeClass('etfQuoteDelta',data.price-data.previous);
   setText('etfQuoteFreshness',source+' · '+tr('ultima transazione','last trade')+' '+fmtTime(data.quoteTime)+' NY');
   setText('etfVolume',count(data.volume));
   setText('etfNotional',Number.isFinite(data.volume)?shortUsd(data.volume*data.price):'—');
   setText('etfDayHigh',usd(data.high));setText('etfDayLow',usd(data.low));
   setText('etfDayOpen',usd(data.open));setText('etfPreviousClose',usd(data.previous));
   setText('etfVolumeFootnote',tr('Volumi di quota, non acquisti netti. Controvalore indicativo = volume × ultimo prezzo.','Share volume, not net fund purchases. Indicative turnover = shares × last price.'));
   graphPoints=data.points;
   drawGraph();
   renderStatus();
 }
 async function refreshMarket(){
   if(busy||document.hidden)return;
   busy=true;
   setText('etfSyncLabel',tr('SINCRONIZZAZIONE','SYNCING'));
   try{
     const incoming=await getQuote();
     displayQuote(incoming.data,incoming.source);
     setText('etfSyncLabel',tr('AGGIORNATO','UPDATED'));
   }catch(err){
     // Never erase a last-known real quote, but clearly identify a failed live update.
     if(lastQuote){
       setText('etfSyncLabel',tr('FEED NON DISPONIBILE','FEED UNAVAILABLE'));
       setText('etfQuoteFreshness',tr('Ultimo dato disponibile · aggiornamento non riuscito','Last available quote · update failed')+' · '+fmtTime(lastQuote.quoteTime)+' NY');
     }else{
       setText('etfSyncLabel',tr('IN ATTESA','PENDING'));
       setText('etfQuoteFreshness',tr('Nessun primo scambio disponibile dal provider · riprova automaticamente','No first trade available from the provider · automatic retry'));
     }
     renderStatus();
   }finally{busy=false}
 }
 function renderFlows(){
   const today=nyKey(new Date());
   const valid=flows&&flows.date===today&&Number.isFinite(flows.inflowUsd)&&Number.isFinite(flows.outflowUsd);
   const incoming=valid?flows.inflowUsd:null,outgoing=valid?flows.outflowUsd:null,net=valid?incoming-outgoing:null;
   setText('etfInflowValue',shortUsd(incoming));setText('etfOutflowValue',shortUsd(outgoing));
   setText('etfNetFlow',Number.isFinite(net)?(net>0?'+':'')+shortUsd(net):'—');
   changeClass('etfNetFlow',net);
   const max=Math.max(incoming||0,outgoing||0);
   $('etfInflowBar').style.width=valid&&max>0?(100*incoming/max).toFixed(1)+'%':'0%';
   $('etfOutflowBar').style.width=valid&&max>0?(100*outgoing/max).toFixed(1)+'%':'0%';
   setText('etfFlowVerified',valid
     ?tr('Flussi del fondo · '+flows.date+' · fonte verificata','Fund flows · '+flows.date+' · verified source')
     :tr('Non pubblicati / non verificati · aggiornamento giornaliero, non tick-by-tick','Not published / unverified · daily reporting, not tick-by-tick'));
   $('etfFlowsSource').hidden=!(valid&&flows.source);
   if(valid&&flows.source)$('etfFlowsSource').href=flows.source;
 }
 async function refreshFlows(){
   try{
     const data=await getJson('./market-data/injc-etf-flows.json?t='+Date.now(),8000);
     // Only accept a source-backed, dated fund-creation/redemption flow report;
     // secondary market buy/sell volume is NOT an ETF inflow/outflow.
     if(data?.ticker==='INJC'&&/^\d{4}-\d\d-\d\d$/.test(data.date)
       &&/^https:\/\//.test(data.source||'')&&data.verified===true
       &&Number.isFinite(Number(data.inflowUsd))&&Number.isFinite(Number(data.outflowUsd))
       &&Number(data.inflowUsd)>=0&&Number(data.outflowUsd)>=0){
       flows={date:data.date,source:data.source,inflowUsd:Number(data.inflowUsd),outflowUsd:Number(data.outflowUsd)};
     }
   }catch(_){/* Missing certified flow feed is normal on IPO day. */}
   renderFlows();
 }
 function advancedChart(){
   const el=$('etfAdvancedChart');
   if(!el||!el.hidden)return;
   el.hidden=false;el.innerHTML='';
   const wrap=document.createElement('div');wrap.className='tradingview-widget-container';wrap.style.cssText='height:430px;width:100%';
   const inner=document.createElement('div');inner.className='tradingview-widget-container__widget';inner.style.cssText='height:100%;width:100%';wrap.appendChild(inner);
   const script=document.createElement('script');script.async=true;script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
   script.textContent=JSON.stringify({autosize:true,symbol:'NASDAQ:INJC',interval:'5',timezone:'America/New_York',theme:document.documentElement.dataset.theme==='light'?'light':'dark',style:'1',locale:lang(),hide_top_toolbar:false,hide_side_toolbar:true,allow_symbol_change:false,calendar:false,support_host:'https://www.tradingview.com'});
   wrap.appendChild(script);el.appendChild(wrap);
   setText('etfAdvancedButton',tr('CHIUDI GRAFICO AVANZATO','CLOSE ADVANCED CHART'));
 }
 function bind(){
   document.querySelectorAll('[data-etf-range]').forEach(b=>b.addEventListener('click',()=>{
      timeframe=b.dataset.etfRange;
      document.querySelectorAll('[data-etf-range]').forEach(btn=>{btn.classList.toggle('active',btn===b);btn.setAttribute('aria-pressed',String(btn===b))});
      graphPoints=[];drawGraph();refreshMarket();
   }));
   $('etfRefresh')?.addEventListener('click',()=>{refreshMarket();refreshFlows()});
   $('etfAdvancedButton')?.addEventListener('click',()=>{
     if($('etfAdvancedChart').hidden)advancedChart();
     else{$('etfAdvancedChart').hidden=true;$('etfAdvancedChart').replaceChildren();setText('etfAdvancedButton',tr('GRAFICO AVANZATO','ADVANCED CHART'));}
   });
   document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshMarket();refreshFlows();renderStatus()}});
   window.addEventListener('pageshow',()=>{refreshMarket();renderStatus()});
   window.addEventListener('storage',event=>{if(event.key==='inj_node_language_v1')location.reload()});
   window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='injnode:etf:language')location.reload()});
   renderStatus();renderFlows();drawGraph();
   refreshMarket();refreshFlows();
   refreshTimer=setInterval(()=>{if(!document.hidden)refreshMarket()},30000);
   marketPulseTimer=setInterval(()=>{if(!document.hidden)renderStatus()},15000);
   setInterval(()=>{if(!document.hidden)refreshFlows()},300000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
