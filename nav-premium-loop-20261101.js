/* INJ Node · Comet border: bright travelling head and a continuous fading tail.
   Shared path geometry means the streak follows ALL edges and rounded corners.
   The animation is CSS-native. JS only measures the perimeter on resize. */
(()=>{
'use strict';
function init(){
 const nav=document.getElementById('injPrimaryBottomNav');
 if(!nav)return;
 nav.querySelector('.inj-nav-border-track')?.remove();
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('class','inj-nav-border-track inj-comet-track');
 svg.setAttribute('aria-hidden','true');
 svg.setAttribute('focusable','false');
 svg.setAttribute('preserveAspectRatio','none');
 const tailCount=52;
 const pieces=[];
 function rect(className){
  const el=document.createElementNS(ns,'rect');
  el.setAttribute('class',className);
  el.setAttribute('fill','none');
  svg.appendChild(el);
  return el;
 }
 /* The glow is behind the head; the tail segments share the same orbit. */
 const halo=rect('inj-comet-head-halo');
 for(let i=tailCount-1;i>=0;i--){
  const el=rect('inj-comet-piece'+(i<5?' inj-comet-front':''));
  const position=i/(tailCount-1);
  const alpha=Math.pow(1-position,1.72);
  el.style.setProperty('--inj-comet-opacity',(0.94*alpha).toFixed(4));
  el.style.setProperty('--inj-comet-width',(1.08+0.88*alpha).toFixed(2)+'px');
  pieces[i]=el;
 }
 const head=rect('inj-comet-head-core');
 nav.prepend(svg);
 function update(){
  const w=nav.clientWidth,h=nav.clientHeight;
  if(w<60||h<35)return;
  const edge=2;
  let radius=23;
  try{radius=parseFloat(getComputedStyle(nav).borderTopLeftRadius)||radius}catch(_){}
  radius=Math.max(8,Math.min(radius,(h-edge*2)/2,(w-edge*2)/2));
  const width=w-2*edge,height=h-2*edge;
  const perimeter=2*(width+height-4*radius)+2*Math.PI*radius;
  // A long comet: approximately 38% of the entire rounded perimeter.
  const tailLength=perimeter*0.38;
  const step=tailLength/tailCount;
  svg.setAttribute('viewBox','0 0 '+w+' '+h);
  svg.style.setProperty('--inj-comet-loop',(-perimeter).toFixed(3)+'px');
  for(const el of svg.children){
   el.setAttribute('x',String(edge));
   el.setAttribute('y',String(edge));
   el.setAttribute('width',String(width));
   el.setAttribute('height',String(height));
   el.setAttribute('rx',String(radius));
   el.setAttribute('ry',String(radius));
  }
  for(let i=0;i<tailCount;i++){
   const el=pieces[i];
   el.style.setProperty('--inj-comet-shift',(i*step).toFixed(3)+'px');
   // Slight overlap avoids visible dotted gaps on iOS.
   const dash=step+0.85;
   el.setAttribute('stroke-dasharray',dash.toFixed(3)+' '+(perimeter-dash).toFixed(3));
  }
  halo.style.setProperty('--inj-comet-shift','0px');
  halo.setAttribute('stroke-dasharray','24 '+(perimeter-24).toFixed(3));
  head.style.setProperty('--inj-comet-shift','0px');
  head.setAttribute('stroke-dasharray','10 '+(perimeter-10).toFixed(3));
 }
 if(typeof ResizeObserver==='function')new ResizeObserver(update).observe(nav);
 else window.addEventListener('resize',update,{passive:true});
 requestAnimationFrame(update);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();