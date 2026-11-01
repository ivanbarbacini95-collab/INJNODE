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
 let elapsed=0,lastTick=0,frame=0,active=false,resizeQueued=false;
 let lastRenderedPhase=-1;
 // Smooth chromatic progression from the bright golden head to its icy tail.
 const palette=[
  [0, 43,97,92],
  [.10,37,100,77],
  [.26,334,95,72],
  [.47,292,91,72],
  [.72,246,94,74],
  [1,184,87,68]
 ];
 function colorAt(t,opacity){
  let k=1;
  while(k<palette.length-1 && t>palette[k][0])k++;
  const a=palette[k-1],b=palette[k],u=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
  const h=a[1]+(b[1]-a[1])*u, s=a[2]+(b[2]-a[2])*u,l=a[3]+(b[3]-a[3])*u;
  return 'hsla('+h.toFixed(1)+','+s.toFixed(1)+'%,'+l.toFixed(1)+'%,'+Math.max(0,opacity).toFixed(3)+')';
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
 function strokePiece(from,to,style,lineWidth,blur=0){
  const p=point(from),q=point(to);
  ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);
  ctx.strokeStyle=style;ctx.lineWidth=lineWidth;ctx.lineCap='round';
  if(blur){ctx.shadowColor=style;ctx.shadowBlur=blur;}
  else{ctx.shadowColor='transparent';ctx.shadowBlur=0;}
  ctx.stroke();
 }
 function draw(phase){
  if(!width||!perimeter)return;
  ctx.clearRect(0,0,width,height);
  const head=phase*perimeter,tail=perimeter*.54;
  // Samples are <= 1.8 CSS px apart. Overlapping round caps prevent dotted
  // artifacts, while continuous color and alpha transitions remain smooth.
  const n=Math.max(170,Math.ceil(tail/1.8)),step=tail/n;
  const passes=[
   {width:4.4,alpha:.19,blur:3.3},
   {width:2.25,alpha:.94,blur:0}
  ];
  for(const pass of passes){
   for(let i=n-1;i>=0;i--){
    const t=(i+.5)/n;
    const fade=Math.pow(1-t,1.65);
    const alpha=pass.alpha*fade*(t>.88?(1-t)/.12:1);
    if(alpha<.003)continue;
    // Along the perimeter from the leading head back toward the distant tail.
    const start=head-(i+1)*step,end=head-i*step;
    const luminousHead=t<.08;
    strokePiece(start,end,colorAt(t,alpha),
     pass.width*(luminousHead?1.08:1),pass.blur&&i<22?pass.blur:0);
   }
  }
  const p=point(head);
  // Soft glowing head, with a sharply defined warm-white center.
  const glow=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],9.5);
  glow.addColorStop(0,'rgba(255,251,234,.57)');
  glow.addColorStop(.22,'rgba(255,221,173,.22)');
  glow.addColorStop(1,'rgba(255,221,173,0)');
  ctx.fillStyle=glow;ctx.fillRect(p[0]-10,p[1]-10,20,20);
  ctx.beginPath();ctx.arc(p[0],p[1],1.45,0,Math.PI*2);
  ctx.fillStyle='rgba(255,253,245,.99)';ctx.fill();
 }
 const reduced=()=>motion.matches;
 function isVisible(){
  if(document.hidden||width===0)return false;
  if(root.dataset.injHomeTab==='reward'||root.dataset.injHomeTab==='mercato')return false;
  if(root.dataset.injDockIdle==='true')return false;
  if(root.dataset.injHomeTab==='home'&&root.dataset.injHomeNavVisible!=='true')return false;
  const c=getComputedStyle(nav);
  return c.visibility!=='hidden'&&c.display!=='none'&&Number(c.opacity)>.02;
 }
 function tick(now){
  frame=0;
  if(!active||reduced()){if(reduced())draw(0);return;}
  if(!isVisible()){lastTick=now;schedule();return;}
  // Cap the canvas work at 30 FPS on iOS; account for inactive page time.
  if(now-lastTick>=32){
   elapsed+=Math.min(now-lastTick,75);
   lastTick=now;
   const phase=(elapsed%16800)/16800;
   if(phase!==lastRenderedPhase){draw(phase);lastRenderedPhase=phase;}
  }
  schedule();
 }
 function schedule(){if(active&&!frame)frame=requestAnimationFrame(tick);}
 function updateState(){
  const visible=isVisible();
  if(reduced()){
   active=false;
   if(frame){cancelAnimationFrame(frame);frame=0;}
   draw(0);
   return;
  }
  if(!visible){
   active=false;
   if(frame){cancelAnimationFrame(frame);frame=0;}
   return;
  }
  if(!active){active=true;lastTick=performance.now();schedule();}
 }
 if(typeof ResizeObserver==='function'){
  new ResizeObserver(()=>{measure();updateState();}).observe(nav);
 }else window.addEventListener('resize',()=>{measure();updateState();},{passive:true});
 const observer=new MutationObserver(updateState);
 observer.observe(root,{attributes:true,attributeFilter:['data-inj-home-tab','data-inj-dock-idle','data-inj-home-nav-visible']});
 observer.observe(nav,{attributes:true,attributeFilter:['style','popover']});
 document.addEventListener('visibilitychange',updateState);
 window.addEventListener('pageshow',updateState);
 if(typeof motion.addEventListener==='function')motion.addEventListener('change',updateState);
 else if(typeof motion.addListener==='function')motion.addListener(updateState);
 requestAnimationFrame(()=>{measure();updateState();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();