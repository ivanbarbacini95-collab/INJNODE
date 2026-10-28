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
   intro:'Il patrimonio misura il gradino. Le reward misurano la copertura delle spese.',
   selected:'WALLET SELEZIONATO',all:'TUTTI I WALLET',price:'PREZZO INJ LIVE',status:'STATO FINANZIARIO',dayLabel:'REWARD / GIORNO',monthLabel:'REWARD / MESE',wealthEyebrow:'SCALA PATRIMONIALE',spendEyebrow:'SPESE QUOTIDIANE',planEyebrow:'OBIETTIVO DI LIBERTÀ',
   notReady:'IN ATTESA DEI DATI',notReadyInfo:'Seleziona un wallet e attendi una quotazione e uno staking aggiornati.',
   incomplete:'DATI INCOMPLETI',incompleteInfo:'La sincronizzazione di alcuni wallet, del prezzo o dell’APR non è completa. Non viene assegnato un giudizio finanziario.',
   no:'NON ANCORA FINANZIARIAMENTE LIBERO',noInfo:'Le reward previste coprono solo una parte delle spese impostate.',
   yes:'COPERTURA TEORICA COMPLETA',yesInfo:'Le reward stimate coprono la spesa mensile impostata. Non significa libertà finanziaria garantita: prezzo, APR e rischio INJ possono cambiare.',
   covered:'SPESE COPERTE',target:'OBIETTIVO 100%',short:'MANCANO',worth:'PATRIMONIO INJ',reward:'APR netto validator',
   grade:'IL TUO GRADINO PATRIMONIALE',tierFoot:'Livelli orientativi basati sul controvalore totale INJ. Non sono classi patrimoniali ufficiali.',
   daily:'COSA POSSONO COPRIRE LE REWARD?',estimated:'STIMA A VALORI ATTUALI',lifestyleNote:'Prezzi esemplificativi in EUR; consumi e stile di vita reali possono essere diversi.',
   plan:'IMPOSTA IL TUO OBIETTIVO',budget:'SPESE MENSILI DA COPRIRE (€)',buffer:'MARGINE DI PRUDENZA (%)',
   needs:'INJ IN STAKING NECESSARI',missing:'INJ ANCORA NECESSARI',stress:'SCENARIO PRUDENTE',stressNote:'Prezzo −50% · APR −30%',
   disclaimer:'Proiezioni, non uno stipendio garantito. Il margine è una riserva prudenziale e non rappresenta il calcolo delle imposte. Per valutare la libertà finanziaria reale servono anche liquidità, diversificazione, sostenibilità delle reward, rischio e tassazione.',
   synced:'WALLET AGGIORNATO',stale:'DATI DA AGGIORNARE',offline:'DATI NON DISPONIBILI',privacy:'PRIVACY ATTIVA',zero:'NON COPERTO',
   each:'OGNI GIORNO',once:'1 OGNI',days:'GIORNI',monthly:'MESE',coveredWord:'COPERTO',coins:'INJ',next:'PROSSIMO LIVELLO',max:'MASSIMO LIVELLO',priceWaiting:'QUOTAZIONE IN ATTESA',
   margin:'Dopo margine prudenziale',actual:'Stima prima del margine',spend:'Spese mensili'
  },
  en:{
   intro:'Net worth defines the wealth tier. Rewards measure how much of your expenses they could cover.',
   selected:'SELECTED WALLET',all:'ALL WALLETS',price:'LIVE INJ PRICE',status:'FINANCIAL STATUS',dayLabel:'REWARDS / DAY',monthLabel:'REWARDS / MONTH',wealthEyebrow:'WEALTH LADDER',spendEyebrow:'DAILY LIFESTYLE',planEyebrow:'FREEDOM TARGET',
   notReady:'WAITING FOR LIVE DATA',notReadyInfo:'Select a wallet and wait for a current quote and staking data.',
   incomplete:'INCOMPLETE DATA',incompleteInfo:'Some wallet, price, or APR information is unavailable. Financial status is not assessed.',
   no:'NOT FINANCIALLY INDEPENDENT YET',noInfo:'Estimated staking rewards cover only part of your target expenses.',
   yes:'ESTIMATED EXPENSE COVERAGE',yesInfo:'Projected rewards cover your monthly expense target. This does not guarantee financial independence: INJ price, APR and risks may change.',
   covered:'EXPENSES COVERED',target:'100% TARGET',short:'STILL NEEDED',worth:'INJ NET WORTH',reward:'Net validator APR',
   grade:'YOUR WEALTH TIER',tierFoot:'Illustrative tiers based on the total INJ market value, not official wealth classifications.',
   daily:'WHAT CAN REWARDS COVER?',estimated:'BASED ON CURRENT VALUES',lifestyleNote:'Example prices in EUR; actual spending and living costs vary.',
   plan:'SET YOUR TARGET',budget:'MONTHLY EXPENSES TO COVER (€)',buffer:'PRUDENCE BUFFER (%)',
   needs:'REQUIRED STAKED INJ',missing:'ADDITIONAL INJ NEEDED',stress:'DOWNSIDE SCENARIO',stressNote:'Price −50% · APR −30%',
   disclaimer:'Projections, not guaranteed salary. The buffer is a prudence reserve, not a tax calculation. Real financial freedom also depends on liquidity, diversification, sustainable income, risks and taxation.',
   synced:'WALLET UPDATED',stale:'DATA NEEDS REFRESH',offline:'DATA UNAVAILABLE',privacy:'PRIVACY MODE',zero:'NOT COVERED',
   each:'EACH DAY',once:'1 EVERY',days:'DAYS',monthly:'MONTH',coveredWord:'COVERED',coins:'INJ',next:'NEXT LEVEL',max:'TOP LEVEL',priceWaiting:'WAITING FOR QUOTE',
   margin:'After prudence buffer',actual:'Estimate before buffer',spend:'Monthly expenses'
  }
 };
 let prefs={budget:1500,buffer:30},selected='',hasUserSelected=false,seenSource=null,previousRenderKey='',timer=null;
 const valid=n=>Number.isFinite(n)&&n>=0;
 const positive=n=>Number.isFinite(n)&&n>0;
 const clamp=(n,min,max,otherwise)=>Number.isFinite(n)?Math.min(max,Math.max(min,n)):otherwise;
 const num=n=>typeof n==='number'?n:Number(n);
 const fmt=(value,digits=2)=>new Intl.NumberFormat(language()==='en'?'en-US':'it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
 const inj=value=>valid(value)?fmt(value,value>=1000?1:3):'—';
 const language=()=>document.documentElement.lang==='en'?'en':'it';
 const t=k=>copy[language()][k];
 const txt=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
 const money=(v,currency='EUR')=>valid(v)?new Intl.NumberFormat(language()==='en'?'en-US':'it-IT',{style:'currency',currency,maximumFractionDigits:2}).format(v):'—';
 function readPrefs(){
  try{const p=JSON.parse(localStorage.getItem(STORE)||'{}');prefs.budget=clamp(num(p.budget),100,10000000,1500);prefs.buffer=clamp(num(p.buffer),0,90,30)}catch(_){}
  $('freedomBudget').value=String(prefs.budget);
  $('freedomBuffer').value=String(prefs.buffer);
 }
 function writePrefs(){try{localStorage.setItem(STORE,JSON.stringify(prefs))}catch(_){}}
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
  txt('freedomStatusLabel',t('status'));txt('freedomCoverageLabel',t('covered'));
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
  txt('freedomTierFoot',t('tierFoot')+(next?' · '+t('next')+': '+money(next.min,'EUR')+' (+'+money(Math.max(0,next.min-worthEUR),'EUR')+')':' · '+t('max')));
 }
 function lifestyleRows(dailyEUR,complete){
  const host=$('freedomLifestyle');host.replaceChildren();
  lifestyle.forEach(item=>{
   const cost=item.type==='monthly'?item.price*12/365:item.price;
   const node=document.createElement('article');node.className='freedom-lifestyle-item';
   const icon=document.createElement('span');icon.className='freedom-lifestyle-emoji';icon.textContent=item.symbol;
   const title=document.createElement('div');title.className='freedom-lifestyle-name';
   const strong=document.createElement('strong');strong.textContent=item[language()];
   const price=document.createElement('small');price.textContent=money(item.price,'EUR')+(item.type==='monthly'?' / '+t('monthly'):'');
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
  setTheme(source);localize();walletOptions(source);
  const p=selectedPortfolio(source);
  const price=num(source.price),fx=num(source.eurRate);
  const marketFresh=positive(num(source.priceAt))&&Date.now()-num(source.priceAt)<120000;
  const fxConfirmed=source.fxVerified===true;
  const live=positive(price)&&positive(fx)&&p.ready&&marketFresh&&fxConfirmed;
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
  txt('freedomDayInj',inj(p.daily)+' INJ / DAY · '+t('actual'));
  txt('freedomMonth',money(convert(monthGrossEUR),c));
  txt('freedomRewardInfo',t('reward')+': '+(p.staked>0?fmt(p.apr,2)+'%':'0%'));
  renderTiers(worthEUR);
  const usable=p.complete&&marketFresh&&fxConfirmed&&positive(price)&&positive(fx);
  const safeCoverage=usable?coverage:0;
  const ratioDisplay=Math.min(9999,Math.max(0,Math.round(coverage)));
  txt('freedomCoverage',usable?fmt(ratioDisplay,0)+'%':'—');
  $('freedomMeter').style.setProperty('--freedom-progress',String(Math.min(100,safeCoverage))+'%');
  $('freedomBarFill').style.width=Math.min(100,safeCoverage).toFixed(2)+'%';
  txt('freedomStatusTitle',!usable?t('incomplete'):coverage>=100?t('yes'):t('no'));
  txt('freedomStatusExplain',!usable?t('incompleteInfo'):coverage>=100?t('yesInfo'):t('noInfo'));
  txt('freedomCoverageFoot',t('margin')+': '+money(convert(monthAdjustedEUR),c)+' / '+t('monthly'));
  txt('freedomGoal',t('spend')+': '+money(convert(prefs.budget),c));
  lifestyleRows(adjustedEUR,usable);
  const annualEURPerInj=(p.apr/100)*price*fx*(1-prefs.buffer/100);
  const target=usable&&annualEURPerInj>0?prefs.budget*12/annualEURPerInj:NaN;
  txt('freedomTargetInj',valid(target)?inj(target)+' INJ':'—');
  txt('freedomMissingInj',valid(target)?inj(Math.max(0,target-p.staked))+' INJ':'—');
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
   prefs.budget=clamp(num($('freedomBudget').value),100,10000000,prefs.budget);
   prefs.buffer=clamp(num($('freedomBuffer').value),0,90,prefs.buffer);
   writePrefs();render();
  }
  for(const id of ['freedomBudget','freedomBuffer']){
   $(id).addEventListener('input',updateInputs);
   $(id).addEventListener('change',()=>{$(id).value=String(id==='freedomBudget'?prefs.budget:prefs.buffer);updateInputs()});
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
