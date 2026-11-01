/* INJ NODE · Continuous comet border v9 · optimized animation.
   One connected rounded-rectangle stroke, not individual dots/line segments.
   A path-calibrated conic gradient paints a long chromatic trail; a second
   connected stroke creates its soft halo. iOS Safari / Android / desktop. */
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
  // Let WebKit synchronize Canvas presentation with its display compositor.
  // Desynchronized mode may cause a painted frame to arrive out of phase.
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const TWO_PI=Math.PI*2,COVERAGE=.94,PERIOD=17000;
  // Smooth conic-gradient interpolation needs far fewer than 220 stops.
  // 96 evenly spaced color samples still produce a continuous stroke, with
  // considerably less main-thread work per frame on iOS.
  const EDGE=1.35,STOPS=96;
  const palette=[
   [0,255,251,230], [.12,255,194,122], [.27,255,120,149],
   [.43,235,104,198], [.59,165,117,250],
   [.76,96,166,255], [.91,77,208,242], [1,79,223,192]
  ];
  let width=0,height=0,radius=0,perimeter=0;
  let upper=0,side=0,corner=0;
  let angleDistances=[];
  let oldWidth=0,oldHeight=0,oldRadius=0,oldDpr=0;
  let frame=0,active=false,lastDraw=0;
  function round(v){return Math.round(v);}
  function colorAt(t,opacity){
   let k=1;
   while(k<palette.length-1 && t>palette[k][0])k++;
   const a=palette[k-1],b=palette[k];
   const u=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
   return 'rgba('+round(a[1]+(b[1]-a[1])*u)+','+
    round(a[2]+(b[2]-a[2])*u)+','+
    round(a[3]+(b[3]-a[3])*u)+','+
    Math.max(0,opacity).toFixed(3)+')';
  }
  function point(d){
   let t=((d%perimeter)+perimeter)%perimeter;
   const left=EDGE,top=EDGE,right=width-EDGE,bottom=height-EDGE,r=radius;
   if(t<upper)return [left+r+t,top];
   t-=upper;
   if(t<corner){const a=-Math.PI/2+t/r;return [right-r+r*Math.cos(a),top+r+r*Math.sin(a)];}
   t-=corner;
   if(t<side)return [right,top+r+t];
   t-=side;
   if(t<corner){const a=t/r;return [right-r+r*Math.cos(a),bottom-r+r*Math.sin(a)];}
   t-=corner;
   if(t<upper)return [right-r-t,bottom];
   t-=upper;
   if(t<corner){const a=Math.PI/2+t/r;return [left+r+r*Math.cos(a),bottom-r+r*Math.sin(a)];}
   t-=corner;
   if(t<side)return [left,bottom-r-t];
   t-=side;
   const a=Math.PI+t/r;
   return [left+r+r*Math.cos(a),top+r+r*Math.sin(a)];
  }
  function rebuildAngleDistances(){
   // This maps polar angle to true arclength on a rounded rectangle.
   // A conic gradient alone would compress hues at short edges; calibration
   // keeps the color spacing even all the way around the actual border.
   const n=Math.max(420,Math.ceil(perimeter/1.5));
   const sorted=[];
   for(let i=0;i<n;i++){
    const d=perimeter*i/n,p=point(d);
    let angle=Math.atan2(p[1]-height/2,p[0]-width/2);
    if(angle<0)angle+=TWO_PI;
    sorted.push([angle,d]);
   }
   sorted.sort((a,b)=>a[0]-b[0]);
   let wrap=0,previous=sorted[0][1];
   for(let i=0;i<n;i++){
    let dist=sorted[i][1]+wrap;
    if(dist<previous-perimeter*.5){wrap+=perimeter;dist+=perimeter;}
    sorted[i][1]=dist;
    previous=dist;
   }
   function distanceAtAngle(theta){
    let low=0,high=n;
    while(low<high){
     const mid=(low+high)>>1;
     if(sorted[mid][0]<theta)low=mid+1;else high=mid;
    }
    let aa,ab,da,db;
    if(low===0){
     aa=sorted[n-1][0]-TWO_PI;da=sorted[n-1][1]-perimeter;
     ab=sorted[0][0];db=sorted[0][1];
    }else if(low===n){
     aa=sorted[n-1][0];da=sorted[n-1][1];
     ab=sorted[0][0]+TWO_PI;db=sorted[0][1]+perimeter;
    }else{
     aa=sorted[low-1][0];da=sorted[low-1][1];
     ab=sorted[low][0];db=sorted[low][1];
    }
    return ((da+(db-da)*(theta-aa)/Math.max(1e-9,ab-aa))%perimeter+perimeter)%perimeter;
   }
   angleDistances=[];
   for(let i=0;i<=STOPS;i++)angleDistances.push(distanceAtAngle(TWO_PI*i/STOPS));
  }
  function measure(){
   const w=nav.clientWidth,h=nav.clientHeight;
   if(w<55||h<30){width=0;return;}
   let r=23;
   try{r=parseFloat(getComputedStyle(nav).borderTopLeftRadius)||r;}catch(_){}
   // The menu's CSS radius describes its OUTER edge. A centerline at EDGE
   // must use radius - EDGE or its arcs won't match the rounded corners.
   r=Math.max(6,Math.min(r-EDGE,(h-2*EDGE)/2,(w-2*EDGE)/2));
   const dpr=Math.min(window.devicePixelRatio||1,3);
   if(w===oldWidth&&h===oldHeight&&r===oldRadius&&dpr===oldDpr)return;
   oldWidth=w;oldHeight=h;oldRadius=r;oldDpr=dpr;
   width=w;height=h;radius=r;
   upper=w-2*EDGE-2*r;side=h-2*EDGE-2*r;corner=Math.PI*r/2;
   perimeter=2*(upper+side)+4*corner;
   rebuildAngleDistances();
   canvas.width=Math.max(1,round(w*dpr));
   canvas.height=Math.max(1,round(h*dpr));
   canvas.style.width=w+'px';canvas.style.height=h+'px';
   ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);
   if(motion.matches)draw(0);
  }
  function tracePerimeter(){
   const x=EDGE,y=EDGE,right=width-EDGE,bottom=height-EDGE,r=radius;
   ctx.beginPath();
   ctx.moveTo(x+r,y);
   ctx.lineTo(right-r,y);
   ctx.arcTo(right,y,right,y+r,r);
   ctx.lineTo(right,bottom-r);
   ctx.arcTo(right,bottom,right-r,bottom,r);
   ctx.lineTo(x+r,bottom);
   ctx.arcTo(x,bottom,x,bottom-r,r);
   ctx.lineTo(x,y+r);
   ctx.arcTo(x,y,x+r,y,r);
   ctx.closePath();
  }
  function gradientAt(head){
   const gradient=ctx.createConicGradient(0,width/2,height/2);
   let firstColor='';
   for(let i=0;i<=STOPS;i++){
    const d=angleDistances[i];
    const behind=((head-d)%perimeter+perimeter)%perimeter;
    const t=behind/(perimeter*COVERAGE);
    let alpha=0;
    if(behind<perimeter*COVERAGE){
     const sustain=Math.pow(1-t,.42);
     const fade=t>.87?Math.pow((1-t)/.13,1.03):1;
     alpha=.97*sustain*fade;
    }
    const color=colorAt(Math.min(1,t),alpha);
    if(i===0)firstColor=color;
    // At 360°, use precisely the first color so there is no radial seam.
    gradient.addColorStop(i/STOPS,i===STOPS?firstColor:color);
   }
   return gradient;
  }
  function draw(phase){
   if(!width||!perimeter)return;
   ctx.clearRect(0,0,width,height);
   const head=phase*perimeter;
   if(typeof ctx.createConicGradient==='function'){
    const gradient=gradientAt(head);
    ctx.strokeStyle=gradient;
    ctx.lineCap='round';ctx.lineJoin='round';
    tracePerimeter();
    // Two passes, two CONTINUOUS strokes — no sampled points or dot joins.
    ctx.globalAlpha=.18;ctx.lineWidth=3.1;ctx.stroke();
    ctx.globalAlpha=1;ctx.lineWidth=1.38;ctx.stroke();
   }else{
    // Older browser fallback is still a single unbroken stroked dash.
    tracePerimeter();
    ctx.setLineDash([perimeter*COVERAGE,perimeter*(1-COVERAGE)]);
    ctx.lineDashOffset=-head;
    ctx.lineWidth=1.4;ctx.strokeStyle='rgba(171,148,249,.9)';
    ctx.stroke();ctx.setLineDash([]);
   }
   const p=point(head);
   const glow=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],7.5);
   glow.addColorStop(0,'rgba(255,249,232,.62)');
   glow.addColorStop(.24,'rgba(255,213,169,.20)');
   glow.addColorStop(1,'rgba(255,213,169,0)');
   ctx.fillStyle=glow;ctx.fillRect(p[0]-8,p[1]-8,16,16);
   ctx.beginPath();ctx.arc(p[0],p[1],1.12,0,TWO_PI);
   ctx.fillStyle='rgba(255,255,245,.99)';ctx.fill();
  }
  const phaseAt=now=>((now%PERIOD)+PERIOD)%PERIOD/PERIOD;
  function isVisible(){
   if(document.hidden||!width)return false;
   if(root.dataset.injHomeTab==='reward'||root.dataset.injHomeTab==='mercato')return false;
   if(root.dataset.injDockIdle==='true'&&root.dataset.injHomeTab!=='home')return false;
   if(root.dataset.injHomeTab==='home'&&root.dataset.injHomeNavVisible!=='true')return false;
   const style=getComputedStyle(nav);
   return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>.02;
  }
  function tick(now){
   frame=0;
   if(!active||motion.matches)return;
   // At most 60 FPS: draw every 60 Hz frame, and every second frame on
   // 120 Hz ProMotion displays. The old 33 ms cap produced uneven steps.
   if(now-lastDraw>=14.5){
    lastDraw=now;
    draw(phaseAt(now));
   }
   if(active)frame=requestAnimationFrame(tick);
  }
  function stop(){active=false;if(frame){cancelAnimationFrame(frame);frame=0;}}
  function updateState(){
   if(motion.matches){stop();draw(0);return;}
   if(!isVisible()){stop();return;}
   if(!active){
    active=true;
    const now=performance.now();
    lastDraw=now;
    draw(phaseAt(now));
    frame=requestAnimationFrame(tick);
   }
  }
  function resized(){measure();updateState();}
  if(typeof ResizeObserver==='function')new ResizeObserver(resized).observe(nav);
  else window.addEventListener('resize',resized,{passive:true});
  const observer=new MutationObserver(updateState);
  observer.observe(root,{attributes:true,attributeFilter:['data-inj-home-tab','data-inj-dock-idle','data-inj-home-nav-visible']});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  nav.addEventListener('toggle',updateState);
  document.addEventListener('visibilitychange',updateState);
  window.addEventListener('pageshow',resized);
  window.addEventListener('pagehide',stop);
  if(typeof motion.addEventListener==='function')motion.addEventListener('change',updateState);
  else if(typeof motion.addListener==='function')motion.addListener(updateState);
  requestAnimationFrame(resized);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();