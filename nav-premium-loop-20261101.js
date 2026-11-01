/* INJ Node · native SVG comet v10.
   No per-frame JS: the browser animates a continuous 94% base stroke
   with graduated long blue-violet-pink-gold layers. */
(()=>{
'use strict';
const NS='http://www.w3.org/2000/svg';
const layers=[
 [.94,'#66dbe7',.16],
 [.91,'#61d3ee',.16],
 [.88,'#5ccaf4',.17],
 [.84,'#5dbaf8',.17],
 [.80,'#67a8fb',.17],
 [.76,'#7597fb',.18],
 [.72,'#8787fa',.18],
 [.68,'#9a7cf8',.19],
 [.64,'#ac78f4',.19],
 [.60,'#bd78ef',.19],
 [.56,'#cd7de8',.20],
 [.52,'#db84df',.20],
 [.48,'#e88dd3',.21],
 [.44,'#f396c5',.21],
 [.40,'#fb9fb5',.22],
 [.36,'#ffa8a5',.22],
 [.32,'#ffb394',.23],
 [.28,'#ffbf8f',.23],
 [.24,'#ffcb95',.24],
 [.20,'#ffd79f',.25],
 [.16,'#ffe0ac',.27],
 [.12,'#ffe8bb',.29],
 [.08,'#fff0cc',.32],
 [.045,'#fff6de',.36],
 [.02,'#fffbf0',.42]
];
function init(){
 const nav=document.getElementById('injPrimaryBottomNav');
 if(!nav||nav.querySelector('.inj-nav-comet-orbit'))return;
 nav.querySelector('.inj-nav-comet-canvas')?.remove();
 nav.querySelector('.inj-nav-border-track')?.remove();
 const svg=document.createElementNS(NS,'svg');
 svg.setAttribute('class','inj-nav-comet-orbit');
 svg.setAttribute('aria-hidden','true');
 svg.setAttribute('focusable','false');
 svg.setAttribute('preserveAspectRatio','none');
 const shapes=[];
 function shape(cls,color,opacity,coverage,headLen){
  const r=document.createElementNS(NS,'rect');
  r.setAttribute('class',cls);
  r.setAttribute('fill','none');
  r.setAttribute('stroke',color);
  r.setAttribute('stroke-opacity',String(opacity));
  r.setAttribute('vector-effect','non-scaling-stroke');
  svg.append(r);
  shapes.push({r,coverage,headLen});
 }
 for(const [coverage,color,alpha] of layers)shape('inj-comet-layer',color,alpha,coverage,0);
 shape('inj-comet-head-halo','#fff1cb',.27,0,26);
 shape('inj-comet-head-core','#fffdf1',1,0,5.6);
 nav.prepend(svg);
 let oldW=0,oldH=0,oldR=0;
 function resize(){
  const w=nav.clientWidth,h=nav.clientHeight;
  if(w<56||h<34)return;
  const edge=1.45;
  let radius=23;
  try{radius=parseFloat(getComputedStyle(nav).borderTopLeftRadius)||radius}catch(_){}
  radius=Math.max(7,Math.min(radius-edge,(h-edge*2)/2,(w-edge*2)/2));
  if(w===oldW&&h===oldH&&radius===oldR)return;
  oldW=w;oldH=h;oldR=radius;
  const pw=w-edge*2,ph=h-edge*2;
  const perimeter=2*(pw+ph-4*radius)+2*Math.PI*radius;
  svg.setAttribute('viewBox','0 0 '+w+' '+h);
  svg.style.setProperty('--inj-comet-perimeter',perimeter.toFixed(3)+'px');
  for(const {r,coverage,headLen} of shapes){
   r.setAttribute('x',edge.toFixed(2));
   r.setAttribute('y',edge.toFixed(2));
   r.setAttribute('width',pw.toFixed(3));
   r.setAttribute('height',ph.toFixed(3));
   r.setAttribute('rx',radius.toFixed(3));
   r.setAttribute('ry',radius.toFixed(3));
   const length=coverage?perimeter*coverage:Math.min(headLen,perimeter*.03);
   r.setAttribute('stroke-dasharray',length.toFixed(3)+' '+(perimeter-length).toFixed(3));
   r.style.setProperty('--inj-comet-start',length.toFixed(3)+'px');
  }
 }
 if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(nav);
 else window.addEventListener('resize',resize,{passive:true});
 resize();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();