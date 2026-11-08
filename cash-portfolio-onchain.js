/* INJ Node Cash Reserve · public read-only cross-chain portfolio scanners.
 * Fixed watch-only accounts deliberately not shown in the UI. Public blockchain
 * identifiers are inspectable in client-side JavaScript; no secrecy is implied. */
(() => {
  'use strict';
  const INJ_ACCOUNT = 'inj1nj4ahf4p96ulu7r7n3h27u4rlud5qlc2jy3zyg';
  const SOL_ACCOUNT = '5atuLUBzVvj8EBJKt4oeTd1Ci9cZqcX6LKELSypNQGpK';
  const INJ_USDC = 'erc20:0xa00c59ff5a080d2b954d0c75e46e22a0c371235a';
  const SOL_PROGRAMS = [
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
  ];
  const MINTS = Object.freeze({
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':{symbol:'USDC', name:'USD Coin', kind:'stable'},
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB':{symbol:'USDT', name:'Tether USD', kind:'stable'},
    'So11111111111111111111111111111111111111112':{symbol:'wSOL',name:'Wrapped SOL',kind:'token'}
  });
  const INJ_LCD = ['https://sentry.lcd.injective.network:443','https://lcd.injective.network','https://1rpc.io/inj-lcd'];
  const SOL_RPC = ['https://api.mainnet-beta.solana.com','https://solana-rpc.publicnode.com'];
  const APR_URL = 'https://api.ui.injective.network/api/v1/cache/stats/apr';

  async function json(url, options = {}, ms = 6700) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), ms);
    try {
      const response = await fetch(url,{cache:'no-store',...options,signal:abort.signal});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function lcd(path) {
    let err;
    for (const host of INJ_LCD) {
      try {return await json(host+path,{},6000);}
      catch (e) {err=e;}
    }
    throw err || new Error('Injective LCD unavailable');
  }
  async function rpc(host, method, params, id) {
    const result = await json(host,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:id || 1,method,params})
    },9500);
    if (result.error || !result.result) throw new Error(result.error && result.error.message || 'Solana RPC unavailable');
    return result.result;
  }
  function qty(raw,decimals=0) {
    if(!/^\d+$/.test(String(raw ?? ''))) throw new Error('Non-numeric balance');
    const n=BigInt(raw),d=Math.max(0,Math.min(30,Number(decimals)||0)),p=10n**BigInt(d);
    const whole=n/p,frac=(n%p).toString().padStart(d,'0');
    const significant=frac.slice(0,10).replace(/0+$/,'');
    const extra=n>0n&&whole===0n&&!significant;
    const numberValue=Number(n)/Number(p);
    return {
      positive:n>0n,
      text:extra?'<0,0000000001':whole.toLocaleString('it-IT')+(significant?','+significant:''),
      value:Number.isFinite(numberValue)?numberValue:null
    };
  }
  function token(name,symbol,kind,raw,decimals,note) {
    return {name,symbol,kind,amount:qty(raw,decimals),note:note||''};
  }
  async function injectiveBank() {
    const items=[];
    let key='', pages=0;
    const seen=new Set();
    do {
      const path='/cosmos/bank/v1beta1/balances/'+encodeURIComponent(INJ_ACCOUNT)+'?pagination.limit=200'+(key?'&pagination.key='+encodeURIComponent(key):'');
      const response=await lcd(path);
      if(!Array.isArray(response.balances)) throw new Error('Invalid Injective balances');
      items.push(...response.balances);
      key=response.pagination?.next_key||'';
      if(key&&seen.has(key))throw new Error('Injective pagination repeated');
      if(key)seen.add(key);
      pages++;
      if(pages===25&&key)throw new Error('Injective balances truncated');
    }while(key);
    const active=items.filter(b=>/^\d+$/.test(String(b.amount))&&BigInt(b.amount)>0n);
    const results=await Promise.all(active.map(async(b,i)=>{
      const denom=String(b.denom||'');
      if(denom==='inj')return token('Injective','INJ','native',b.amount,18,'Disponibile');
      if(denom.toLowerCase()===INJ_USDC)return token('USD Coin','USDC','stable',b.amount,6,'USDC nativo Circle');
      try {
        const r=await lcd('/cosmos/bank/v1beta1/denoms_metadata/'+encodeURIComponent(denom));
        const m=r.metadata;
        const unit=m?.denom_units?.find(row=>row.denom===m.display);
        if(m&&unit) {
          const label=String(m.symbol||m.name||'Token').slice(0,50);
          const short=String(m.symbol||'TOK').slice(0,12);
          return token(label,short,'token',b.amount,unit.exponent,'Disponibile');
        }
      }catch(_){}
      const v=token('Token Injective '+(i+1),'TOK','token',b.amount,0,'Unità base · metadati non disponibili');
      v.unformatted=true;
      return v;
    }));
    return {assets:results,usdc:results.find(a=>a.kind==='stable'&&a.symbol==='USDC')?.amount.value||0};
  }
  async function solanaBank() {
    let responses, error;
    for (const host of SOL_RPC) {
      try {
        responses=await Promise.all([
          rpc(host,'getBalance',[SOL_ACCOUNT,{commitment:'confirmed'}],1),
          rpc(host,'getTokenAccountsByOwner',[SOL_ACCOUNT,{programId:SOL_PROGRAMS[0]},{encoding:'jsonParsed',commitment:'confirmed'}],2),
          rpc(host,'getTokenAccountsByOwner',[SOL_ACCOUNT,{programId:SOL_PROGRAMS[1]},{encoding:'jsonParsed',commitment:'confirmed'}],3)
        ]);
        if(!Array.isArray(responses[1].value)||!Array.isArray(responses[2].value))throw new Error('Invalid SPL accounts');
        break;
      } catch(e){responses=null;error=e;}
    }
    if(!responses)throw error||new Error('Solana unavailable');
    const assets=[];
    const lamports=String(responses[0].value??'0');
    if(qty(lamports,9).positive)assets.push(token('Solana','SOL','native',lamports,9,'SOL disponibile'));
    const byMint=new Map();
    let unsupported=0;
    for(const arr of [responses[1].value,responses[2].value]) {
      for(const row of arr) {
        const info=row?.account?.data?.parsed?.info;
        const mint=info?.mint;
        const bal=info?.tokenAmount;
        if(!mint||!bal||!/^\d+$/.test(String(bal.amount))){unsupported++;continue;}
        const dec=Number(bal.decimals)||0, existing=byMint.get(mint);
        if(existing&&existing.dec!==dec)throw new Error('Inconsistent token decimals');
        byMint.set(mint,{dec,raw:(existing?.raw||0n)+BigInt(bal.amount)});
      }
    }
    let missing=0;
    for(const [mint,amount]of byMint){
      if(amount.raw===0n)continue;
      const official=MINTS[mint];
      // Never infer stablecoin identity from an unverified token symbol.
      const label=official||{symbol:'TOK',name:'Token Solana '+(++missing),kind:'token'};
      assets.push(token(label.name,label.symbol,label.kind,amount.raw.toString(),amount.dec,official?'Token ufficiale':'Token SPL · nome non verificato'));
    }
    return {
      assets,
      usdc:assets.find(a=>a.kind==='stable'&&a.symbol==='USDC')?.amount.value||0,
      usdt:assets.find(a=>a.kind==='stable'&&a.symbol==='USDT')?.amount.value||0,
      unsupported
    };
  }
  async function injectiveYield() {
    const [delegated,rewards,aprResponse]=await Promise.allSettled([
      lcd('/cosmos/staking/v1beta1/delegations/'+encodeURIComponent(INJ_ACCOUNT)+'?pagination.limit=200'),
      lcd('/cosmos/distribution/v1beta1/delegators/'+encodeURIComponent(INJ_ACCOUNT)+'/rewards'),
      json(APR_URL,{},5000)
    ]);
    if(delegated.status==='rejected')throw new Error('Staking Injective non verificabile');
    const delegations=delegated.value?.delegation_responses;
    if(!Array.isArray(delegations))throw new Error('Risposta delegazioni non valida');
    let staked=0;
    for(const entry of delegations) {
      if(entry.balance?.denom==='inj')staked+=qty(entry.balance.amount,18).value||0;
    }
    const totalRewards=rewards.status==='fulfilled' ? (rewards.value.total||[])
      .filter(x=>x.denom==='inj')
      .reduce((acc,x)=>acc+(qty(String(x.amount||'0').split('.')[0],18).value||0),0) : null;
    const v=aprResponse.status==='fulfilled'?Number(aprResponse.value?.apr):NaN;
    const apr=Number.isFinite(v)&&v>0&&v<=100?(v<=1?v*100:v):null;
    return {
      positions:staked>0?[{
        name:'Staking Injective',network:'Injective',amount:staked,asset:'INJ',
        apr, rewards:totalRewards,
        day:apr==null?null:staked*(apr/100)/365,
        rewardNote:'Reward osservate on-chain · stima giornaliera con APR di rete'
      }]:[],
      stakingObserved:staked>0,
      aprAvailable:apr!=null,
      rewardsAvailable:totalRewards!=null
    };
  }
  async function scan() {
    const done=await Promise.allSettled([injectiveBank(),solanaBank(),injectiveYield()]);
    return {
      inj:done[0].status==='fulfilled'?done[0].value:null,
      sol:done[1].status==='fulfilled'?done[1].value:null,
      yield:done[2].status==='fulfilled'?done[2].value:null,
      errors:{
        inj:done[0].status==='rejected',
        sol:done[1].status==='rejected',
        yield:done[2].status==='rejected'
      }
    };
  }
  window.INJ_CASH_PORTFOLIO=Object.freeze({scan});
})();
