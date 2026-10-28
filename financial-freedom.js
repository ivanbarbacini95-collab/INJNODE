/* INJ Node Financial Freedom v1. Read-only from parent wallet/market source.
   No private keys, blockchain writes, or imagined live values. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const STORE='inj_node_freedom_preferences_v1';
 const tiers=[
  {min:0,it:'BASE',en:'START',label:'< 10K'},
  {min:10000,it:'RISERVA',en:'RESERVE',label:'10K+'},
  {min:50000,it:'CRESCITA',en:'GROWTH',label:'50K+'},
  {min:250000,it:'CAPITALE',en:'CAPITAL',label:'250K+'},
  {min:1000000,it:'PATRIMONIO',en:'WEALTH',label:'1M+'},
  {min:3000000,it:'LEGACY',en:'LEGACY',label:'3M+'}
 ];
 const lifestyle=[
  {symbol:'☕',it:'UN CAFFÈ',en:'COFFEE',price:3},
  {symbol:'🥗',it:'UN PRANZO',en:'LUNCH',price:15},
  {symbol:'🛒',it:'SPESA',en:'GROCERIES',price:35},
  {symbol:'🍽️',it:'UNA CENA',en:'DINNER',price:55},
  {symbol:'🏠',it:'AFFITTO / MESE',en:'RENT / MONTH',price:900,type:'monthly'},
  {symbol:'🚗',it:'MOBILITÀ / MESE',en:'MOBILITY / MONTH',price:250,type:'monthly'}
 ];
 const copy={
  it:{
   intro:'Patrimonio e rendita a colpo d’occhio.',
   selected:'WALLET SELEZIONATO',all:'TUTTI I WALLET',price:'PREZZO INJ LIVE',status:'STATO FINANZIARIO',dayLabel:'REWARD / GIORNO',monthLabel:'REWARD / MESE',wealthEyebrow:'SCALA PATRIMONIALE',spendEyebrow:'SPESE QUOTIDIANE',planEyebrow:'OBIETTIVO DI LIBERTÀ',
   notReady:'DATI IN ARRIVO',notReadyInfo:'In attesa dei dati del wallet.',
   incomplete:'STIMA NON AGGIORNATA',incompleteInfo:'Valori indicativi · verifica i dati live.',
   no:'COPERTURA PARZIALE',noInfo:'Reward sotto l’obiettivo mensile.',
   yes:'OBIETTIVO COPERTO',yesInfo:'Reward teoricamente sufficienti. Non garantite.',
   covered:'SPESE COPERTE',target:'OBIETTIVO 100%',short:'MANCANO',worth:'PATRIMONIO INJ',reward:'APR netto validator',
   grade:'IL TUO GRADINO',tierFoot:'Fasce indicative, non ufficiali.',
   daily:'COSA COPRONO LE REWARD',estimated:'STIME',lifestyleNote:'Costi indicativi.',
   plan:'IL TUO OBIETTIVO',budget:'SPESE / MESE (€)',buffer:'MARGINE (%)',
   needs:'INJ NECESSARI',missing:'INJ MANCANTI',stress:'SCENARIO -50%',stressNote:'Prezzo −50% · APR −30%',
   disclaimer:'Simulazioni non garantite. Prezzo, APR e imposte possono cambiare. Il margine non è una stima fiscale.',
   synced:'WALLET AGGIORNATO',stale:'DATI DA AGGIORNARE',offline:'DATI NON DISPONIBILI',privacy:'PRIVACY ATTIVA',zero:'NON COPERTO',
   each:'OGNI GIORNO',once:'1 OGNI',days:'GIORNI',monthly:'MESE',coveredWord:'COPERTO',coins:'INJ',next:'PROSSIMO LIVELLO',max:'MASSIMO LIVELLO',priceWaiting:'QUOTAZIONE IN ATTESA',
   margin:'Reward utilizzabili',actual:'Prima del margine',spend:'Spese mensili'
  },
  en:{
   intro:'Wealth and staking income at a glance.',
   selected:'SELECTED WALLET',all:'ALL WALLETS',price:'LIVE INJ PRICE',status:'FINANCIAL STATUS',dayLabel:'REWARDS / DAY',monthLabel:'REWARDS / MONTH',wealthEyebrow:'WEALTH LADDER',spendEyebrow:'DAILY LIFESTYLE',planEyebrow:'FREEDOM TARGET',
   notReady:'LOADING DATA',notReadyInfo:'Waiting for wallet data.',
   incomplete:'ESTIMATE · UPDATE NEEDED',incompleteInfo:'Indicative values · check live data.',
   no:'PARTIAL COVERAGE',noInfo:'Rewards below your monthly target.',
   yes:'TARGET COVERED',yesInfo:'Rewards may cover your target. Not guaranteed.',
   covered:'EXPENSES COVERED',target:'100% TARGET',short:'STILL NEEDED',worth:'INJ NET WORTH',reward:'Net validator APR',
   grade:'WEALTH LEVEL',tierFoot:'Illustrative tiers, not official rankings.',
   daily:'REWARD SPENDING POWER',estimated:'ESTIMATES',lifestyleNote:'Illustrative costs.',
   plan:'YOUR TARGET',budget:'SPENDING / MONTH (€)',buffer:'BUFFER (%)',
   needs:'INJ REQUIRED',missing:'INJ TO GO',stress:'DOWNSIDE -50%',stressNote:'Price −50% · APR −30%',
   disclaimer:'Estimates, not guaranteed income. Price, APR and taxes may change. The buffer is not a tax estimate.',
   synced:'WALLET UPDATED',stale:'DATA NEEDS REFRESH',offline:'DATA UNAVAILABLE',privacy:'PRIVACY MODE',zero:'NOT COVERED',
   each:'EACH DAY',once:'1 EVERY',days:'DAYS',monthly:'MONTH',coveredWord:'COVERED',coins:'INJ',next:'NEXT LEVEL',max:'TOP LEVEL',priceWaiting:'WAITING FOR QUOTE',
   margin:'Spendable rewards',actual:'Before buffer',spend:'Monthly expenses'
  }
 };
 let prefs={budget:1500,buffer:30},selected='',hasUserSelected=false,timer=null;
 let shownCurrency='EUR',rateEURperUSD=1,lastFormattedBudget='';
 const valid=n=>Number.isFinite(n)&&n>=0;
 const positive=n=>Number.isFinite(n)&&n>0;
 const clamp=(n,min,max,otherwise)=>Number.isFinite(n)?Math.min(max,Math.max(min,n)):otherwise;
 const num=n=>typeof n==='number'?n:Number(n);
 const fmt=(value,digits=2)=>new Intl.NumberFormat(language()==='en'?'en-US':'it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
 const inj=value=>valid(value)?fmt(value,value>=1000?1:3):'—';
 const language=()=>document.documentElement.lang==='en'?'en':'it';
 const t=k=>copy[language()][k];
 const txt=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
 const money=(v,currency='EUR')=>valid(v)?new Intl.NumberFormat(language()==='en'?'en-US':'it-IT',{style:'currency',currency,currencyDisplay:'narrowSymbol',maximumFractionDigits:2}).format(v):'—';
 function readPrefs(){
  try{const p=JSON.parse(localStorage.getItem(STORE)||'{}');prefs.budget=(Number.isFinite(Number(p.budget))&&Number(p.budget)>0)?Number(p.budget):1500;prefs.buffer=clamp(num(p.buffer),0,90,30)}catch(_){}
  $('freedomBudget').value=String(prefs.budget);
  lastFormattedBudget=String(prefs.budget);
  $('freedomBuffer').value=String(prefs.buffer);
 }
 function writePrefs(){try{localStorage.setItem(STORE,JSON.stringify(prefs))}catch(_){}}
 function budgetAmountInCurrency(currency=shownCurrency,rate=rateEURperUSD){
  return prefs.budget*(currency==='USD'?1/Math.max(rate,0.000001):1);
 }
 function syncBudgetCurrency(source){
  const currency=source.currency==='USD'?'USD':'EUR';
  const rate=positive(num(source.eurRate))?num(source.eurRate):rateEURperUSD;
  const changed=currency!==shownCurrency;
  shownCurrency=currency;rateEURperUSD=rate;
  // Every displayed currency has a minimum editable goal of 1 unit.
  // No arbitrary upper limit is applied.
  if(budgetAmountInCurrency(currency,rate)<1){
    prefs.budget=currency==='EUR'?1:rate;
    writePrefs();
    lastFormattedBudget='';
  }
  txt('freedomBudgetLabel',t('budget').replace('€',currency==='USD'?'$':'€'));
  const input=$('freedomBudget');
  if((changed||!lastFormattedBudget)&&document.activeElement!==input){
   const value=String(Math.round(budgetAmountInCurrency(currency,rate)*100)/100);
   input.value=value;lastFormattedBudget=value;
  }
 }
 function parentSource(){
  try{
   const p=window.parent;
   if(p===window||p.location.origin!==location.origin)return null;
   return typeof p.INJ_FINANCIAL_FREEDOM_SOURCE==='function'?p.INJ_FINANCIAL_FREEDOM_SOURCE():null;
  }catch(_){return null}
 }
 function setTheme(source){
  const lang=source?.language==='en'?'en':'it';
  document.documentElement.lang=lang;
  if(source?.theme)document.documentElement.dataset.theme=source.theme;
  document.body.classList.toggle('privacy-active',Boolean(source?.privacy));
 }
 function localize(){
  txt('freedomIntro',t('intro'));txt('freedomWalletLabel',t('selected'));txt('freedomPriceLabel',t('price'));
  txt('freedomStatusLabel',t('status'));txt('freedomCoverageLabel',t('covered'));txt('freedomNetLabel',language()==='en'?'SPENDABLE / MONTH':'UTILIZZABILI / MESE');txt('freedomGoalLabel',language()==='en'?'SPENDING / MONTH':'SPESE / MESE');txt('freedomBufferHint',language()==='en'?'Rewards held back':'Reward non spendibili');
  txt('freedomWorthLabel',t('worth'));txt('freedomDayLabel',t('dayLabel'));txt('freedomMonthLabel',t('monthLabel'));txt('freedomWealthEyebrow',t('wealthEyebrow'));txt('freedomSpendEyebrow',t('spendEyebrow'));txt('freedomPlanEyebrow',t('planEyebrow'));txt('freedomWealthTitle',t('grade'));txt('freedomTierFoot',t('tierFoot'));
  txt('freedomSpendTitle',t('daily'));txt('freedomSpendHint',t('estimated'));txt('freedomLifestyleFoot',t('lifestyleNote'));
  txt('freedomPlanTitle',t('plan'));txt('freedomBudgetLabel',t('budget'));txt('freedomBufferLabel',t('buffer'));
  txt('freedomTargetLabel',t('needs'));txt('freedomMissingLabel',t('missing'));
  txt('freedomStressLabel',t('stress'));txt('freedomStressInfo',t('stressNote'));txt('freedomDisclaimer',t('disclaimer'));
  $('freedomClose').ariaLabel=language()==='en'?'Close Financial Freedom':'Torna alla Home';
 }
 function walletOptions(source){
  const wallets=Array.isArray(source?.wallets)?source.wallets:[];
  const addresses=wallets.map(w=>w.address);
  if(!hasUserSelected||(!addresses.includes(selected)&&selected!=='ALL')){
   selected=addresses.includes(source?.selectedAddress)?source.selectedAddress:(addresses[0]||'');
   hasUserSelected=false;
  }
  const options=[...(wallets.length>1?[{value:'ALL',text:t('all')}]:[]),...wallets.map((w,i)=>({value:w.address,text:String(w.label||('Wallet '+(i+1)))}))];
  const key=JSON.stringify(options);
  const select=$('freedomWallet');
  if(key!==select.dataset.optionsKey){
   select.replaceChildren();
   for(const opt of options){const node=document.createElement('option');node.value=opt.value;node.textContent=opt.text;select.append(node)}
   select.dataset.optionsKey=key;
  }
  if(selected==='ALL'&&wallets.length<=1)selected=wallets[0]?.address||'';
  if(select.value!==selected)select.value=selected;
 }
 function selectedPortfolio(source){
  const wallets=Array.isArray(source?.wallets)?source.wallets:[];
  const included=selected==='ALL'?wallets:wallets.filter(w=>w.address===selected);
  if(included.length===0)return{ready:false,reason:'notReady'};
  let total=0,staked=0,daily=0,aprNumerator=0,validRows=0,aprMissing=false,stale=false;
  for(const w of included){
   if(!positive(num(w.updated))||!valid(num(w.total))||!valid(num(w.staked))){continue}
   validRows++;
   const tInj=num(w.total),sInj=num(w.staked);total+=tInj;staked+=sInj;
   if(Date.now()-num(w.updated)>30*60*1000)stale=true;
   if(sInj>0){
    const apr=num(w.apr);
    if(!valid(apr)||apr>200||w.apr==null){aprMissing=true;continue}
    aprNumerator+=sInj*apr;
    daily+=sInj*apr/100/365;
   }
  }
  const complete=validRows===included.length&&!aprMissing&&!stale;
  return{ready:validRows>0,complete,total,staked,daily,apr:staked>0?aprNumerator/staked:0,stale,aprMissing,validRows,walletCount:included.length,reason:complete?'':'incomplete'};
 }
 function renderTiers(worthEUR){
  const index=tiers.reduce((last,entry,i)=>worthEUR>=entry.min?i:last,0);
  const host=$('freedomTierTrack');
  host.replaceChildren();
  tiers.forEach((entry,i)=>{
   const node=document.createElement('div');node.className='freedom-tier'+(i===index?' current':i<index?' reached':'');
   const bar=document.createElement('div');bar.className='freedom-tier-bar';
   const title=document.createElement('strong');title.textContent=entry[language()];
   const value=document.createElement('small');value.textContent=entry.label;
   node.append(bar,title,value);host.append(node);
  });
  txt('freedomTier',String(index+1).padStart(2,'0')+' / 06');
  const next=tiers[index+1];
  const currency=shownCurrency;
  const convertedNext=currency==='USD'?(next?.min||0)/rateEURperUSD:next?.min||0;
  const convertedShort=currency==='USD'?Math.max(0,(next?.min||0)-worthEUR)/rateEURperUSD:Math.max(0,(next?.min||0)-worthEUR);
  txt('freedomTierFoot',next?t('next')+': '+money(convertedNext,currency)+' · +'+money(convertedShort,currency):t('max')+' · '+t('tierFoot'));
 }
 function lifestyleRows(dailyEUR,complete){
  const host=$('freedomLifestyle');host.replaceChildren();
  lifestyle.forEach(item=>{
   const cost=item.type==='monthly'?item.price*12/365:item.price;
   const node=document.createElement('article');node.className='freedom-lifestyle-item';
   const icon=document.createElement('span');icon.className='freedom-lifestyle-emoji';icon.textContent=item.symbol;
   const title=document.createElement('div');title.className='freedom-lifestyle-name';
   const strong=document.createElement('strong');strong.textContent=item[language()];
   const price=document.createElement('small');price.textContent=money(shownCurrency==='USD'?item.price/rateEURperUSD:item.price,shownCurrency)+(item.type==='monthly'?' / '+t('monthly'):'');
   title.append(strong,price);
   const result=document.createElement('span');result.className='freedom-lifestyle-result private';
   if(!complete){result.textContent='—';node.classList.add('not-yet')}
   else if(item.type==='monthly'){
    const monthly= dailyEUR*365/12;
    const percent=Math.min(9999,monthly/item.price*100);
    result.textContent=percent>=100?t('coveredWord'):fmt(percent,0)+'%';
    if(percent<100)node.classList.add('not-yet');
   }
   else if(dailyEUR>=cost){result.textContent=fmt(Math.floor(dailyEUR/cost),0)+'× '+t('each')}
   else if(dailyEUR>0){result.textContent=t('once')+' '+fmt(Math.ceil(cost/dailyEUR),0)+' '+t('days');node.classList.add('not-yet')}
   else{result.textContent=t('zero');node.classList.add('not-yet')}
   node.append(icon,title,result);host.append(node);
  });
 }
 function resetOutput(reason){
  txt('freedomStatusTitle',t(reason));txt('freedomStatusExplain',t(reason+'Info'));
  for(const id of ['freedomCoverage','freedomWorth','freedomInj','freedomDay','freedomDayInj','freedomMonth','freedomRewardInfo','freedomTier','freedomTargetInj','freedomMissingInj','freedomStressCoverage','freedomCoverageFoot','freedomGoal'])txt(id,'—');
  $('freedomMeter').style.setProperty('--freedom-progress','0%');
  $('freedomBarFill').style.width='0%';
  $('freedomTierTrack').replaceChildren();
  lifestyleRows(0,false);
 }
 function render(){
  const source=parentSource();
  if(!source){
   localize();txt('freedomPrice','—');txt('freedomUpdated',t('offline'));resetOutput('notReady');
   $('freedomFeed').classList.add('is-offline');return;
  }
  setTheme(source);localize();syncBudgetCurrency(source);walletOptions(source);
  const p=selectedPortfolio(source);
  const price=num(source.price),fx=num(source.eurRate);
  const marketFresh=positive(num(source.priceAt))&&Date.now()-num(source.priceAt)<120000;
  const fxConfirmed=source.fxVerified===true;
  const live=positive(price)&&positive(fx)&&p.ready&&marketFresh&&fxConfirmed&&!p.stale;
  const c=source.currency==='EUR'?'EUR':'USD';
  txt('freedomPrice',positive(price)?money(price*(c==='EUR'?fx:1),c):'—');
  txt('freedomUpdated',p.stale||(!marketFresh&&positive(price))||(!fxConfirmed&&positive(fx))?t('stale'):live?t('synced'):t('priceWaiting'));
  $('freedomFeed').classList.toggle('is-offline',!live||!p.complete);
  const updated=(live&&p.complete)?'LIVE':(p.ready?'CHECK':'—');
  $('freedomFeed').lastChild.textContent=source.privacy?t('privacy'):updated;
  if(!p.ready||!positive(price)||!positive(fx)){
   resetOutput('notReady');return;
  }
  const worthEUR=p.total*price*fx,dayEUR=p.daily*price*fx,
   adjustedEUR=dayEUR*(1-prefs.buffer/100),
   monthGrossEUR=dayEUR*365/12,
   monthAdjustedEUR=adjustedEUR*365/12,
   coverage=monthAdjustedEUR/prefs.budget*100,
   budgetPerDay=prefs.budget*12/365;
  const convert=v=>c==='EUR'?v:v/fx;
  txt('freedomWorth',money(convert(worthEUR),c));
  txt('freedomInj',inj(p.total)+' INJ · '+inj(p.staked)+' STAKED');
  txt('freedomDay',money(convert(dayEUR),c));
  txt('freedomDayInj',inj(p.daily)+' INJ / '+(language()==='en'?'DAY':'GIORNO'));
  txt('freedomMonth',money(convert(monthGrossEUR),c));
  txt('freedomRewardInfo','APR NET: '+(p.staked>0?fmt(p.apr,2)+'%':'0%'));
  if(p.validRows===p.walletCount)renderTiers(worthEUR);
  else{
    $('freedomTierTrack').replaceChildren();
    txt('freedomTier','—');
    txt('freedomTierFoot',t('incompleteInfo'));
  }
  if(p.aprMissing||p.validRows!==p.walletCount){
    // Missing APR must not look like an actual 0 EUR/USD staking yield.
    txt('freedomDay','—');
    txt('freedomDayInj','—');
    txt('freedomMonth','—');
    txt('freedomRewardInfo',t('notReadyInfo'));
  }
  // A cached quote can still be used for a clearly labelled simulation.
  // Do not erase financial figures merely because WebSocket/FX is reconnecting.
  const usable=p.validRows===p.walletCount&&!p.aprMissing&&positive(price)&&positive(fx);
  const verified=usable&&marketFresh&&fxConfirmed&&!p.stale;
  const safeCoverage=usable?coverage:0;
  const ratioDisplay=Math.min(9999,Math.max(0,Math.round(coverage)));
  txt('freedomCoverage',usable?fmt(ratioDisplay,0)+'%':'—');
  $('freedomMeter').style.setProperty('--freedom-progress',String(Math.min(100,safeCoverage))+'%');
  $('freedomBarFill').style.width=Math.min(100,safeCoverage).toFixed(2)+'%';
  txt('freedomStatusTitle',!verified?t('incomplete'):coverage>=100?t('yes'):t('no'));
  txt('freedomStatusExplain',!verified?t('incompleteInfo'):coverage>=100?t('yesInfo'):t('noInfo'));
  txt('freedomCoverageFoot',usable?money(convert(monthAdjustedEUR),c):'—');
  txt('freedomGoal',money(convert(prefs.budget),c));
  lifestyleRows(adjustedEUR,usable);
  const annualEURPerInj=(p.apr/100)*price*fx*(1-prefs.buffer/100);
  const target=usable&&annualEURPerInj>0?(prefs.budget/annualEURPerInj)*12:NaN;
  txt('freedomTargetInj',valid(target)?inj(target)+' INJ':(usable&&positive(annualEURPerInj)?'∞ INJ':'—'));
  txt('freedomMissingInj',valid(target)?inj(Math.max(0,target-p.staked))+' INJ':(usable&&positive(annualEURPerInj)?'∞ INJ':'—'));
  txt('freedomStressCoverage',usable?fmt(Math.round(coverage*.5*.7),0)+'%':'—');
 }
 function close(){
  if(window.parent!==window){
   try{window.parent.postMessage({type:'injnode:freedom-close'},location.origin)}catch(_){}
  }else location.href='./index.html';
 }
 function init(){
  readPrefs();
  $('freedomClose').addEventListener('click',close);
  $('freedomWallet').addEventListener('change',e=>{selected=e.target.value;hasUserSelected=true;render()});
  function updateInputs(){
   const raw=$('freedomBudget').value;
   const value=raw.trim()?Number(raw):NaN;
   if(Number.isFinite(value)&&value>0){
    const amountEUR=Math.max(1,value)*(shownCurrency==='USD'?rateEURperUSD:1);
    prefs.budget=Number.isFinite(amountEUR)&&amountEUR>0?amountEUR:prefs.budget;
   }
   prefs.buffer=clamp(num($('freedomBuffer').value),0,90,prefs.buffer);
   writePrefs();render();
  }
  for(const id of ['freedomBudget','freedomBuffer']){
   $(id).addEventListener('input',updateInputs);
   $(id).addEventListener('change',()=>{
    updateInputs();
    if(id==='freedomBudget'){
     const formatted=String(Math.round(budgetAmountInCurrency()*100)/100);
     $(id).value=formatted;lastFormattedBudget=formatted;
    }else $(id).value=String(prefs.buffer);
   });
  }
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='injnode:freedom-refresh'){hasUserSelected=false;render()}});
  window.addEventListener('pageshow',render);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
  render();
  timer=window.setInterval(()=>{if(!document.hidden)render()},5000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
