/* INJ Node · Live Pulse v3 — always follows the selected Dashboard wallet. */
(()=>{'use strict';
 const cc=!!document.getElementById('commandCenter');
 const host=cc?document.querySelector('.cc-main'):document.querySelector('.metrics-grid');
 if(!host)return;
 const strip=document.createElement('section');
 strip.className='inj-presence';
 strip.setAttribute('aria-label','Indicatori operativi live del wallet selezionato');
 strip.innerHTML='<div class="inj-presence-title"><span class="inj-presence-orb" aria-hidden="true"></span><span data-presence-title>LIVE PULSE</span><small data-presence-update>In attesa dei dati</small></div><div class="inj-presence-items"><div class="inj-presence-chip"><span data-presence-market-label>Direzione mercato · INJ</span><strong data-presence-market>—</strong><i class="inj-presence-meter" aria-hidden="true"><b data-presence-market-bar></b></i></div><div class="inj-presence-chip"><span data-presence-wallet-label>Wallet selezionato</span><strong data-presence-wallet>In attesa</strong><small data-presence-wallet-sub>Sincronizzazione</small></div><div class="inj-presence-chip"><span data-presence-staking-label>Quota in staking</span><strong data-presence-staking>—</strong><small data-presence-staking-sub>Wallet selezionato</small></div></div>';
 host.parentNode.insertBefore(strip,host);
 const $=s=>strip.querySelector(s);
 const source=id=>document.getElementById(id);
 const read=id=>source(id)?.textContent?.trim()||'';
 const valid=s=>!!s&&!/^[-—–]+$/.test(s)&&!/(caricament|attesa|non caricato)/i.test(s);
 const number=s=>{let v=String(s||'').replace(/[^\d.,+\-]/g,'');if(!v)return NaN;const c=v.lastIndexOf(','),d=v.lastIndexOf('.');if(c>d)v=v.replace(/\./g,'').replace(',','.');else v=v.replace(/,/g,'');return Number(v)};
 const changes=cc?['ccChange24']:['marketChange'];
 const walletId=cc?'ccWalletName':'walletState';
 const walletAddressId=cc?'ccWalletAddress':'addressInput';
 const ratioId=cc?'ccStakeRatio':'stakedShare';
 const availableId=cc?'ccAvailable':'availableInj';
 const stakingId=cc?'ccStaked':'stakedInj';
 const rewardsId=cc?'ccRewards':'rewardsInj';
 let signature='',initialized=false,scheduled=false;
 function refresh(){
  scheduled=false;
  if(document.hidden)return;
  const change=read(changes[0]);const n=number(change);
  const direction=Number.isFinite(n)?n>0?'up':n<0?'down':'flat':'unknown';
  const wallet=read(walletId);
  const address=cc?read(walletAddressId):(source(walletAddressId)?.value||'').trim();
  const ratio=read(ratioId);
  const available=read(availableId),staking=read(stakingId),rewards=read(rewardsId);
  const isLoading=!cc&&document.body.classList.contains('wallet-data-loading');
  const ready=valid(wallet)&&!!address&&!isLoading;
  const selected=ready?wallet:'In attesa del wallet';
  const share=ready&&valid(ratio)?ratio:'—';
  const snapshot=[change,selected,address,share,available,staking,rewards,isLoading,direction].join('|');
  if(snapshot===signature)return;
  signature=snapshot;
  const dirNames={up:'Rialzista',down:'Ribassista',flat:'Stabile',unknown:'In attesa'};
  $('[data-presence-market]').textContent=valid(change)?`${dirNames[direction]} · ${change}`:dirNames[direction];
  strip.dataset.direction=direction;
  $('[data-presence-market-bar]').style.width=(Number.isFinite(n)?Math.min(100,Math.max(8,Math.abs(n)*12)):0)+'%';
  $('[data-presence-wallet]').textContent=selected;
  $('[data-presence-wallet]').title=ready?address:'';
  $('[data-presence-wallet-sub]').textContent=isLoading?'Sincronizzazione in corso':ready?'Account attivo':'Nessun account attivo';
  $('[data-presence-staking]').textContent=share;
  $('[data-presence-staking-sub]').textContent=ready&&valid(staking)?staking+' delegati':'Wallet selezionato';
  $('[data-presence-update]').textContent=initialized?'Dati wallet sincronizzati':'Monitoraggio attivo';
  initialized=true;
  strip.classList.remove('inj-presence-updated');
  void strip.offsetWidth;
  strip.classList.add('inj-presence-updated');
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(refresh)}
 const observedIds=[...changes,walletId,ratioId,availableId,stakingId,rewardsId];
 const observer=new MutationObserver(schedule);
 for(const id of new Set(observedIds)){const el=source(id);if(el)observer.observe(el,{subtree:true,childList:true,characterData:true});}
 if(!cc){observer.observe(document.body,{attributes:true,attributeFilter:['class']});}
 if(source(walletAddressId)&&!cc)source(walletAddressId).addEventListener('input',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
 refresh();
 // Fallback for DOM replacements and for delayed responses in older browsers.
 const timer=setInterval(schedule,1500);
 window.addEventListener('pagehide',()=>{clearInterval(timer);observer.disconnect()},{once:true});
})();
