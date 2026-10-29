/* INJ Node · independent world-market quote gateway.
 * Fixed watchlists only; server-side fetch; no third-party widgets, no secrets.
 * Public Yahoo Finance chart/spark data are unofficial and may be delayed or rate-limited.
 * Never invent an unavailable quote.
 */
const S={
 indices:[['sp500','S&P 500','^GSPC'],['nasdaq','NASDAQ','^IXIC'],['dow','Dow Jones','^DJI'],['russell','Russell 2000','^RUT'],['stoxx','Euro Stoxx 50','^STOXX50E'],['dax','DAX','^GDAXI'],['cac','CAC 40','^FCHI'],['ftse','FTSE 100','^FTSE'],['nikkei','Nikkei 225','^N225'],['hangseng','Hang Seng','^HSI'],['nifty','Nifty 50','^NSEI'],['asx','ASX 200','^AXJO'],['bovespa','Ibovespa','^BVSP']],
 sectors:[['technology','Tecnologia','XLK'],['finance','Finanza','XLF'],['energy','Energia','XLE'],['healthcare','Sanità','XLV'],['industrial','Industria','XLI'],['consumer','Consumi discrezionali','XLY'],['staples','Beni essenziali','XLP'],['utilities','Utilities','XLU'],['realestate','Immobiliare','XLRE'],['materials','Materiali','XLB'],['communications','Comunicazioni','XLC']],
 stocks:[['aapl','Apple','AAPL'],['msft','Microsoft','MSFT'],['nvda','NVIDIA','NVDA'],['jpm','JPMorgan','JPM'],['bac','Bank of America','BAC'],['xom','ExxonMobil','XOM'],['cvx','Chevron','CVX'],['lly','Eli Lilly','LLY'],['jnj','Johnson & Johnson','JNJ'],['cat','Caterpillar','CAT'],['ge','GE Aerospace','GE'],['amzn','Amazon','AMZN'],['tsla','Tesla','TSLA'],['wmt','Walmart','WMT'],['cost','Costco','COST'],['nee','NextEra Energy','NEE'],['duk','Duke Energy','DUK'],['googl','Alphabet','GOOGL'],['meta','Meta','META'],['amt','American Tower','AMT'],['lin','Linde','LIN'],['fcx','Freeport-McMoRan','FCX']],
 etf:[['spy','S&P 500 ETF','SPY'],['qqq','Nasdaq 100 ETF','QQQ'],['iwm','Small Caps ETF','IWM'],['efa','Developed Markets','EFA'],['eem','Emerging Markets','EEM'],['tlt','Long Treasury','TLT'],['gld','Gold ETF','GLD'],['vnq','Real Estate ETF','VNQ']],
 forex:[['eurusd','EUR / USD','EURUSD=X'],['gbpusd','GBP / USD','GBPUSD=X'],['usdjpy','USD / JPY','JPY=X'],['usdchf','USD / CHF','CHF=X'],['audusd','AUD / USD','AUDUSD=X'],['usdcny','USD / CNY','CNY=X'],['usdinr','USD / INR','INR=X']],
 commodities:[['gold','Oro','GC=F'],['silver','Argento','SI=F'],['wti','Petrolio WTI','CL=F'],['brent','Petrolio Brent','BZ=F'],['gas','Gas naturale','NG=F'],['copper','Rame','HG=F'],['corn','Mais','ZC=F']],
 bonds:[['us10y','USA 10Y rendimento','^TNX'],['us30y','USA 30Y rendimento','^TYX'],['bnd','Bond aggregate ETF','BND'],['ief','Treasury 7-10Y ETF','IEF'],['shy','Treasury 1-3Y ETF','SHY'],['lqd','Corporate IG ETF','LQD'],['hyg','High Yield ETF','HYG'],['tip','Inflation-linked ETF','TIP']]
};
const MAXAGE=3*60*1000;
const cache=new Map();
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const number=n=>finite(n)?n:null;
function normalizeChart(result,symbol){
 if(!result)return null;
 const meta=result.meta||{};
 const values=(result.indicators?.quote?.[0]?.close||[]).filter(v=>finite(v)&&v>0);
 const price=number(meta.regularMarketPrice)??values.at(-1)??null;
 const previous=number(meta.previousClose)??number(meta.chartPreviousClose)??values.at(-2)??null;
 if(!finite(price)||price<=0)return null;
 return {symbol,price,change:finite(previous)&&previous>0?(price/previous-1)*100:null,
  previous:finite(previous)&&previous>0?previous:null,time:number(meta.regularMarketTime)||number(result.timestamp?.at(-1))||null,
  currency:String(meta.currency||'').slice(0,7),source:'Yahoo Finance'};
}
async function request(url,ms=5200){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
 try{
  const resp=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json, text/plain, */*','User-Agent':UA}});
  if(!resp.ok)return {data:null,status:resp.status};
  return {data:await resp.json(),status:resp.status};
 }catch(_){return {data:null,status:0};}finally{clearTimeout(timer)}
}
async function spark(symbols){
 const url='https://query1.finance.yahoo.com/v7/finance/spark?symbols='+encodeURIComponent(symbols.join(','))+'&range=5d&interval=1d';
 const result=await request(url,3400);
 const map=new Map();
 for(const item of result.data?.spark?.result||[]){
  const symbol=item.symbol,chart=item.response?.[0];
  const quote=normalizeChart(chart,symbol);
  if(symbol&&quote)map.set(symbol,quote);
 }
 return {quotes:map,status:result.status};
}
function parseNasdaqNumber(v){
 if(typeof v==='number'&&Number.isFinite(v))return v;
 if(typeof v!=='string')return null;
 const cleaned=v.replace(/[,$%\s]/g,'').trim();
 if(!/^[-+]?\d+(?:\.\d+)?$/.test(cleaned))return null;
 const n=Number(cleaned);return Number.isFinite(n)?n:null;
}
async function nasdaq(symbol,assetClass='stocks'){
 if(!/^[A-Z][A-Z0-9.\-]{0,12}$/.test(symbol))return null;
 const url='https://api.nasdaq.com/api/quote/'+encodeURIComponent(symbol)+'/info?assetclass='+assetClass;
 const response=await request(url,3000);
 const raw=response.data?.data?.primaryData;
 if(!raw)return null;
 const price=parseNasdaqNumber(raw.lastSalePrice);
 if(!(price>0))return null;
 const change=parseNasdaqNumber(raw.percentageChange);
 const delta=parseNasdaqNumber(raw.netChange);
 let dt=Date.parse(raw.lastTradeTimestamp||'');
 const previous=delta!==null&&price-delta>0?price-delta:null;
 return {symbol,price,change:change??(previous?(price/previous-1)*100:null),previous,time:Number.isFinite(dt)?Math.round(dt/1000):null,currency:'USD',source:'Nasdaq'};
}
async function chart(symbol,group){
 if(group==='stocks'||group==='sectors'||group==='etf'){
  const fromNasdaq=await nasdaq(symbol,group==='etf'||group==='sectors'?'etf':'stocks');
  if(fromNasdaq)return {quote:fromNasdaq,status:200};
 }
 const tail='/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=5d&interval=1d';
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
  const response=await request('https://'+host+tail,2800);
  const data=normalizeChart(response.data?.chart?.result?.[0],symbol);
  if(data)return {quote:data,status:200};
  if(response.status===429)return {quote:null,status:429};
 }
 return {quote:null,status:0};
}
async function getGroup(group){
 const def=S[group],symbols=def.map(q=>q[2]),found=new Map(),errors=[];
 // One inexpensive batch attempt before chart fallbacks; individual requests use
 // bounded concurrency to avoid exhausting serverless time and provider quotas.
 for(let i=0;i<symbols.length;i+=12){
  const chunk=symbols.slice(i,i+12);
  const r=await spark(chunk);
  r.quotes.forEach((v,k)=>found.set(k,v));
  if(!r.quotes.size)errors.push(r.status);
 }
 const pending=symbols.filter(symbol=>!found.has(symbol));
 let next=0;
 await Promise.all(Array.from({length:Math.min(8,pending.length)},async()=>{
  while(next<pending.length){
   const symbol=pending[next++];
   const r=await chart(symbol,group);
   if(r.quote)found.set(symbol,r.quote);
   else errors.push(r.status);
  }
 }));
 return {group,asOf:Date.now(),source:[...new Set([...found.values()].map(q=>q.source))].join(' / ')||'Yahoo Finance / Nasdaq (unofficial)',delayed:true,
  session:'latest available quote',quotes:def.map(([id,name,symbol])=>({
   id,name,symbol,...(found.get(symbol)||{price:null,change:null,previous:null,time:null,currency:null,source:'Yahoo Finance'})
  })),available:found.size,total:def.length,providerStatus:errors.includes(429)?'rate-limited':found.size?'partial':'unavailable'};
}
export const config={maxDuration:30};
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 const group=String(req.query?.group||'').toLowerCase();
 if(!Object.prototype.hasOwnProperty.call(S,group))return res.status(400).json({error:'Unknown market group'});
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','public, s-maxage=180, stale-while-revalidate=480');
 res.setHeader('X-Content-Type-Options','nosniff');
 const saved=cache.get(group);
 if(saved&&Date.now()-saved.asOf<MAXAGE)return res.status(200).json(saved);
 const result=await getGroup(group);
 if(result.available)cache.set(group,result);
 // Always return structured JSON; unavailable instruments retain names/symbols,
 // and the client can report an outage without hiding the entire section.
 return res.status(200).json(result);
}
