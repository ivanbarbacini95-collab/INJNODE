// INJ NODE · Scriptable iPhone Widget · v1.0
// Read-only: no seed phrases, no keys, no wallet connections.
// Launch in Scriptable once to configure public inj1 addresses.
(async function(){
"use strict";
const fm=FileManager.local(),root=fm.documentsDirectory();
const path=n=>fm.joinPath(root,"inj-node-widget-"+n+".json");
const read=(name,def)=>{try{return fm.fileExists(path(name))?JSON.parse(fm.readString(path(name))):def}catch(_){return def}};
const write=(name,obj)=>{try{fm.writeString(path(name),JSON.stringify(obj))}catch(_){}};
const validAddress=s=>/^inj1[a-z0-9]{38,60}$/i.test(s);
const safeList=list=>(Array.isArray(list)?list:[]).map(x=>String(x).trim().toLowerCase()).filter((a,i,all)=>validAddress(a)&&all.indexOf(a)===i).slice(0,12);
const v=n=>Number.isFinite(Number(n))&&n!==null?Number(n):null;
const fixed=(n,d)=>Number(n).toLocaleString("it-IT",{minimumFractionDigits:d,maximumFractionDigits:d});
const inj=n=>n===null?"—":fixed(n,n<.01?6:4)+" INJ";
const clock=t=>new Date(t).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
const day=t=>{const d=new Date(t);return [d.getFullYear(),d.getMonth()+1,d.getDate()].join("-")};
const nightAt=t=>{const d=new Date(t);d.setHours(23,0,0,0);if(d.getTime()>t)d.setDate(d.getDate()-1);return d.getTime()};
const palette={white:new Color("#edfcff"),soft:new Color("#92aebf"),green:new Color("#4ce2ae"),red:new Color("#ff7089"),blue:new Color("#50c9ef"),card:new Color("#132939")};
let settings=Object.assign({addresses:[],apr:null,currency:"EUR",site:""},read("settings",{}));
settings.addresses=safeList(settings.addresses);
settings.apr=v(settings.apr)>0&&v(settings.apr)<=100?v(settings.apr):null;
settings.currency=settings.currency==="USD"?"USD":"EUR";
async function configure(){
 const dialog=new Alert();
 dialog.title="INJ NODE · CONFIGURA";
 dialog.message="Incolla gli indirizzi pubblici inj1 separati da virgole. Non inserire mai seed phrase o chiavi private.";
 dialog.addTextField("Wallet inj1 (fino a 12)",settings.addresses.join(", "));
 dialog.addTextField("APR netto % (facoltativo)",settings.apr===null?"":String(settings.apr));
 dialog.addTextField("Valuta EUR o USD",settings.currency);
 dialog.addAction("Salva");dialog.addCancelAction("Annulla");
 if(await dialog.presentAlert()!==0)return;
 const entered=dialog.textFieldValue(0).split(/[,;\s]+/).filter(Boolean);
 const rateRaw=dialog.textFieldValue(1).trim().replace(",",".");
 const rate=rateRaw?v(rateRaw):null;
 if(entered.length>12||entered.some(x=>!validAddress(x))||(rateRaw&&!(rate>0&&rate<=100))){
  const a=new Alert();a.title="Dati non validi";a.message="Controlla gli indirizzi inj1 e l'APR netto (0-100).";a.addAction("OK");await a.presentAlert();return;
 }
 settings.addresses=safeList(entered);
 settings.apr=rate;settings.currency=dialog.textFieldValue(2).trim().toUpperCase()==="USD"?"USD":"EUR";
 write("settings",settings);
}
const parameter=String(args.widgetParameter||"ALL").trim().toUpperCase();
const index=/^[1-9]\d?$/.test(parameter)?Number(parameter)-1:-1;
const selected=index>=0&&index<settings.addresses.length?[settings.addresses[index]]:settings.addresses.slice();
const selectedLabel=index>=0&&index<settings.addresses.length?"WALLET "+(index+1):selected.length+" WALLET";
async function getJSON(url){
 const req=new Request(url);req.timeoutInterval=7;
 const obj=await req.loadJSON();
 if(req.response&&req.response.statusCode>=400)throw Error("HTTP "+req.response.statusCode);
 return obj;
}
async function price(){
 try{const a=await getJSON("https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT");
  if(v(a.lastPrice)>0)return {usd:v(a.lastPrice),day24:v(a.priceChangePercent),source:"Binance"};}catch(_){}
 try{const a=await getJSON("https://api.coingecko.com/api/v3/simple/price?ids=injective-protocol&vs_currencies=usd&include_24hr_change=true");
  const x=a["injective-protocol"]||{};if(v(x.usd)>0)return {usd:v(x.usd),day24:v(x.usd_24h_change),source:"CoinGecko"};}catch(_){}
 return null;
}
async function nightSeries(start){
 try{const a=await getJSON("https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=1h&startTime="+start+"&endTime="+Date.now()+"&limit=24");
  const rows=(Array.isArray(a)?a:[]).filter(r=>v(r[1])>0&&v(r[2])>0&&v(r[3])>0&&v(r[4])>0);
  if(!rows.length)return null;
  return {start:v(rows[0][1]),hi:Math.max(...rows.map(x=>v(x[2]))),lo:Math.min(...rows.map(x=>v(x[3]))),points:rows.map(x=>v(x[4]))};
 }catch(_){return null}
}
function fromInj(coins){return (Array.isArray(coins)?coins:[]).filter(x=>x?.denom==="inj").reduce((s,x)=>s+Number(x.amount||0)/1e18,0)}
async function inspectWallet(address){
 for(const base of ["https://sentry.lcd.injective.network:443","https://lcd.injective.network"]){
  try{
   const [rewards,stake]=await Promise.all([
    getJSON(base+"/cosmos/distribution/v1beta1/delegators/"+address+"/rewards"),
    getJSON(base+"/cosmos/staking/v1beta1/delegations/"+address)
   ]);
   const r=fromInj(rewards.total),s=(stake.delegation_responses||[]).reduce((total,x)=>total+Number(x?.balance?.amount||0)/1e18,0);
   if(Number.isFinite(r)&&r>=0&&Number.isFinite(s)&&s>=0)return {address,rewards:r,stake:s};
  }catch(_){}
 }
 return null;
}
async function inspectAll(){
 const rows=Array(selected.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,selected.length)},async()=>{
  while(cursor<selected.length){const i=cursor++;rows[i]=await inspectWallet(selected[i]);}
 }));
 return rows;
}
function nightBaseline(rows){
 if(!rows.length||rows.some(x=>!x))return;
 const stamp=Date.now(),start=nightAt(stamp);
 if(Math.abs(stamp-start)>90*60*1000)return;
 const old=read("baseline",{});
 if(old.day===day(start)&&Math.abs(old.at-start)<=Math.abs(stamp-start))return;
 const byAddress={};rows.forEach(x=>byAddress[x.address]=x.rewards);
 write("baseline",{day:day(start),at:stamp,byAddress});
}
function overnight(rows,start){
 if(!rows.length||rows.some(x=>!x))return {n:null,kind:"N/D"};
 const baseline=read("baseline",{});
 if(baseline.day===day(start)&&Math.abs(Number(baseline.at)-start)<=90*60*1000){
  const deltas=rows.map(x=>v(baseline.byAddress?.[x.address])===null?null:x.rewards-v(baseline.byAddress[x.address]));
  if(deltas.every(x=>x!==null&&x>=-1e-8))
    return {n:deltas.reduce((a,b)=>a+Math.max(0,b),0),kind:"DELTA REWARD"};
 }
 if(settings.apr>0){
  const fraction=Math.min(1.1,Math.max(0,(Date.now()-start)/86400000));
  return {n:rows.reduce((sum,x)=>sum+x.stake*(settings.apr/100)/365*fraction,0),kind:"STIMA APR"};
 }
 return {n:null,kind:"N/D"};
}
async function euro(){
 if(settings.currency!=="EUR")return 1;
 try{const a=await getJSON("https://api.frankfurter.app/latest?from=USD&to=EUR");if(v(a.rates?.EUR)>0){write("fx",{rate:v(a.rates.EUR)});return v(a.rates.EUR)}}catch(_){}
 return v(read("fx",{}).rate);
}
function money(amount,rate){
 if(amount===null||!Number.isFinite(amount)||(settings.currency==="EUR"&&!(rate>0)))return "—";
 const n=settings.currency==="EUR"?amount*rate:amount;
 return (settings.currency==="EUR"?"€ ":"$ ")+fixed(n,n<10?4:2);
}
function historicalDraw(prices,change){
 if(!Array.isArray(prices)||prices.length<2)return null;
 const w=330,h=59,ctx=new DrawContext();ctx.size=new Size(w,h);ctx.opaque=false;ctx.respectScreenScale=true;
 const lo=Math.min(...prices),hi=Math.max(...prices),pad=Math.max(hi-lo,hi*.003,1e-7)*.2;
 const path=new Path();prices.forEach((p,i)=>{
  const x=3+(w-6)*i/(prices.length-1),y=3+(h-6)*(1-(p-(lo-pad))/(hi-lo+2*pad));
  if(i===0)path.move(new Point(x,y));else path.addLine(new Point(x,y));
 });
 ctx.setStrokeColor(change===null?palette.blue:change>=0?palette.green:palette.red);
 ctx.setLineWidth(2.6);ctx.addPath(path);ctx.strokePath();return ctx.getImage();
}
function txt(p,s,size,color,bold){
 const t=p.addText(String(s));t.textColor=color;t.font=bold?Font.boldSystemFont(size):Font.mediumSystemFont(size);
 t.lineLimit=1;t.minimumScaleFactor=.6;return t;
}
function card(p){const c=p.addStack();c.layoutVertically();c.cornerRadius=13;c.backgroundColor=palette.card;c.setPadding(10,12,9,12);return c}
function render(result,rate,family){
 const isSmall=family==="small"||String(family).startsWith("accessory"),isLarge=family==="large"||family==="extraLarge";
 const w=new ListWidget(),g=new LinearGradient();
 g.colors=[new Color("#060e1c"),new Color("#102b3a"),new Color("#07121e")];g.locations=[0,.58,1];g.startPoint=new Point(0,0);g.endPoint=new Point(1,1);
 w.backgroundGradient=g;w.setPadding(isSmall?12:16,isSmall?13:17,isSmall?11:15,isSmall?13:17);
 w.refreshAfterDate=new Date(Date.now()+15*60*1000);
 if(/^https:\/\/\S+$/.test(settings.site||""))w.url=settings.site;
 // Lock Screen has its own fixed iOS accessory sizes; maximize typography instead of
 // rendering the much taller Home Screen layout, which was being shrunk/clipped.
 if(family==="accessoryRectangular"){
  w.setPadding(1,2,0,2);
  const p=result.quote?money(result.quote.usd,rate):"—";
  const change=result.change===null?"—":(result.change>=0?"+":"")+fixed(result.change,2)+"%";
  const tint=result.change===null?palette.soft:result.change>=0?palette.green:palette.red;
  const row=w.addStack();row.layoutHorizontally();row.centerAlignContent();
  txt(row,"INJ",10,palette.soft,true);row.addSpacer(6);
  txt(row,p,19,palette.white,true);
  w.addSpacer(3);
  const trend=w.addStack();trend.layoutHorizontally();trend.centerAlignContent();
  txt(trend,"DALLE 23",9,palette.soft,true);trend.addSpacer(5);
  txt(trend,change,12,tint,true);
  w.addSpacer(3);
  const reward=w.addStack();reward.layoutHorizontally();reward.centerAlignContent();
  txt(reward,"REWARD",9,palette.soft,true);reward.addSpacer(5);
  txt(reward,result.reward===null?"—":fixed(result.reward,4)+" INJ",12,palette.white,true);
  return w;
 }
 if(family==="accessoryInline"){
  w.setPadding(0,0,0,0);
  const p=result.quote?money(result.quote.usd,rate):"—";
  const change=result.change===null?"":(" "+(result.change>=0?"+":"")+fixed(result.change,1)+"%");
  txt(w,"INJ "+p+change,12,palette.white,true);
  return w;
 }
 if(family==="accessoryCircular"){
  w.setPadding(1,0,0,0);
  const p=result.quote?money(result.quote.usd,rate):"—";
  txt(w,"INJ",11,palette.soft,true);w.addSpacer(3);
  txt(w,p,17,palette.white,true);
  return w;
 }
 const header=w.addStack();header.layoutHorizontally();txt(header,"◈ INJ NODE",isSmall?10:11,palette.white,true);header.addSpacer();
 txt(header,result.stale?"● CACHE":"● SYNC",8,result.stale?palette.soft:palette.blue,true);
 w.addSpacer(isSmall?10:14);
 const shownPrice=result.quote?money(result.quote.usd,rate):"—";
 const delta=result.change===null?"—":(result.change>=0?"+":"")+fixed(result.change,2)+"%";
 const deltaColor=result.change===null?palette.soft:result.change>=0?palette.green:palette.red;
 if(isSmall){
  txt(w,"INJ / "+settings.currency,10,palette.soft,true);w.addSpacer(5);
  txt(w,shownPrice,26,palette.white,true);w.addSpacer(5);
  txt(w,delta+"  DALLE 23",10,deltaColor,true);w.addSpacer();
  txt(w,"REWARD DISPONIBILI",8,palette.soft,true);w.addSpacer(4);
  txt(w,inj(result.reward),15,palette.green,true);w.addSpacer(8);
  txt(w,"AGG. "+clock(result.priceAt||result.at),8,palette.soft,false);
  if(!selected.length)txt(w,"CONFIGURA I WALLET",8,palette.red,true);
  return w;
 }
 const row=w.addStack();row.layoutHorizontally();
 const left=row.addStack();left.layoutVertically();left.spacing=4;
 txt(left,"INJ / "+settings.currency+" · PREZZO",10,palette.soft,true);
 txt(left,shownPrice,30,palette.white,true);
 txt(left,delta+"  DALLE 23:00",12,deltaColor,true);
 row.addSpacer(16);
 const right=row.addStack();right.layoutVertically();right.spacing=5;
 txt(right,"REWARD DISPONIBILI",9,palette.soft,true);
 txt(right,inj(result.reward),19,palette.green,true);
 txt(right,result.reward===null||!result.quote?"—":money(result.reward*result.quote.usd,rate),11,palette.soft,false);
 w.addSpacer(12);
 const overnightBox=card(w),title=overnightBox.addStack();title.layoutHorizontally();
 txt(title,"PRODUZIONE NELLA NOTTE",9,palette.soft,true);title.addSpacer();
 txt(title,result.overnight.kind,8,palette.blue,true);overnightBox.addSpacer(5);
 const vals=overnightBox.addStack();vals.layoutHorizontally();txt(vals,inj(result.overnight.n),16,palette.white,true);
 vals.addSpacer();txt(vals,result.overnight.n===null||!result.quote?"—":money(result.overnight.n*result.quote.usd,rate),12,palette.green,true);
 if(isLarge){
  w.addSpacer(12);txt(w,"TREND DALLA NOTTE",9,palette.soft,true);
  const img=historicalDraw(result.night?.points,result.change);
  if(img){const pic=w.addImage(img);pic.imageSize=new Size(330,59);}
  w.addSpacer(12);
  const stake=w.addStack();stake.layoutHorizontally();txt(stake,"IN STAKING",10,palette.soft,true);stake.addSpacer();
  txt(stake,inj(result.stake),11,palette.white,true);
  w.addSpacer(10);
  const accounts=card(w);txt(accounts,"DETTAGLIO WALLET",9,palette.soft,true);accounts.addSpacer(7);
  result.rows.slice(0,5).forEach((item,i)=>{
   if(i)accounts.addSpacer(5);
   const line=accounts.addStack();line.layoutHorizontally();
   txt(line,"WALLET "+(index>=0?index+1:i+1),10,palette.white,true);line.addSpacer();
   txt(line,inj(item.rewards),10,palette.green,true);
  });
  if(result.rows.length>5){accounts.addSpacer(4);txt(accounts,"+"+(result.rows.length-5)+" altri",9,palette.soft,false);}
 }
 w.addSpacer();
 const footer=w.addStack();footer.layoutHorizontally();
 txt(footer,selectedLabel,9,palette.soft,true);footer.addSpacer();
 txt(footer,(result.walletCacheAt?"WALLET CACHE ":"AGG. ")+clock(result.walletCacheAt||result.priceAt||result.at),9,palette.soft,false);
 if(!selected.length){w.addSpacer(4);txt(w,"APRI SCRIPTABLE PER CONFIGURARE",9,palette.red,true)}
 return w;
}
let preview="medium";
if(!config.runsInWidget){
 const menu=new Alert();menu.title="INJ NODE · WIDGET";
 menu.message="I wallet vanno configurati una volta: Scriptable non può leggere quelli memorizzati in Safari.";
 menu.addAction("Anteprima blocco schermo");menu.addAction("Anteprima media");menu.addAction("Configura / modifica");menu.addAction("Anteprima grande");menu.addAction("Anteprima piccola");menu.addCancelAction("Esci");
 const action=await menu.presentSheet();
 if(action===5||action<0){Script.complete();return;}
 if(action===2)await configure();
 preview=action===0?"accessoryRectangular":action===3?"large":action===4?"small":"medium";
}
const start=nightAt(Date.now()),cached=read("last",null);
const [quote,night,rows,fx]=await Promise.all([price(),nightSeries(start),inspectAll(),euro()]);
const walletOk=selected.length>0&&rows.length===selected.length&&rows.every(Boolean);
if(walletOk)nightBaseline(rows);
let result={
 at:Date.now(),quote,night,change:quote&&night?100*(quote.usd/night.start-1):null,
 reward:walletOk?rows.reduce((s,x)=>s+x.rewards,0):null,
 stake:walletOk?rows.reduce((s,x)=>s+x.stake,0):null,
 rows:walletOk?rows:[],walletOk,overnight:walletOk?overnight(rows,start):{n:null,kind:"N/D"},
 stale:!quote||(!walletOk&&selected.length>0),priceAt:quote?Date.now():null
};
if(!quote&&cached?.quote){result.quote=cached.quote;result.change=cached.change;result.priceAt=cached.priceAt;}
if(!walletOk&&cached?.walletOk&&cached?.selection===selectedLabel){
 result.reward=cached.reward;result.stake=cached.stake;result.rows=cached.rows;result.overnight=cached.overnight;result.walletCacheAt=cached.at;
}
if(quote||walletOk){
 const merged=Object.assign({},cached||{},result,{selection:selectedLabel});
 if(!walletOk&&cached?.walletOk&&cached.selection===selectedLabel){merged.walletOk=true;}
 write("last",merged);
}
const family=config.runsInWidget?(config.widgetFamily||"medium"):preview;
const widget=render(result,fx,family);Script.setWidget(widget);
if(!config.runsInWidget){
 if(family==="accessoryRectangular")await widget.presentAccessoryRectangular();
 else if(family==="large")await widget.presentLarge();
 else if(family==="small")await widget.presentSmall();
 else await widget.presentMedium();
}
Script.complete();
})().catch(e=>{console.error("INJ NODE: "+String(e));Script.complete();});
