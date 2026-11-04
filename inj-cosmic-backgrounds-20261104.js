/* INJ Node · Cosmic Premium backgrounds · shared by Home and Workspace.
   Independent of the existing classic/signature theme palette. */
(function(){
 'use strict';
 if(window.__INJ_COSMIC_INITIALIZED__)return;
 window.__INJ_COSMIC_INITIALIZED__=true;

 const SCENES=[
  ['off','Disattivato','Off'],
  ['orbital','Orbital Black','Orbital Black'],
  ['neptune','Blue Neptune','Blue Neptune'],
  ['saturn','Saturn Ring','Saturn Ring'],
  ['mars','Mars Horizon','Mars Horizon'],
  ['jupiter','Jupiter Storm','Jupiter Storm'],
  ['aurora','Deep Space Aurora','Deep Space Aurora']
 ];
 const KEY='inj_node_cosmic_scene_v1',MOTION='inj_node_cosmic_motion_v1',
  DENSITY='inj_node_cosmic_density_v1',PLANETS='inj_node_cosmic_planets_v1',
  METEORS='inj_node_cosmic_meteors_v1',SAVE='inj_node_cosmic_save_v1';
 const get=(k,fallback)=>{try{const value=localStorage.getItem(k);return value===null?fallback:value}catch(_){return fallback}};
 const save=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};
 const isEn=()=>document.documentElement.lang==='en';
 const tr=(it,en)=>isEn()?en:it;
 const allowedScene=v=>SCENES.some(entry=>entry[0]===v)?v:'off';
 let state={
  scene:allowedScene(get(KEY,'off')),
  motion:['static','soft','full'].includes(get(MOTION,'soft'))?get(MOTION,'soft'):'soft',
  density:get(DENSITY,'rich')==='soft'?'soft':'rich',
  planets:get(PLANETS,'1')!=='0',
  meteors:get(METEORS,'1')!=='0',
  powerSave:get(SAVE,'0')==='1'
 };
 let layer=null,popup=null,launch=null;
 function lcg(seed){let s=seed>>>0;return function(){s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296}};
 function starfield(seed,count){
  const rand=lcg(seed),parts=[];
  for(let i=0;i<count;i++){
   const x=(rand()*100).toFixed(2)+'%',y=(rand()*100).toFixed(2)+'%';
   const r=(.35+rand()*.9).toFixed(2);
   const color=rand()>.92?'rgba(137,200,255,.75)':'rgba(236,245,255,.65)';
   parts.push('radial-gradient(circle at '+x+' '+y+','+color+' 0 '+r+'px,transparent '+(Number(r)+.7).toFixed(2)+'px)');
  }
  return parts.join(',');
 }
 function makeSky(){
  if(layer&&layer.isConnected)return;
  const home=document.documentElement.dataset.injPage==='index';
  const mount=home?document.getElementById('entryGate'):document.body;
  if(!mount)return;
  layer=document.createElement('div');layer.id='injCosmicSky';layer.className='inj-cosmic-sky';
  layer.setAttribute('aria-hidden','true');
  const glow=document.createElement('div');glow.className='inj-cosmic-glow';
  const far=document.createElement('div');far.className='inj-cosmic-stars far';far.style.backgroundImage=starfield(9723,65);
  const near=document.createElement('div');near.className='inj-cosmic-stars near';near.style.backgroundImage=starfield(18543,48);
  const orbit=document.createElement('div');orbit.className='inj-cosmic-orbit';
  const orbit2=document.createElement('div');orbit2.className='inj-cosmic-orbit two';
  const world=document.createElement('div');world.className='inj-cosmic-world';
  const ring=document.createElement('div');ring.className='inj-cosmic-world-ring';
  const sphere=document.createElement('div');sphere.className='inj-cosmic-world-sphere';
  world.append(ring,sphere);
  const moon=document.createElement('div');moon.className='inj-cosmic-moon';
  layer.append(glow,far,near,orbit,orbit2,world,moon);
  for(const [top,delay,duration] of [[17,-4,17],[51,-12,23],[69,-19,29]]){
   const m=document.createElement('span');m.className='inj-cosmic-meteor';
   m.style.setProperty('--meteor-top',top+'%');
   m.style.setProperty('--meteor-delay',delay+'s');
   m.style.setProperty('--meteor-duration',duration+'s');
   layer.append(m);
  }
  mount.insertBefore(layer,mount.firstChild);
 }
 function render(){
  const root=document.documentElement;
  root.dataset.injCosmic=state.scene;
  if(!layer||!layer.isConnected)makeSky();
  if(layer){
   layer.hidden=state.scene==='off';
   layer.dataset.scene=state.scene;
   layer.dataset.motion=state.motion;
   layer.dataset.density=state.density;
   layer.dataset.planets=String(state.planets);
   layer.dataset.meteors=String(state.meteors);
   layer.dataset.save=String(state.powerSave||Boolean(navigator.connection&&navigator.connection.saveData));
   layer.classList.toggle('inj-cosmic-paused',document.hidden);
  }
  document.querySelectorAll('[data-cosmic-scene]').forEach(button=>{
   button.setAttribute('aria-pressed',String(button.dataset.cosmicScene===state.scene));
  });
  document.querySelectorAll('[data-cosmic-motion]').forEach(button=>{
   button.setAttribute('aria-pressed',String(button.dataset.cosmicMotion===state.motion));
  });
  document.querySelectorAll('[data-cosmic-flag]').forEach(input=>{
   const flag=input.dataset.cosmicFlag;
   input.checked=flag==='density'?state.density==='rich':!!state[flag];
  });
  if(launch){
   launch.textContent=tr('✦ Spazio','✦ Space')+(state.scene==='off'?'':' · ON');
   launch.setAttribute('aria-label',tr('Apri gli sfondi spaziali','Open cosmic backgrounds'));
   launch.setAttribute('aria-expanded',String(Boolean(popup&&!popup.hidden)));
  }
  document.querySelectorAll('[data-cosmic-current]').forEach(label=>{
   label.textContent=state.scene==='off'?tr('Nessuno sfondo attivo','No background active'):SCENES.find(x=>x[0]===state.scene)[1];
  });
 }
 function persist(){
  save(KEY,state.scene);save(MOTION,state.motion);save(DENSITY,state.density);
  save(PLANETS,state.planets?'1':'0');save(METEORS,state.meteors?'1':'0');
  save(SAVE,state.powerSave?'1':'0');
 }
 function select(scene){state.scene=allowedScene(scene);persist();render()}
 function controlsHTML(){
  const scenes=SCENES.map(scene=>
   '<button type="button" class="inj-cosmic-option" data-scene="'+scene[0]+'" data-cosmic-scene="'+scene[0]+'" aria-pressed="false"><span>'+scene[1]+'</span></button>'
  ).join('');
  return '<details class="inj-cosmic-control" open>'+
   '<summary><span class="inj-cosmic-icon" aria-hidden="true">✦</span>'+
   '<span class="inj-cosmic-copy"><strong data-cosmic-heading>Cosmic Backgrounds</strong>'+
   '<small data-cosmic-subtitle>6 ambientazioni animate · stelle e pianeti</small></span>'+
   '<span class="inj-cosmic-chevron" aria-hidden="true">⌄</span></summary>'+
   '<div class="inj-cosmic-form">'+
   '<p class="inj-cosmic-hint" data-cosmic-hint>Lo spazio si muove dietro le card, senza coprire i dati.</p>'+
   '<div class="inj-cosmic-options" role="group" aria-label="Cosmic Backgrounds">'+scenes+'</div>'+
   '<div class="inj-cosmic-settings">'+
   '<label data-cosmic-motion-label>Movimento</label><div class="inj-cosmic-motion" role="group" aria-label="Motion">'+
   '<button data-cosmic-motion="static" type="button" aria-pressed="false">Statico</button>'+
   '<button data-cosmic-motion="soft" type="button" aria-pressed="false">Soft</button>'+
   '<button data-cosmic-motion="full" type="button" aria-pressed="false">Full</button></div>'+
   '<div class="inj-cosmic-toggles">'+
   '<label><input type="checkbox" data-cosmic-flag="density" checked><span data-cosmic-density-label>Stelle intense</span></label>'+
   '<label><input type="checkbox" data-cosmic-flag="planets" checked><span data-cosmic-planets-label>Pianeti</span></label>'+
   '<label><input type="checkbox" data-cosmic-flag="meteors" checked><span data-cosmic-meteors-label>Meteore</span></label>'+
   '<label><input type="checkbox" data-cosmic-flag="powerSave"><span data-cosmic-save-label>Battery Safe</span></label>'+
   '</div></div></div></details>';
 }
 function updateLabels(){
  const en=isEn();
  for(const group of document.querySelectorAll('.inj-cosmic-control')){
   const title=group.querySelector('[data-cosmic-heading]');
   const note=group.querySelector('[data-cosmic-subtitle]');
   const hint=group.querySelector('[data-cosmic-hint]');
   if(title)title.textContent='Cosmic Backgrounds';
   if(note)note.textContent=en?'6 animated space scenes · planets and stars':'6 ambientazioni animate · stelle e pianeti';
   if(hint)hint.textContent=en?'Planets, stars and meteors pass behind cards. Data stays clear.':'Pianeti, stelle e meteore passano dietro le card, senza coprire i dati.';
   const names=group.querySelectorAll('[data-cosmic-scene]');
   names.forEach(b=>{const scene=SCENES.find(v=>v[0]===b.dataset.cosmicScene);if(scene)b.textContent=en?scene[2]:scene[1]});
   const motion=group.querySelectorAll('[data-cosmic-motion]');
   motion.forEach(b=>{if(b.dataset.cosmicMotion==='static')b.textContent=en?'Static':'Statico'});
   const labels={
    '[data-cosmic-motion-label]':en?'Movement':'Movimento',
    '[data-cosmic-density-label]':en?'Dense stars':'Stelle intense',
    '[data-cosmic-planets-label]':en?'Planets':'Pianeti',
    '[data-cosmic-meteors-label]':en?'Meteors':'Meteore',
    '[data-cosmic-save-label]':'Battery Safe'
   };
   for(const selector of Object.keys(labels)){
    const el=group.querySelector(selector);if(el)el.textContent=labels[selector];
   }
  }
  render();
 }
 function mountControls(){
  const theme=document.getElementById('themeControl');
  if(theme&&!document.getElementById('injCosmicHome')){
   const shell=document.createElement('div');
   shell.id='injCosmicHome';
   shell.innerHTML=controlsHTML();
   const details=shell.firstElementChild;
   details.open=false;
   theme.insertAdjacentElement('afterend',details);
   details.id='injCosmicHome';
   // Keep the dedicated category independent of the original Theme picker.
  }
  const toolbar=document.querySelector('body .ws-toolbar');
  if(toolbar&&!launch){
   launch=document.createElement('button');
   launch.type='button';launch.id='injCosmicLauncher';launch.className='inj-cosmic-launcher';
   launch.setAttribute('aria-haspopup','dialog');launch.setAttribute('aria-expanded','false');
   launch.textContent='✦ Spazio';
   const before=document.getElementById('wsFull');
   if(before)before.insertAdjacentElement('beforebegin',launch);else toolbar.append(launch);
   popup=document.createElement('div');popup.id='injCosmicPopup';
   popup.className='inj-cosmic-popup';popup.setAttribute('role','dialog');
   popup.setAttribute('aria-label','Cosmic Backgrounds');popup.hidden=true;
   popup.innerHTML=controlsHTML();document.body.append(popup);
   const inside=popup.querySelector('details');if(inside)inside.open=true;
   launch.addEventListener('click',()=>{
    popup.hidden=!popup.hidden;
    launch.setAttribute('aria-expanded',String(!popup.hidden));
    if(!popup.hidden)popup.scrollTop=0;
   });
   document.addEventListener('pointerdown',e=>{
    if(popup&&!popup.hidden&&!popup.contains(e.target)&&e.target!==launch){popup.hidden=true;launch.setAttribute('aria-expanded','false')}
   });
   document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&popup&&!popup.hidden){popup.hidden=true;launch.setAttribute('aria-expanded','false');e.stopPropagation()}
   },true);
  }
  updateLabels();
 }
 // Event delegation keeps the controls working if another settings script
 // rebuilds the menu or when iOS resumes the installed PWA.
 document.addEventListener('click',function(event){
  const scene=event.target.closest('[data-cosmic-scene]');
  if(scene){event.preventDefault();event.stopPropagation();select(scene.dataset.cosmicScene);return}
  const motion=event.target.closest('[data-cosmic-motion]');
  if(motion){event.preventDefault();event.stopPropagation();state.motion=motion.dataset.cosmicMotion;persist();render()}
 },true);
 document.addEventListener('change',function(event){
  const box=event.target.closest('[data-cosmic-flag]');if(!box)return;
  const flag=box.dataset.cosmicFlag;
  if(flag==='density')state.density=box.checked?'rich':'soft';
  else if(Object.prototype.hasOwnProperty.call(state,flag))state[flag]=box.checked;
  persist();render();
 },true);
 function refresh(){makeSky();mountControls();render()}
 function initialize(){
  refresh();
  document.addEventListener('visibilitychange',()=>{
   if(layer)layer.classList.toggle('inj-cosmic-paused',document.hidden);
  });
  window.addEventListener('pageshow',refresh);
  window.addEventListener('injnode:languagechange',updateLabels);
  window.addEventListener('storage',e=>{
   if(![KEY,MOTION,DENSITY,PLANETS,METEORS,SAVE].includes(e.key))return;
   state.scene=allowedScene(get(KEY,'off'));
   state.motion=['static','soft','full'].includes(get(MOTION,'soft'))?get(MOTION,'soft'):'soft';
   state.density=get(DENSITY,'rich')==='soft'?'soft':'rich';
   state.planets=get(PLANETS,'1')!=='0';state.meteors=get(METEORS,'1')!=='0';
   state.powerSave=get(SAVE,'0')==='1';
   render();
  });
  window.addEventListener('message',e=>{
   if(e.origin!==location.origin||e.data?.type!=='injnode:cosmic:sync')return;
   state.scene=allowedScene(e.data.scene);render();
  });
 }
 window.INJNodeCosmic={select,refresh,getState:()=>({...state})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
 else initialize();
})();
