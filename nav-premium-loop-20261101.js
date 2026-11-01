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
 // Only ONE glint. The previous two long dashes formed unwanted bars on iOS.
 for(const className of ['inj-nav-border-beam']){
  const rect=document.createElementNS(ns,'rect');
  rect.setAttribute('class',className);
  // Use actual SVG units instead of pathLength normalization (inconsistent on iOS Safari).
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
  // Rounded-rectangle perimeter: 2(w+h-4r) + 2πr.
  // A 7–10px dash goes around the full border exactly once, at any dock width.
  const pathWidth=w-edge*2,pathHeight=h-edge*2;
  const perimeter=2*(pathWidth+pathHeight-4*radius)+2*Math.PI*radius;
  const beamLength=Math.max(7,Math.min(10,w*.018));
  svg.style.setProperty('--inj-nav-loop-distance',(-perimeter)+'px');
  for(const rect of svg.children){
   rect.setAttribute('stroke-dasharray',beamLength+' '+(perimeter-beamLength));
   rect.setAttribute('stroke-dashoffset','0');
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