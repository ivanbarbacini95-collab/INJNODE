/* Visualize the wealth — selected Home wallet only, read-only simulator. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const PREFIX='inj_node_visualize_wealth_price_';
let previousCurrency='';
const dict={
it:{
 kicker:'IL TUO PATRIMONIO, A QUALSIASI PREZZO',
 desc:'Immagina un prezzo per INJ e scopri quanto varrebbe il tuo patrimonio.',
 price:'PREZZO IPOTETICO DI 1 INJ',help:'Inserisci un prezzo e la simulazione si aggiorna immediatamente.',
 total:'NET WORTH SIMULATO',stake:'SOLO STAKING',
 totalBase:'Disponibili + staking + reward',stakeBase:'Solo INJ effettivamente delegati',
 note:'Simulazione indicativa: valorizza esclusivamente gli INJ, senza stimare altri token, commissioni o imposte.',
 noWallet:'Nessun wallet salvato',noSelected:'Nessun wallet selezionato',incomplete:'DATI INCOMPLETI',
 waiting:'IN ATTESA',saved:'DATI SALVATI',recent:'DATI AGGIORNATI',privacy:'PRIVACY ATTIVA',
 privacyNote:'I valori sono nascosti dalle impostazioni Privacy.', invalid:'Prezzo non valido'
},
en:{
 kicker:'YOUR WEALTH, AT ANY PRICE',
 desc:'Enter a hypothetical INJ price and visualize what your holdings could be worth.',
 price:'HYPOTHETICAL PRICE OF 1 INJ',help:'Enter a price to update the simulation instantly.',
 total:'SIMULATED NET WORTH',stake:'STAKING ONLY',
 totalBase:'Available + staked + rewards',stakeBase:'Delegated INJ only',
 note:'Illustrative simulation: values INJ only, excluding other tokens, fees and taxes.',
 noWallet:'No saved wallets',noSelected:'No selected wallet',incomplete:'INCOMPLETE DATA',
 waiting:'WAITING',saved:'CACHED DATA',recent:'UPDATED DATA',privacy:'PRIVACY ON',
 privacyNote:'Values are hidden by your Privacy settings.',invalid:'Invalid price'
}};
function read(k){try{return localStorage.getItem(k)}catch(_){return null}}
function lang(){return read('inj_node_language_v1')==='en'?'en':'it'}
function curr(){return read('inj_monitor_currency')==='EUR'?'EUR':'USD'}
function parsePrice(input){
 const s=String(input||'').trim().replace(/[\s\u00a0\u202f€$]/g,'');
 if(!s||!/^[\d.,]+$/.test(s))return NaN;
 const d=s.lastIndexOf('.'),c=s.lastIndexOf(',');
 let normalized=s;
 if(d>=0&&c>=0){const dec=d>c?'.':',';normalized=s.split(dec==='.'?',':'.').join('').replace(dec,'.')}
 else if((s.match(/[.,]/g)||[]).length>1){const sep=c>=0?',':'.',pos=s.lastIndexOf(sep);normalized=s.slice(0,pos).replace(/[.,]/g,'')+'.'+s.slice(pos+1)}
 else normalized=s.replace(',','.');
 const value=Number(normalized);
 return Number.isFinite(value)&&value>=0&&value<=1e12?value:NaN;
}
function num(n){const v=Number(n);return n===null||n===undefined||!Number.isFinite(v)||v<0?NaN:v}
function fmtQty(n){return new Intl.NumberFormat(lang()==='en'?'en-US':'it-IT',{maximumFractionDigits:4}).format(n)}
function money(n){return new Intl.NumberFormat(lang()==='en'?'en-US':'it-IT',{style:'currency',currency:curr(),minimumFractionDigits:2,maximumFractionDigits:2}).format(n)}
function getRows(){
 let wallets=[],summaries={};
 try{wallets=JSON.parse(read('inj_monitor_wallets_v1')||'[]');summaries=JSON.parse(read('inj_monitor_summaries_v1')||'{}')}catch(_){}
 const rows=new Map();
 for(const w of Array.isArray(wallets)?wallets:[]){
  const address=String(w?.address||'').trim().toLowerCase();
  if(!/^inj1[a-z0-9]{30,}$/.test(address)||rows.has(address))continue;
  const s=summaries?.[address]||{};
  rows.set(address,{address,label:String(w?.label||'Wallet'),total:num(s.total),staked:num(s.staked),updated:Number(s.updated)||0});
 }
 let selected=String(read('inj_node_comparison_selected_wallet_v1')||read('inj_monitor_address')||'').toLowerCase();
 try{
  if(window.parent!==window&&window.parent.location.origin===location.origin&&typeof window.parent.INJ_GET_SELECTED_WALLET_SNAPSHOT==='function'){
   const p=window.parent.INJ_GET_SELECTED_WALLET_SNAPSHOT();
   if(p?.address){
    selected=String(p.address).toLowerCase();
    if(!rows.has(selected))rows.set(selected,{address:selected,label:p.label||'Wallet',total:num(p.total),staked:num(p.staked),updated:Number(p.updated)||0});
    else if(Number(p.updated)>0)rows.set(selected,{address:selected,label:p.label||rows.get(selected).label,total:num(p.total),staked:num(p.staked),updated:Number(p.updated)||0});
   }
  }
 }catch(_){}
 return {rows:[...rows.values()],selected};
}
function ready(row){return row&&row.updated>0&&Number.isFinite(row.total)&&Number.isFinite(row.staked)&&row.staked<=row.total+1e-5}
function translate(){
 const t=dict[lang()];document.documentElement.lang=lang();
 const texts={
  wealthKicker:t.kicker,wealthDescription:t.desc,wealthPriceLabel:t.price,
  wealthTotalLabel:t.total,wealthStakedLabel:t.stake,wealthFootnote:t.note
 };
 for(const [id,str] of Object.entries(texts))$(id).textContent=str;
}
function render(){
 const t=dict[lang()],unit=curr();translate();
 if(previousCurrency!==unit){
  previousCurrency=unit;
  $('wealthCurrency').textContent=unit==='EUR'?'€':'$';
  $('wealthPrice').value=read(PREFIX+unit.toLowerCase()+'_v1')||'';
 }
 const price=parsePrice($('wealthPrice').value);
 const all=getRows(),wallet=all.rows.find(r=>r.address===all.selected);
 const complete=ready(wallet);
 const total=complete?wallet.total:NaN;
 const staked=complete?wallet.staked:NaN;
 const oldest=complete?wallet.updated:0;
 const privateOn=read('inj_monitor_privacy')==='1';
 const status=privateOn?t.privacy:complete?(Date.now()-oldest<120000?t.recent:t.saved):wallet?t.incomplete:t.waiting;
 $('wealthDataStatus').textContent=status;
 $('wealthWalletLabel').textContent=wallet?(lang()==='en'?'Selected wallet · ':'Wallet selezionato · ')+wallet.label:(all.rows.length?t.noSelected:t.noWallet);
 const valid=complete&&Number.isFinite(price);
 const visible=valid&&!privateOn;
 $('wealthTotal').textContent=privateOn?'••••••':visible?money(total*price):'—';
 $('wealthStaked').textContent=privateOn?'••••••':visible?money(staked*price):'—';
 $('wealthTotalDetail').textContent=privateOn?t.privacyNote:complete?fmtQty(total)+' INJ · '+t.totalBase:wallet?t.totalBase+' · '+t.incomplete:(all.rows.length?t.noSelected:t.noWallet);
 $('wealthStakedDetail').textContent=privateOn?t.privacyNote:complete?fmtQty(staked)+' INJ · '+t.stakeBase:t.stakeBase;
 $('wealthPriceHelp').textContent=$('wealthPrice').value&&!Number.isFinite(price)?t.invalid:t.help;
}
$('wealthPrice').addEventListener('input',()=>{
 const key=PREFIX+curr().toLowerCase()+'_v1';
 try{if($('wealthPrice').value)localStorage.setItem(key,$('wealthPrice').value);else localStorage.removeItem(key)}catch(_){}
 render();
});
$('visualizeWealthBack').addEventListener('click',()=>{
 if(parent!==window)parent.postMessage({type:'injnode:section:home'},location.origin);
 else location.href='./index.html';
});
window.addEventListener('storage',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
render();
setInterval(()=>{if(!document.hidden)render()},2000);
})();