/* Shared registry: every entry has a renderer, scope and independently saved options. */
(function(root){
'use strict';
const rows=[
 ['worth','Dashboard','Patrimonio','Net worth'],['total','Dashboard','Totale INJ','Total INJ'],['staked','Dashboard','In staking','Staked INJ'],['available','Dashboard','Disponibile','Available'],['rewards','Dashboard','Reward maturati','Unclaimed rewards'],['apr','Dashboard','APR netto','Net APR'],['unbonding','Dashboard','In sblocco','Unbonding'],['validators','Dashboard','Delegazioni e validatori','Delegations and validators',null,6,5],['milestone','Dashboard','Prossimo livello INJ','Next INJ level'],
 ['liveview','Live View','Prezzo e grafico live','Live price and chart','market',8,5],
 ['chart','Live Charts','Grafico INJ','INJ chart','market',8,5],['price','Live Charts','Prezzo INJ','INJ price','market'],['low24','Live Charts','Minimo 24h','24h low','market'],['high24','Live Charts','Massimo 24h','24h high','market'],['change24','Live Charts','Variazione 24h','24h change','market'],
 ['orderbook','Order Book','Profondità del book','Order book depth','market',6,6],['bid','Order Book','Miglior acquisto','Best bid','market'],['ask','Order Book','Miglior vendita','Best ask','market'],['spread','Order Book','Spread','Spread','market'],
 ['timeline','Performance Timeline','Cronologia P/L giornaliero','Daily P/L history',null,8,5],['periodpnl','Performance Timeline','P/L periodo','Period P/L'],['bestday','Performance Timeline','Miglior giorno','Best day'],['worstday','Performance Timeline','Peggior giorno','Worst day'],
 ['converter','INJ Converter','Convertitore INJ / fiat','INJ / fiat converter','market',4,4],
 ['pnl','Command Center','P/L totale','Total P/L'],['pnl24','Command Center','P/L da prezzo 24h','24h price P/L'],['avgprice','Command Center','Prezzo medio di carico','Average entry price'],['levels','Command Center','Livelli di mercato','Market levels','market',4,4],['session','Command Center','Stato e sincronizzazione','Status and sync','market'],
 ['daily','Live Reward','Produzione giornaliera','Daily production'],['hourly','Live Reward','Produzione oraria','Hourly production'],['weekly','Live Reward','Produzione settimanale','Weekly production'],['monthly','Live Reward','Produzione mensile','Monthly production'],['yearly','Live Reward','Produzione annuale','Annual production'],['production','Live Reward','Produzione per periodo','Production by period',null,4,5],['rewardwallets','Live Reward','Reward per wallet','Rewards by wallet',null,6,5],
 ['marketlist','Market','Hybrid Pro · Top 200','Hybrid Pro · Top 200','market',8,7],['heatmap','Market','Market Heatmap','Market Heatmap','market',8,7],['favorites','Market','Crypto preferite','Favorite crypto','market',6,5],['marketleaders','Market','Migliori performance','Top gainers','market',6,5],['marketlosers','Market','Peggiori performance','Top losers','market',6,5],['marketcap','Market','Market cap INJ','INJ market cap','market'],['volume24','Market','Volume INJ 24h','INJ 24h volume','market'],['circulating','Market','Offerta circolante INJ','INJ circulating supply','market'],['fullydiluted','Market','Valore fully diluted','Fully diluted value','market'],['dominance','Market','Dominanza INJ','INJ dominance','market'],['globalcap','Market','Capitalizzazione globale','Global market cap','market'],['globalvolume','Market','Volume globale 24h','Global 24h volume','market'],['btcdom','Market','Dominanza Bitcoin','Bitcoin dominance','market'],['networkstake','Market','INJ in staking sulla rete','Network staked INJ','market'],['nativesupply','Market','Offerta nativa INJ','INJ native supply','market'],
 ['comparison','Market Cap Comparison','Scenario a pari market cap','Equal market cap scenario',null,6,5],
 ['potential','Potential Value','Patrimonio simulato','Simulated net worth',null,4,4],['potentialstake','Potential Value','Staking simulato','Simulated staking value',null,4,4],['potentialincome','Potential Value','Rendita al prezzo ipotetico','Income at hypothetical price',null,4,4],['growth','Potential Value','Crescita con compound','Compound growth',null,6,5],
 ['ratio','Treasury','Staking ratio','Staking ratio'],['composition','Treasury','Composizione Treasury','Treasury composition',null,6,5],['ownership','Treasury','Quote dei wallet','Wallet allocations',null,6,5],['walletlist','Treasury','Patrimonio per wallet','Holdings by wallet',null,6,5],['walletcount','Treasury','Wallet e copertura dati','Wallets and data coverage'],['treasurygrowth','Treasury','Crescita INJ nel tempo','INJ growth history',null,8,5],['worthhistory','Treasury','Andamento patrimonio','Net worth history',null,8,5],
 ['ladder','Reward Ladder','Traguardo reward','Reward milestone'],['ladderall','Reward Ladder','Tutti i traguardi reward','All reward milestones',null,6,7]
];
const entries=rows.map(([type,section,it,en,scope='wallet',w=4,h=3])=>({type,section,it,en,scope:scope||'wallet',w,h}));
const byType=Object.fromEntries(entries.map(e=>[e.type,e]));
const isChart=t=>['chart','liveview'].includes(t);
const defaults=type=>({timeframe:'1h',chartStyle:'line',goal:1,amount:1,scenarioPrice:100,targetCoin:'bitcoin',years:5,historyRange:'30d',direction:'injToFiat',...(type==='liveview'?{timeframe:'1h'}:{})});
const treasuryWallets=[
  'inj1cqvjau8tl4ge874crfaj6gkw55pnn6n2vmwdhv',
  'inj1ewp22h79mx9ln494nnx08laan4u2x7xyf37ceu',
  'inj19ue2rs8a8vr5q7fc7a52ee9kx8axt46wndhzv9',
  'inj1tgy6auqyps9uql9xpmnkwfd7gsf3hrkdx9cv3q',
  'inj1x2pste4f04pltkmaw6wzqflrgpgsu9x6gn3l9m'
];
const api={treasuryWallets,entries,byType,isChart,defaults};if(typeof module!=='undefined')module.exports=api;root.INJWorkspaceCatalog=api;
})(globalThis);
