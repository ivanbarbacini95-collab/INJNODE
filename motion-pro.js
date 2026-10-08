/* INJ NODE · Motion Pro: passive presentation, no network, storage or financial math */
(()=>{'use strict';
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
 const q=(selector)=>Array.from(document.querySelectorAll(selector));
 const sections=q('.entry-actions > .entry-action, .app-shell .overview-grid > .data-card, .app-shell .aggregate-metric');
 if('IntersectionObserver' in window){
   const visited=new WeakSet();
   const io=new IntersectionObserver(entries=>{entries.forEach(e=>{
     if(!e.isIntersecting||visited.has(e.target))return;
     visited.add(e.target);e.target.classList.add('motion-visible');
     setTimeout(()=>e.target.classList.remove('motion-visible'),550);io.unobserve(e.target);
   });},{threshold:.08,rootMargin:'0px 0px -12px 0px'});
   sections.forEach(el=>io.observe(el));
 }
 // Observe only headline metrics, not continuously changing reward counters.
 const ids=['price','injPrice','marketPrice','totalNetWorth','netWorth','ccLivePrice','ccNetWorth','ccTotalPnl','ccDailyReward','ccChange24'];
 const targets=ids.map(id=>document.getElementById(id)).filter(Boolean);
 const parse=(s)=>{const t=String(s||'').replace(/[^0-9,.-]/g,'');if(!t)return NaN;const comma=t.lastIndexOf(','),dot=t.lastIndexOf('.');const decimal=comma>dot?',':'.';const normalized=decimal===','?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,'');return Number(normalized)};
 const last=new WeakMap(), pending=new WeakMap(), until=new WeakMap();
 const observer=new MutationObserver((changes)=>{
   if(document.hidden)return;
   for(const item of changes){const el=item.target.nodeType===1?item.target:item.target.parentElement;const root=targets.find(node=>node===el||node.contains(el));if(!root||pending.has(root))continue;
     pending.set(root,true);requestAnimationFrame(()=>{pending.delete(root);const value=parse(root.textContent);const previous=last.get(root);last.set(root,value);
       if(!Number.isFinite(value)||!Number.isFinite(previous)||value===previous||performance.now()<(until.get(root)||0))return;
       const cls=value>previous?'motion-tick-up':'motion-tick-down';root.classList.remove('motion-tick-up','motion-tick-down');void root.offsetWidth;root.classList.add(cls);
       until.set(root,performance.now()+1000);setTimeout(()=>root.classList.remove(cls),600);
     });
   }
 });
 targets.forEach(el=>{last.set(el,parse(el.textContent));observer.observe(el,{subtree:true,childList:true,characterData:true})});
})();
