/* INJ Node Radar v16.00.80
   Read-only block telemetry: no fabricated transactions or price signals.
*/
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const endpoints=['https://sentry.lcd.injective.network:443','https://lcd.injective.network','https://1rpc.io/inj-lcd'];
  const latestPath='/cosmos/base/tendermint/v1beta1/blocks/latest';
  const blockPath=height=>'/cosmos/base/tendermint/v1beta1/blocks/'+height;
  const state={blocks:new Map(),latest:0,lastSuccess:0,chain:'',loading:false,first:true};
  function language(){try{return localStorage.getItem('inj_node_language_v1')==='en'?'en':'it';}catch(_){return 'it';}}
  const translate=(it,en)=>language()==='en'?en:it;
  const strings={
    subtitle:['Intelligence di rete · Injective Mainnet','Network intelligence · Injective Mainnet'],
    height:['ULTIMO BLOCCO','LATEST BLOCK'],
    transactions:['TX · ULTIMI 12 BLOCCHI','TX · LAST 12 BLOCKS'],
    interval:['INTERVALLO MEDIO','AVERAGE BLOCK INTERVAL'],
    waiting:['In attesa della rete','Waiting for network'],
    actualCounts:['Transazioni incluse, non stimate','Included transactions, not estimates'],
    confirmedBlocks:['Tra i blocchi confermati','Between confirmed blocks'],
    screenTitle:['Attività blockchain','Blockchain activity'],
    liveBlocks:['Rilevamento nuovi blocchi','Tracking new blocks'],
    signal:['SEGNALI ON-CHAIN','ON-CHAIN SIGNALS'],
    blockActivity:['TRANSAZIONI PER BLOCCO','TRANSACTIONS PER BLOCK'],
    activityNote:['Le colonne rappresentano il numero effettivo di transazioni incluse nei blocchi letti.','Each bar shows the actual count of transactions included in a retrieved block.'],
    liveFeed:['FLUSSO BLOCKCHAIN','BLOCKCHAIN FEED'],
    feedTitle:['Ultimi blocchi','Latest blocks'],
    blockNumber:['BLOCCO','BLOCK'],
    blockTime:['ORA','TIME'],
    connecting:['Connessione alla blockchain Injective…','Connecting to Injective blockchain…'],
    source:['Fonte: endpoint pubblici Injective LCD','Source: public Injective LCD endpoints'],
    analysis:['RETE · IN TEMPO REALE','NETWORK · REALTIME'],
    insightTitle:["Densità dell'attività",'Network activity density'],
    insightText:['Il radar visualizza solo l’attività osservata nei blocchi acquisiti. Non rappresenta ordini, rendimenti o previsioni di prezzo.','This radar shows observed block activity only. It does not represent orders, yields or price predictions.'],
    txPerBlock:['TX MEDIE / BLOCCO','AVERAGE TX / BLOCK'],
    privacy:['Dati di rete pubblici · nessun wallet richiesto','Public network data · no wallet needed']
  };
  function localize(){
    document.documentElement.lang=language();
    document.querySelectorAll('[data-t]').forEach(node=>{
      const key=node.dataset.t;
      if(strings[key])node.textContent=strings[key][language()==='en'?1:0];
    });
    $('radarBack')?.setAttribute('aria-label',translate('Torna alla Home','Return Home'));
    render();
  }
  function num(value){const n=Number(value);return Number.isFinite(n)?n:NaN;}
  function format(n){return n.toLocaleString(language()==='en'?'en-US':'it-IT');}
  function timeLabel(t){
    return new Date(t).toLocaleTimeString(language()==='en'?'en-US':'it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }
  function set(id,value){const node=$(id);if(node&&node.textContent!==value)node.textContent=value;}
  function normalized(json){
    const block=json?.block;
    const header=block?.header;
    const height=num(header?.height);
    const time=Date.parse(header?.time||'');
    const rawTx=block?.data?.txs??json?.sdk_block?.data?.txs;
    if(!Number.isSafeInteger(height)||height<1||!Number.isFinite(time))throw new Error('Invalid block response');
    const txs=Array.isArray(rawTx)?rawTx.length:null;
    return {height,time,txs,hash:String(json?.block_id?.hash||''),chain:String(header?.chain_id||'')};
  }
  async function fetchJson(path){
    let failure;
    for(const base of endpoints){
      const ctrl=new AbortController();
      const timer=setTimeout(()=>ctrl.abort(),3600);
      try{
        const result=await fetch(base+path,{signal:ctrl.signal,cache:'no-store'});
        if(!result.ok)throw new Error('HTTP '+result.status);
        return await result.json();
      }catch(err){failure=err;}
      finally{clearTimeout(timer);}
    }
    throw failure||new Error('LCD unavailable');
  }
  function put(block){
    if(!state.blocks.has(block.height))state.blocks.set(block.height,block);
    else state.blocks.set(block.height,{...state.blocks.get(block.height),...block});
    state.latest=Math.max(state.latest,block.height);
    if(block.chain)state.chain=block.chain;
    const keep=state.latest-30;
    for(const height of state.blocks.keys())if(height<keep)state.blocks.delete(height);
  }
  function recent(){
    return [...state.blocks.values()].sort((a,b)=>b.height-a.height)
      .filter(b=>b.height<=state.latest&&b.height>state.latest-12).slice(0,12);
  }
  function averageInterval(rows){
    const deltas=[];
    for(let i=0;i<rows.length-1;i++){
      if(rows[i].height-rows[i+1].height!==1)continue;
      const d=(rows[i].time-rows[i+1].time)/1000;
      if(d>0&&d<180)deltas.push(d);
    }
    return deltas.length?deltas.reduce((a,b)=>a+b,0)/deltas.length:NaN;
  }
  function status(online){
    const node=$('radarStatus');
    node?.classList.toggle('live',online);
    node?.classList.toggle('offline',!online);
    set('radarStatusText',online?'LIVE':translate('RETE NON DISPONIBILE','NETWORK UNAVAILABLE'));
  }
  function renderRadar(rows){
    const host=$('radarPips');if(!host)return;
    host.replaceChildren();
    for(const [i,block] of rows.entries()){
      // Deterministic placement based on genuine retrieved height and tx count.
      const angle=((block.height*137.508)%360)*Math.PI/180;
      const radius=.22+.17*(block.txs===null?0.5:Math.min(1,block.txs/60));
      const x=50+Math.cos(angle)*radius*100;
      const y=50+Math.sin(angle)*radius*100;
      const node=document.createElement('i');
      node.className='radar-pip';
      node.style.setProperty('--px',x.toFixed(2)+'%');
      node.style.setProperty('--py',y.toFixed(2)+'%');
      node.style.setProperty('--sz',(i===0?9:5)+'px');
      node.title='#'+block.height;
      host.append(node);
    }
  }
  function renderBars(rows){
    const host=$('radarBars');if(!host)return;
    host.replaceChildren();
    const data=rows.slice().reverse();
    const max=Math.max(1,...data.map(r=>r.txs||0));
    const pad=12-data.length;
    for(let i=0;i<pad;i++){const spacer=document.createElement('span');spacer.className='radar-bar';spacer.style.setProperty('--h','2%');spacer.style.opacity='.2';host.append(spacer);}
    for(const block of data){
      const bar=document.createElement('span');bar.className='radar-bar';
      bar.style.setProperty('--h',block.txs===null?'2%':Math.max(3,100*block.txs/max).toFixed(2)+'%');
      bar.title='#'+block.height+' · '+(block.txs??'—')+' TX';
      host.append(bar);
    }
    set('radarActivityScale',data.length?String(max)+' TX':'—');
  }
  function renderFeed(rows){
    const host=$('radarFeed');if(!host)return;
    if(!rows.length){
      host.replaceChildren();
      const placeholder=document.createElement('div');
      placeholder.className='radar-feed-placeholder';
      placeholder.textContent=translate('Connessione alla blockchain Injective…','Connecting to Injective blockchain…');
      host.append(placeholder);return;
    }
    const fragment=document.createDocumentFragment();
    for(const block of rows){
      const row=document.createElement('div');row.className='radar-row';
      const height=document.createElement('strong');height.textContent='#'+format(block.height);
      const count=document.createElement('b');count.textContent=block.txs===null?'—':format(block.txs);
      const stamp=document.createElement('time');stamp.dateTime=new Date(block.time).toISOString();stamp.textContent=timeLabel(block.time);
      row.append(height,count,stamp);fragment.append(row);
    }
    host.replaceChildren(fragment);
  }
  function render(){
    const rows=recent();
    const latest=rows[0];
    const txRows=rows.filter(b=>b.txs!==null);
    const allAvailable=rows.length&&txRows.length===rows.length;
    const txCount=allAvailable?txRows.reduce((acc,b)=>acc+b.txs,0):NaN;
    const interval=averageInterval(rows);
    const density=allAvailable?txCount/rows.length:NaN;
    set('radarHeight',latest?format(latest.height):'—');
    if(latest){
      const age=Math.max(0,Math.round((Date.now()-latest.time)/1000));
      set('radarBlockAge',age<60?translate('Blocco di ','Block from ')+age+' s '+translate('fa','ago'):timeLabel(latest.time));
    }
    set('radarTransactions',Number.isFinite(txCount)?format(txCount):'—');
    set('radarTxWindow',rows.length?rows.length+'/12 '+translate('blocchi letti','blocks read'):translate('In attesa della rete','Waiting for network'));
    set('radarInterval',Number.isFinite(interval)?interval.toFixed(1)+' s':'—');
    set('radarIntervalWindow',Number.isFinite(interval)?translate('Solo coppie consecutive','Consecutive pairs only'):translate('Servono più blocchi','More blocks required'));
    set('radarDensity',Number.isFinite(density)?density.toFixed(1):'—');
    set('radarDensityLabel',rows.length?rows.length+'/12 '+translate('blocchi','blocks'):'—');
    set('radarChainId',state.chain||'INJECTIVE');
    set('radarUpdated',state.lastSuccess?timeLabel(state.lastSuccess):'—');
    renderRadar(rows);renderBars(rows);renderFeed(rows);
  }
  async function history(latestHeight){
    const missing=[];
    const start=Math.max(1,latestHeight-11);
    for(let height=start;height<=latestHeight;height++)if(!state.blocks.has(height))missing.push(height);
    const queue=missing.slice(0,12);
    let cursor=0;
    const worker=async()=>{
      while(cursor<queue.length){
        const height=queue[cursor++];
        try {
          const block=normalized(await fetchJson(blockPath(height)));
          if(block.height===height){put(block);render();}
        }catch(_){}
      }
    };
    await Promise.all([worker(),worker(),worker()]);
  }
  async function refresh(){
    if(document.hidden||state.loading)return;
    state.loading=true;
    try{
      const block=normalized(await fetchJson(latestPath));
      // Reinitialize the visible sample after an LCD rollback or network switch.
      if(state.latest&&block.height<state.latest-2)state.blocks.clear();
      put(block);state.lastSuccess=Date.now();status(true);render();
      await history(block.height);render();
    }catch(_){
      status(false);
      render();
    }finally{state.loading=false;}
  }
  function boot(){
    localize();
    window.addEventListener('storage',event=>{
      if(event.key==='inj_node_language_v1')localize();
      if(event.key==='inj_monitor_theme')location.reload();
    });
    window.addEventListener('pageshow',()=>void refresh());
    window.addEventListener('online',()=>void refresh());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
    setInterval(()=>{if(!document.hidden)void refresh();},5500);
    setInterval(()=>{
      if(document.hidden||!state.lastSuccess)return;
      const newest=recent()[0];
      if(!newest)return;
      const age=Math.max(0,Math.round((Date.now()-newest.time)/1000));
      set('radarBlockAge',age<60?translate('Blocco di ','Block from ')+age+' s '+translate('fa','ago'):timeLabel(newest.time));
      if(Date.now()-state.lastSuccess>20000)status(false);
    },1000);
    void refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
