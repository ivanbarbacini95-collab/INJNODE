/* INJC market snapshot. Run by GitHub Actions when US markets open.
   Publishes actual Yahoo Finance ETF prints only; NEVER synthesizes a quote. */
import fs from 'node:fs/promises';
const path='market-data/injc-etf-quotes.json';
const now=new Date();
const tz=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const parts=Object.fromEntries(tz.formatToParts(now).map(p=>[p.type,p.value]));
const nyMin=(Number(parts.hour)%24)*60+Number(parts.minute);
if(['Sat','Sun'].includes(parts.weekday)||nyMin<560||nyMin>1000){
 console.log('Outside US exchange snapshot window; skipping.');
 process.exit(0);
}
const safeNum=x=>x===null||x===undefined||!Number.isFinite(Number(x))?null:Number(x);
let payload;
for (const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']) {
 try {
  const response=await fetch('https://'+host+'/v8/finance/chart/INJC?range=1d&interval=1m&includePrePost=false',{signal:AbortSignal.timeout(16000),headers:{accept:'application/json','user-agent':'Mozilla/5.0 (compatible; INJNodeMarketMonitor/1.0)'}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const obj=(await response.json())?.chart?.result?.[0];
  if(!obj)throw new Error('Missing quoted data');
  const meta=obj.meta||{},quote=obj.indicators?.quote?.[0]||{};
  const points=(obj.timestamp||[]).map((t,i)=>({time:new Date(Number(t)*1000).toISOString(),open:safeNum(quote.open?.[i]),high:safeNum(quote.high?.[i]),low:safeNum(quote.low?.[i]),close:safeNum(quote.close?.[i]),volume:safeNum(quote.volume?.[i])})).filter(p=>p.close!==null&&p.close>0);
  if(!points.length)throw new Error('No actual INJC trades yet');
  const last=points.at(-1);
  const price=safeNum(meta.regularMarketPrice)??last.close;
  const prev=safeNum(meta.chartPreviousClose)??safeNum(meta.previousClose);
  const quoteTime=new Date(Number(meta.regularMarketTime||0)*1000||Date.parse(last.time)).toISOString();
  const dHigh=safeNum(meta.regularMarketDayHigh)??Math.max(...points.map(p=>p.high??p.close));
  const dLow=safeNum(meta.regularMarketDayLow)??Math.min(...points.map(p=>p.low??p.close));
  payload={schemaVersion:1,ticker:'INJC',generatedAt:now.toISOString(),source:'Yahoo Finance chart API (may be delayed)',quote:{
    price,previous:prev,change:prev&&prev>0?(price-prev)/prev*100:null,quoteTime,
    open:points[0].open,high:dHigh,low:dLow,volume:safeNum(meta.regularMarketVolume)??points.reduce((s,p)=>s+(p.volume??0),0)
   },points:points.slice(-400)};
  if(!Number.isFinite(price)||price<=0)throw new Error('Invalid market price');
  break;
 }catch(e){console.warn(host+': '+e.message);}
}
if(!payload){console.log('No valid ETF trading snapshot yet. Keeping placeholders.');process.exit(0);}
const old=JSON.parse(await fs.readFile(path,'utf8'));
if(old.quote&&Date.parse(old.quote.quoteTime)>=Date.parse(payload.quote.quoteTime)&&old.quote.price===payload.quote.price&&old.quote.volume===payload.quote.volume){
 console.log('No new verified market event; skipping data commit.');process.exit(0);
}
await fs.writeFile(path,JSON.stringify(payload,null,2)+'\n');
console.log('Verified quote snapshot: '+payload.quote.quoteTime+' '+payload.quote.price+' '+payload.quote.volume+' shares');
