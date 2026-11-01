/* INJ Node · Premium dock border: SVG follows the measured rounded rectangle.
   No polling/animation frames: CSS draws the light, ResizeObserver handles sizing. */
(()=>{
'use strict';
function init(){
 const nav=document.getElementById('injPrimaryBottomNav');
 if(!nav||nav.querySelector('.inj-nav-border-track'))return;
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('class','inj-nav-border-track');
 svg.setAttribute('aria-hidden','true');
 svg.setAttribute('focusable','false');
 svg.setAttribute('preserveAspectRatio','none');
 for(const className of ['inj-nav-border-tail','inj-nav-border-beam']){
  const rect=document.createElementNS(ns,'rect');
  rect.setAttribute('class',className);
  rect.setAttribute('pathLength','1000');
  rect.setAttribute('fill','none');
  svg.append(rect);
 }
 nav.prepend(svg);
 function update(){
  const w=nav.clientWidth,h=nav.clientHeight;
  if(w<50||h<35)return;
  const edge=2;
  let radius=23;
  try{radius=parseFloat(getComputedStyle(nav).borderTopLeftRadius)||radius}catch(_){}
  radius=Math.max(8,Math.min(radius,(h-edge*2)/2,(w-edge*2)/2));
  svg.setAttribute('viewBox','0 0 '+w+' '+h);
  for(const rect of svg.children){
   rect.setAttribute('x',String(edge));
   rect.setAttribute('y',String(edge));
   rect.setAttribute('width',String(w-edge*2));
   rect.setAttribute('height',String(h-edge*2));
   rect.setAttribute('rx',String(radius));
   rect.setAttribute('ry',String(radius));
  }
 }
 if(typeof ResizeObserver==='function')new ResizeObserver(update).observe(nav);
 else window.addEventListener('resize',update,{passive:true});
 requestAnimationFrame(update);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();