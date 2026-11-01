/* INJ Node · High-definition multicolor comet around the entire bottom dock.
   Continuous retina canvas strokes replace segmented SVG dashes on iOS Safari.
   The head travels along all four sides; a long rainbow tail fades behind it.
   Draws at 30 fps only while visible, and respects reduced-motion settings. */
(()=>{
'use strict';
function init(){
 const nav=document.getElementById('injPrimaryBottomNav');
 if(!nav||nav.querySelector('.inj-nav-comet-canvas'))return;
 nav.querySelector('.inj-nav-border-track')?.remove();
 const root=document.documentElement;
 const canvas=document.createElement('canvas');
 canvas.className='inj-nav-comet-canvas';
 canvas.setAttribute('aria-hidden','true');
 canvas.setAttribute('role','presentation');
 nav.prepend(canvas);
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(!ctx)return;
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let width=0,height=0,radius=0,perimeter=0,scale=1;
 let dTop=0,dSide=0,dArc=0;
 let lastTick=0,frame=0,active=false;
 let lastRenderedPhase=-1,renderPalette=[];
 // Leave only a narrow unlit gap before the comet's head.
 const COMET_COVERAGE=.94;
 // Smooth chromatic progression from the bright golden head to its icy tail.
 // Direct RGB interpolation (not HSL hue rotation): the earlier 37°→334°
 // transition travelled through unwanted green/blue, washing out pink.
 const palette=[
  [0,255,251,230], [.12,255,194,122], [.27,255,120,149],
  [.43,235,104,198], [.59,165,117,250],
  [.76,96,166,255], [.91,77,208,242], [1,79,223,192]
 ];
 function colorAt(t,opacity){
  let k=1;
  while(k<palette.length-1 && t>palette[k][0])k++;
  const a=palette[k-1],b=palette[k],u=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
  return 'rgba('+
   Math.round(a[1]+(b[1]-a[1])*u)+','+
   Math.round(a[2]+(b[2]-a[2])*u)+','+
   Math.round(a[3]+(b[3]-a[3])*u)+','+
   Math.max(0,opacity).toFixed(3)+')';
 }
 function rebuildColors(n){
  // Cache the gradients once per size. Painting frames only changes position.
  renderPalette=[];
  for(let i=0;i<n;i++){
   const t=(i+.5)/n;
   // The hue stays visible over almost the entire loop; the very end
   // gradually dissolves, rather than creating a wide dark interval.
   const sustained=Math.pow(1-t,.42);
   const taper=t>.87?Math.pow((1-t)/.13,1.03):1;
   const alpha=.97*sustained*taper;
   renderPalette.push({color:colorAt(t,alpha),glow:colorAt(t,alpha*.19),width:t<.10?2.48:2.12,show:alpha>.007});
  }
 }
 function measure(){
  const w=nav.clientWidth,h=nav.clientHeight;
  if(w<55||h<30){width=0;return;}
  width=w;height=h;
  const edge=2.25;
  let r=23;
  try{r=parseFloat(getComputedStyle(nav).borderTopLeftRadius)||r;}catch(_){}
  radius=Math.max(7,Math.min(r,(h-2*edge)/2,(w-2*edge)/2));
  dTop=w-2*edge-2*radius;
  dSide=h-2*edge-2*radius;
  dArc=Math.PI*radius/2;
  perimeter=2*(dTop+dSide)+4*dArc;
  const dpr=Math.min(window.devicePixelRatio||1,3);
  // About 3 CSS px per sample. Cached colors and no per-sample shadow blur
  // drastically reduce main-thread work during the PWA's hide/show transition.
  // Slightly wider sampling spacing preserves current performance on iPhone.
  rebuildColors(Math.max(165,Math.ceil(perimeter*COMET_COVERAGE/3.7)));
  scale=dpr;
  canvas.width=Math.max(1,Math.round(w*dpr));
  canvas.height=Math.max(1,Math.round(h*dpr));
  canvas.style.width=w+'px';
  canvas.style.height=h+'px';
  ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);
  ctx.clearRect(0,0,w,h);
  lastRenderedPhase=-1;
  if(motion.matches)draw(0);
 }
 function point(distance){
  const edge=2.25;
  const x0=edge,y0=edge,x1=width-edge,y1=height-edge,r=radius;
  let d=((distance%perimeter)+perimeter)%perimeter;
  if(d<dTop)return [x0+r+d,y0];
  d-=dTop;
  if(d<dArc){const a=-Math.PI/2+d/r;return [x1-r+r*Math.cos(a),y0+r+r*Math.sin(a)];}
  d-=dArc;
  if(d<dSide)return [x1,y0+r+d];
  d-=dSide;
  if(d<dArc){const a=d/r;return [x1-r+r*Math.cos(a),y1-r+r*Math.sin(a)];}
  d-=dArc;
  if(d<dTop)return [x1-r-d,y1];
  d-=dTop;
  if(d<dArc){const a=Math.PI/2+d/r;return [x0+r+r*Math.cos(a),y1-r+r*Math.sin(a)];}
  d-=dArc;
  if(d<dSide)return [x0,y1-r-d];
  d-=dSide;
  const a=Math.PI+d/r;
  return [x0+r+r*Math.cos(a),y0+r+r*Math.sin(a)];
 }
 function strokePiece(from,to,color,lineWidth){
  const p=point(from),q=point(to);
  ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);
  ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();
 }
 function draw(phase){
  if(!width||!perimeter)return;
  ctx.clearRect(0,0,width,height);
  const head=phase*perimeter,tail=perimeter*COMET_COVERAGE;
  const n=renderPalette.length,step=tail/n;
  ctx.lineCap='round';ctx.lineJoin='round';
  // Fine chromatic line: colors fade evenly from gold to pink to purple to cyan.
  // A faint base underneath removes the old bright/grey banding.
  for(let pass=0;pass<2;pass++){
   for(let i=n-1;i>=0;i--){
    const brush=renderPalette[i];if(!brush.show)continue;
    strokePiece(head-(i+1)*step,head-i*step,
     pass===0?brush.glow:brush.color,pass===0?3.6:brush.width);
   }
  }
  const p=point(head);
  const glow=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],8.5);
  glow.addColorStop(0,'rgba(255,249,232,.58)');
  glow.addColorStop(.25,'rgba(255,210,162,.16)');
  glow.addColorStop(1,'rgba(255,210,162,0)');
  ctx.fillStyle=glow;ctx.fillRect(p[0]-9,p[1]-9,18,18);
  ctx.beginPath();ctx.arc(p[0],p[1],1.35,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,244,.98)';ctx.fill();
 }
 const reduced=()=>motion.matches;
 function isVisible(){
  if(document.hidden||width===0)return false;
  if(root.dataset.injHomeTab==='reward'||root.dataset.injHomeTab==='mercato')return false;
  if(root.dataset.injDockIdle==='true'&&root.dataset.injHomeTab!=='home')return false;
  if(root.dataset.injHomeTab==='home'&&root.dataset.injHomeNavVisible!=='true')return false;
  const c=getComputedStyle(nav);
  return c.visibility!=='hidden'&&c.display!=='none'&&Number(c.opacity)>.02;
 }
 // The position comes from a monotonic clock rather than accumulated frames:
 // a hidden dock cannot leave an old frame stuck on the next appearance.
 const period=17000;
 const phaseAt=now=>((now%period)+period)%period/period;
 function tick(now){
  frame=0;
  if(!active||reduced())return;
  if(now-lastTick>=33){
   lastTick=now;
   const phase=phaseAt(now);
   if(phase!==lastRenderedPhase){draw(phase);lastRenderedPhase=phase;}
  }
  if(active)frame=requestAnimationFrame(tick);
 }
 function schedule(){if(active&&!frame)frame=requestAnimationFrame(tick);}
 function stop(){
  active=false;
  if(frame){cancelAnimationFrame(frame);frame=0;}
 }
 function updateState(){
  if(reduced()){stop();draw(0);return;}
  if(!isVisible()){stop();return;}
  if(!active){
   active=true;lastTick=0;
   const phase=phaseAt(performance.now());
   draw(phase);lastRenderedPhase=phase;
   schedule();
  }
 }
 if(typeof ResizeObserver==='function'){
  new ResizeObserver(()=>{measure();updateState();}).observe(nav);
 }else window.addEventListener('resize',()=>{measure();updateState();},{passive:true});
 const observer=new MutationObserver(updateState);
 observer.observe(root,{attributes:true,attributeFilter:['data-inj-home-tab','data-inj-dock-idle','data-inj-home-nav-visible']});
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 nav.addEventListener('toggle',updateState);
 document.addEventListener('visibilitychange',updateState);
 window.addEventListener('pagehide',stop);
 window.addEventListener('pageshow',updateState);
 if(typeof motion.addEventListener==='function')motion.addEventListener('change',updateState);
 else if(typeof motion.addListener==='function')motion.addListener(updateState);
 requestAnimationFrame(()=>{measure();updateState();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();