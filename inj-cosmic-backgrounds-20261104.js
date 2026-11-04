/* INJ Node · Cosmic Still collection: six static, textured planetary themes.
   Attached to the existing Theme picker; native/Workspace layouts unchanged. */
(function(){
 'use strict';
 if(window.__INJ_COSMIC_INITIALIZED__)return;
 window.__INJ_COSMIC_INITIALIZED__=true;
 const KEY='inj_node_cosmic_scene_v1',MOTION='inj_node_cosmic_motion_v1';
 const SCENES={
  orbital:'Orbital Black',
  neptune:'Blue Neptune',
  saturn:'Saturn Ring',
  mars:'Mars Horizon',
  jupiter:'Jupiter Storm',
  aurora:'Deep Space Aurora'
 };
 const root=document.documentElement;
 const get=k=>{try{return localStorage.getItem(k)}catch(_){return null}};
 const put=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};
 const validScene=v=>Object.prototype.hasOwnProperty.call(SCENES,v)?v:'off';
 let current=validScene(get(KEY)),sky=null;
 // Migrate existing animated selections to an entirely still background.
 put(MOTION,'static');
 function starfield(seed,count){
  let s=seed>>>0;
  const rnd=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296};
  const dots=[];
  for(let i=0;i<count;i++){
   const x=(rnd()*100).toFixed(2),y=(rnd()*100).toFixed(2);
   const size=(.4+rnd()*.95).toFixed(2);
   const rgba=rnd()>.90?'rgba(158,211,255,.7)':'rgba(238,244,255,.62)';
   dots.push('radial-gradient(circle at '+x+'% '+y+'%,'+rgba+' 0 '+size+'px,transparent '+(Number(size)+.7).toFixed(2)+'px)');
  }
  return dots.join(',');
 }
 function create(className){const el=document.createElement('div');el.className=className;return el}
 function mountSky(){
  if(sky&&sky.isConnected)return;
  const parent=root.dataset.injPage==='index'?document.getElementById('entryGate'):document.body;
  if(!parent)return;
  sky=create('inj-cosmic-sky');sky.id='injCosmicSky';sky.setAttribute('aria-hidden','true');
  const glow=create('inj-cosmic-glow');
  const far=create('inj-cosmic-stars far');far.style.backgroundImage=starfield(9723,65);
  const near=create('inj-cosmic-stars near');near.style.backgroundImage=starfield(18543,48);
  const orbit=create('inj-cosmic-orbit'),orbit2=create('inj-cosmic-orbit two');
  const world=create('inj-cosmic-world'),ring=create('inj-cosmic-world-ring');
  const sphere=create('inj-cosmic-world-sphere');
  world.append(ring,sphere);
  sky.append(glow,far,near,orbit,orbit2,world,create('inj-cosmic-moon'));
  parent.insertBefore(sky,parent.firstChild);
 }
 function render(){
  root.dataset.injCosmic=current;
  if(!sky||!sky.isConnected)mountSky();
  if(sky){
   sky.hidden=current==='off';
   sky.dataset.scene=current;
   sky.dataset.motion='static';
   sky.dataset.planets='true';
   sky.dataset.meteors='false';
   sky.dataset.density='rich';
  }
  document.querySelectorAll('[data-cosmic-scene]').forEach(button=>{
   const active=button.dataset.cosmicScene===current;
   button.setAttribute('aria-pressed',String(active));
   button.classList.toggle('active',active);
  });
  const picker=document.getElementById('themePicker');
  picker?.querySelectorAll('.inj-theme-family').forEach(group=>{
   if(group.dataset.family==='cosmic')group.dataset.selected=String(current!=='off');
   else if(current!=='off')group.dataset.selected='false';
  });
  if(current!=='off'){
   picker?.querySelectorAll('[data-theme-choice]').forEach(b=>{
    b.classList.remove('active');b.setAttribute('aria-pressed','false');
   });
  }
  const theme=document.getElementById('themeButton');
  if(theme&&current!=='off'){
   theme.title='Tema: '+SCENES[current];
   theme.setAttribute('aria-label','Tema '+SCENES[current]+'. Cambia tema');
  }
 }
 function select(scene){
  current=validScene(scene);
  put(KEY,current);
  render();
 }
 function familyMarkup(){
  return '<details class="inj-theme-family" data-family="cosmic">'+
   '<summary><span class="inj-family-illustration" aria-hidden="true">✦</span>'+
   '<span class="inj-family-title"><strong>Cosmic Still</strong>'+
   '<small data-it="6 pianeti statici · dettagli HD" data-en="6 still planets · HD detail">6 pianeti statici · dettagli HD</small></span>'+
   '<span class="inj-family-count">6</span><span class="inj-family-chevron" aria-hidden="true"></span></summary>'+
   '<div class="theme-category-options theme-list-unified">'+
   Object.entries(SCENES).map(([id,name])=>
    '<button type="button" class="inj-cosmic-theme-choice" data-cosmic-scene="'+id+'" aria-pressed="false">'+
    '<i class="theme-swatch inj-cosmic-theme-swatch" aria-hidden="true"></i><span>'+name+'</span></button>'
   ).join('')+'</div></details>';
 }
 function mountThemes(){
  const picker=document.getElementById('themePicker');
  if(!picker)return;
  // Remove the old standalone Cosmic preferences, if present in a restored view.
  document.getElementById('injCosmicHome')?.remove();
  if(!picker.querySelector('[data-family="cosmic"]'))picker.insertAdjacentHTML('beforeend',familyMarkup());
  const groups=[...picker.querySelectorAll('details.inj-theme-family')];
  groups.forEach(group=>{
   if(group.dataset.cosmicExclusive)return;
   group.dataset.cosmicExclusive='1';
   group.addEventListener('toggle',()=>{
    if(!group.open)return;
    groups.forEach(other=>{if(other!==group)other.open=false});
   });
  });
 }
 function click(e){
  const cosmic=e.target.closest?.('[data-cosmic-scene]');
  if(cosmic){
   e.preventDefault();e.stopPropagation();
   const desired=validScene(cosmic.dataset.cosmicScene);
   if(desired==='off')return;
   // Cosmic is a dark theme family. Switch light palettes to a readable
   // base using the existing theme handler before activating the planet.
   if(['arctic','classic-white'].includes(root.dataset.theme)){
    const obsidian=document.querySelector('[data-theme-choice="obsidian"]');
    if(obsidian)obsidian.click();
   }
   select(desired);
   document.getElementById('themeControl')?.classList.remove('open');
   document.getElementById('themeButton')?.setAttribute('aria-expanded','false');
   return;
  }
  // Choosing a normal theme turns the cosmic family off, as with any
  // mutually exclusive theme option; do not leave space layers behind.
  if(e.target.closest?.('[data-theme-choice]')&&current!=='off')select('off');
 }
 // Capture before the existing app handlers; this also works with mobile taps.
 document.addEventListener('click',click,true);
 function initialize(){
  mountSky();mountThemes();render();
  const cosmicFamily=document.querySelector('#themePicker [data-family="cosmic"]');
  if(cosmicFamily&&current!=='off')cosmicFamily.open=true;
  window.addEventListener('pageshow',()=>{current=validScene(get(KEY));mountSky();mountThemes();render()});
  window.addEventListener('storage',e=>{
   if(e.key===KEY){current=validScene(get(KEY));render()}
  });
  window.addEventListener('message',e=>{
   if(e.origin!==location.origin||e.data?.type!=='injnode:cosmic:sync')return;
   current=validScene(e.data.scene);render();
  });
 }
 window.INJNodeCosmic={select,refresh:()=>{mountThemes();render()},getState:()=>({scene:current,motion:'static'})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
 else initialize();
})();
