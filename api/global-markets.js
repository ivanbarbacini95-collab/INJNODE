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
const MAXAGE=180000;
const cache=new Map();
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const clean=(r,meta={},symbol)=>{
 if(!r)return null;
 const m=r.meta||meta||{};
 const quotes=r.indicators?.quote?.[0]?.close||[];
 const closes=quotes.filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>0);
 const last=num(m.regularMarketPrice)??closes.at(-1);
 let prev=num(m.previousClose)??num(m.chartPreviousClose);
 if(!(prev>0)&&closes.length>1)prev=closes.at(-2);
 const price=typeof last==='number'&&Number.isFinite(last)&&last>0?last:null;
 if(price===null)return null;
 const time=num(m.regularMarketTime)||num(r.timestamp?.at(-1))||null;
 return {price,change:prev>0?((price-prev)/prev)*100:null,previous:prev>0?prev:null,time,currency:String(m.currency||'').slice(0,5),symbol,source:'Yahoo Finance'};
};
function unwrap(data,symbol){
 const matches=data?.spark?.result;
 if(Array.isArray(matches)){
  const row=matches.find(x=>x.symbol===symbol)||matches[0];
  const r=row?.response?.[0]||row?.chart?.result?.[0];
  return clean(r,r?.meta||{},symbol);
 }
 return clean(data?.chart?.result?.[0],{},symbol);
}
async function fetchJson(url,timeout){
 const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),timeout);
 try{
  const resp=await fetch(url,{signal:ctrl.signal,headers:{'Accept':'application/json','User-Agent':'Mozilla/5.0 (compatible; INJNode-MarketOverview/1.0)'}});
  if(!resp.ok)return null;
  return await resp.json();
 }catch(_){return null}finally{clearTimeout(t)}
}
async function fromSpark(batch){
 const url='https://query2.finance.yahoo.com/v7/finance/spark?symbols='+encodeURIComponent(batch.join(','))+'&range=5d&interval=1d';
 const data=await fetchJson(url,2400);if(!data?.spark?.result)return new Map();
 const out=new Map();for(const rec of data.spark.result||[]){
  const symbol=rec?.symbol;
  const x=unwrap({spark:{result:[rec]}},symbol);
  if(symbol&&x)out.set(symbol,x);
 }
 return out;
}
async function fromChart(symbol){
 const endpoint='https://query2.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=5d&interval=1d';
 const data=await fetchJson(endpoint,2100);
 return unwrap(data,symbol);
}
async function getGroup(group){
 const definitions=S[group];const symbols=definitions.map(x=>x[2]);const results=new Map();
 const batches=[];for(let i=0;i<symbols.length;i+=12)batches.push(symbols.slice(i,i+12));
 const loaded=await Promise.all(batches.map(fromSpark));
 loaded.forEach(m=>m.forEach((v,k)=>results.set(k,v)));
 const missing=symbols.filter(s=>!results.has(s));
 if(missing.length){
  const jobs=missing.slice();const workers=Array.from({length:Math.min(8,jobs.length)},async()=>{
   while(jobs.length){
    const symbol=jobs.shift();const r=await fromChart(symbol);
    if(r)results.set(symbol,r);
   }
  });await Promise.all(workers);
 }
 return {group,asOf:Date.now(),source:'Yahoo Finance',delayed:true,session:'last market session',quotes:definitions.map(([id,name,symbol])=>({id,name,symbol,...(results.get(symbol)||{price:null,change:null,previous:null,time:null,currency:null,source:'Yahoo Finance'})})),available:results.size};
}
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
 const group=String(req.query?.group||'');
 if(!Object.prototype.hasOwnProperty.call(S,group))return res.status(400).json({error:'Unknown market group'});
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','public, s-maxage=180, stale-while-revalidate=480');
 res.setHeader('X-Content-Type-Options','nosniff');
 const saved=cache.get(group);if(saved&&Date.now()-saved.asOf<MAXAGE)return res.status(200).json(saved);
 const result=await getGroup(group);
 if(result.available>0)cache.set(group,result);
 return res.status(result.available?200:503).json(result);
}
